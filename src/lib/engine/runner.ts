import "server-only";
import { z } from "zod";
import {
  accessToken,
  connection,
  credentialKeyId,
  googleConfigured,
  rpc,
  type Db,
} from "../acquisition/google";
import { gmailSend, calendarSave } from "../acquisition/google-http";
import { runNext } from "../agents/worker";
import { engineRpc } from "./rpc";
import { engineStateSchema, THREAD_READ_SCOPE } from "./contracts";
import {
  gmailHistory,
  gmailSentCount,
  gmailThread,
  gmailPriorContact,
} from "./mail";
import { availableSlots } from "./calendar";

const threadSchema = z.object({
  lead_id: z.uuid(),
  thread_id: z.string(),
  recipient: z.email(),
  since: z.string(),
});
type Thread = z.infer<typeof threadSchema>;
type Context = { db: Db; organization: { id: string }; user: { id: string } };
export async function syncTrackedThread(
  db: Db,
  org: string,
  token: string,
  thread: Thread,
  transport: typeof fetch = fetch,
) {
  try {
    const data = await gmailThread(
      token,
      thread.thread_id,
      thread.recipient,
      thread.since,
      transport,
    );
    for (const reply of data.replies)
      await engineRpc(db, org, "record_reply", {
        ...reply,
        lead_id: thread.lead_id,
      });
    await engineRpc(db, org, "thread_checked", {
      lead_id: thread.lead_id,
      thread_id: thread.thread_id,
      rfc_message_id: data.rfc_message_id,
    });
  } catch (error) {
    await engineRpc(db, org, "thread_checked", {
      lead_id: thread.lead_id,
      thread_id: thread.thread_id,
      error:
        "Tracked conversation could not be synchronized; automatic follow-up is held.",
    });
    throw error;
  }
}
async function syncMailbox(
  db: Db,
  org: string,
  token: string,
  key: string,
  transport: typeof fetch,
) {
  const previous = z
    .object({ history_id: z.string(), page_token: z.string().nullable() })
    .nullable()
    .parse(await engineRpc(db, org, "mail_cursor", { key_id: key }));
  let history;
  try {
    history = await gmailHistory(token, previous ?? {}, transport);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("(404)"))
      throw error;
    history = await gmailHistory(token, {}, transport); // Expired Gmail history: bootstrap tracked conversations again.
  }
  const changed = history.thread_ids.length
    ? z.array(threadSchema).parse(
        await engineRpc(db, org, "threads", {
          thread_ids: history.thread_ids,
        }),
      )
    : [];
  const bootstrap = z
    .array(threadSchema)
    .parse(await engineRpc(db, org, "threads"));
  const threads = [
    ...new Map(
      [...changed, ...bootstrap.slice(0, 1)].map((thread) => [
        thread.thread_id,
        thread,
      ]),
    ).values(),
  ];
  // Bounded read-only concurrency. Every write is idempotent by Gmail message ID.
  for (let start = 0; start < threads.length; start += 10) {
    const results = await Promise.allSettled(
      threads
        .slice(start, start + 10)
        .map((thread) => syncTrackedThread(db, org, token, thread, transport)),
    );
    if (results.some((result) => result.status === "rejected"))
      throw Error(
        "Google tracked-thread synchronization failed. Automatic sending is held.",
      );
  }
  await engineRpc(db, org, "save_mail_cursor", {
    key_id: key,
    expected_history_id: previous?.history_id ?? null,
    history_id: history.history_id,
    page_token: history.page_token,
  });
}
const deliverySchema = z.object({
  id: z.uuid(),
  lead_id: z.uuid(),
  recipient: z.email(),
  subject: z.string(),
  body: z.string(),
  kind: z.string(),
  thread_id: z.string().nullable(),
  rfc_message_id: z.string().nullable().optional(),
  reply_id: z.string().nullable().optional(),
});
async function deliver(
  db: Db,
  org: string,
  token: string,
  key: string,
  id: string,
  transport: typeof fetch,
) {
  const preview = deliverySchema.parse(
    await engineRpc(db, org, "delivery", { id }),
  );
  if (preview.kind === "intro") {
    const previous = await gmailPriorContact(
      token,
      preview.recipient,
      transport,
    );
    if (previous) {
      await engineRpc(db, org, "hold_lead", {
        lead_id: preview.lead_id,
        reason: `Existing Gmail sent history (${previous.id}, thread ${previous.threadId}) requires manual review before a campaign introduction.`,
      });
      return "Existing Gmail contact found; this prospect was held for manual review.";
    }
  } else {
    const tracked = z.array(threadSchema).parse(
      await engineRpc(db, org, "threads", {
        thread_ids: preview.thread_id ? [preview.thread_id] : [],
      }),
    );
    const thread = tracked.find((t) => t.lead_id === preview.lead_id);
    if (!thread)
      return "No current tracked conversation is available; no automatic reply was sent.";
    await syncTrackedThread(db, org, token, thread, transport);
  }
  const claimed = await engineRpc(db, org, "claim_send", { id, key_id: key });
  if (!claimed)
    return "No campaign send is currently eligible; limits and reply checks remain active.";
  const message = deliverySchema.parse(claimed);
  try {
    const result = await gmailSend(
      token,
      {
        ...message,
        automatic_reply: ["reply", "offer", "confirmation"].includes(
          message.kind,
        ),
      },
      transport,
    );
    await rpc(db, "finish_email_delivery", org, {
      id,
      message_id: result.id,
      thread_id: result.threadId ?? null,
    });
    await engineRpc(db, org, "ack_sent", { id });
    return "Gmail confirmed one policy-approved campaign message.";
  } catch {
    await rpc(db, "finish_email_delivery", org, { id }).catch(() => undefined);
    throw Error(
      "Google delivery is uncertain. Further automatic messages are held until you reconcile it; no automatic retry was queued.",
    );
  }
}
async function automaticMail(
  c: Context,
  state: z.infer<typeof engineStateSchema>,
  transport: typeof fetch,
) {
  const { db, organization, user } = c,
    org = organization.id,
    settings = state.settings;
  if (
    !settings?.campaign_until ||
    new Date(settings.campaign_until) <= new Date() ||
    !googleConfigured()
  )
    return "No active campaign in this runtime.";
  const key = credentialKeyId(),
    connected = await connection(db, org);
  if (!connected?.scopes.includes(THREAD_READ_SCOPE))
    return "Renew tracked-thread Gmail permission before activating automatic outreach.";
  const token = await accessToken(db, org, user.id);
  const count = await gmailSentCount(token, transport);
  await engineRpc(db, org, "account_usage", { count, key_id: key });
  await syncMailbox(db, org, token, key, transport);
  if (count >= 500)
    return "Observed Gmail volume reached the account allowance; no campaign message was sent.";
  const pendingReply = z
    .object({
      reply: z.object({
        id: z.uuid(),
        lead_id: z.uuid(),
        classification: z.string(),
        body: z.string(),
        selected_option: z.number().nullable(),
      }),
      offer: z
        .object({
          id: z.uuid(),
          state: z.string(),
          meeting_id: z.string().nullable(),
        })
        .nullable(),
    })
    .nullable()
    .parse(await engineRpc(db, org, "next_reply"));
  if (
    pendingReply &&
    ((settings.auto_meetings &&
      ["positive", "selection"].includes(pendingReply.reply.classification)) ||
      (settings.auto_replies &&
        pendingReply.reply.classification === "positive"))
  ) {
    const { reply } = pendingReply;
    try {
      if (reply.classification === "selection" && settings.auto_meetings) {
        if (pendingReply.offer?.state === "booked") {
          await engineRpc(db, org, "reply_error", {
            reply_id: reply.id,
            error:
              "An appointment is already booked. Review this reply manually for any requested change.",
          });
          return "An existing appointment was kept; the new reply needs manual review.";
        }
        if (!pendingReply.offer)
          throw Error(
            "The reply did not match a current appointment offer; review it manually.",
          );
        const booked = z
          .object({
            meeting: z.object({
              id: z.uuid(),
              lead_id: z.uuid(),
              starts_at: z.string(),
              ends_at: z.string(),
              kind: z.string(),
              agreement_note: z.string(),
            }),
            offer_id: z.uuid(),
            lead_id: z.uuid(),
          })
          .parse(
            await engineRpc(db, org, "record_booking", {
              reply_id: reply.id,
              offer_id: pendingReply.offer.id,
              key_id: key,
            }),
          );
        const business = await db
          .from("leads")
          .select("business:businesses!inner(name,email)")
          .eq("organization_id", org)
          .eq("id", booked.lead_id)
          .single();
        if (!business.data) throw Error("Appointment business is unavailable.");
        let calendarClaimed = false;
        try {
          await rpc(db, "calendar_meeting", org, {
            id: booked.meeting.id,
            op: "claim",
            invite_guest: true,
          });
          calendarClaimed = true;
          const event = await calendarSave(
            token,
            {
              ...booked.meeting,
              business_name: business.data.business.name,
              public_email: business.data.business.email,
            },
            true,
            transport,
          );
          await rpc(db, "calendar_meeting", org, {
            id: booked.meeting.id,
            op: "finish",
            event_id: event.id,
            calendar_url: event.htmlLink ?? null,
            invite_guest: true,
          });
        } catch (error) {
          if (calendarClaimed)
            await rpc(db, "calendar_meeting", org, {
              id: booked.meeting.id,
              op: "finish",
            }).catch(() => undefined);
          throw error;
        }
        await engineRpc(db, org, "booking_result", {
          offer_id: booked.offer_id,
        });
        const prepared = z
          .object({ id: z.uuid() })
          .nullable()
          .parse(
            await engineRpc(db, org, "prepare_send", {
              kind: "confirmation",
              lead_id: reply.lead_id,
              reply_id: reply.id,
              offer_id: booked.offer_id,
              key_id: key,
            }),
          );
        return prepared
          ? await deliver(db, org, token, key, prepared.id, transport)
          : "The agreed Google appointment is recorded; its email confirmation is held.";
      }
      let offerId: string | undefined;
      if (settings.auto_meetings) {
        const slots = await availableSlots(
          token,
          state.appointments,
          transport,
        );
        if (slots.length !== 2)
          throw Error(
            "Two available appointment options could not be confirmed; review the reply manually.",
          );
        const offer = z
          .object({ id: z.uuid() })
          .nullable()
          .parse(
            await engineRpc(db, org, "offer_slots", {
              reply_id: reply.id,
              slots,
              key_id: key,
            }),
          );
        if (!offer) {
          await engineRpc(db, org, "reply_error", {
            reply_id: reply.id,
            error:
              "A current appointment offer already exists. Review this reply with that offer.",
          });
          return "Reply held alongside an existing appointment offer.";
        }
        offerId = offer.id;
      }
      const prepared = z
        .object({ id: z.uuid() })
        .nullable()
        .parse(
          await engineRpc(db, org, "prepare_send", {
            kind: offerId ? "offer" : "reply",
            lead_id: reply.lead_id,
            reply_id: reply.id,
            ...(offerId ? { offer_id: offerId } : {}),
            key_id: key,
          }),
        );
      return prepared
        ? await deliver(db, org, token, key, prepared.id, transport)
        : "Automatic reply is held by the current policy checks.";
    } catch (error) {
      await engineRpc(db, org, "reply_error", {
        reply_id: reply.id,
        error:
          error instanceof Error &&
          /^(Google|The |A |Appointment|Two |Campaign|Connect)/.test(
            error.message,
          )
            ? error.message.slice(0, 400)
            : "Automatic scheduling needs manual review. Check the conversation and Calendar before any further action.",
      });
      throw error;
    }
  }
  let next = z
    .object({
      id: z.uuid().optional(),
      lead_id: z.uuid().optional(),
      kind: z.string().optional(),
    })
    .nullable()
    .parse(await engineRpc(db, org, "next_send"));
  if (!next)
    return "No approved, sourced prospects or eligible follow-ups are waiting.";
  if (!next.id)
    next = z
      .object({ id: z.uuid() })
      .nullable()
      .parse(
        await engineRpc(db, org, "prepare_send", { ...next, key_id: key }),
      );
  return next?.id
    ? await deliver(db, org, token, key, next.id, transport)
    : "Campaign preparation found no eligible message.";
}

export async function tickEngine(c: Context, transport: typeof fetch = fetch) {
  const gate = z
    .object({ active: z.boolean(), reason: z.string().optional() })
    .parse(await engineRpc(c.db, c.organization.id, "tick"));
  if (!gate.active)
    return { enabled: false, message: gate.reason ?? "Engine paused." };
  const stateResult = await c.db.rpc("engine_state", {
    org: c.organization.id,
  });
  if (stateResult.error) throw Error("Could not load engine controls.");
  const state = engineStateSchema.parse(stateResult.data);
  const results = await Promise.allSettled([
    runNext(c.db, c.organization.id),
    automaticMail(c, state, transport),
  ]);
  const messages = results.map((result) =>
    result.status === "fulfilled"
      ? result.value
      : "Engine work needs review; check the latest error.",
  );
  const errors = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  const error = errors[0]?.reason;
  await engineRpc(c.db, c.organization.id, "report_error", {
    error: error
      ? error instanceof Error &&
        /^(Google|Campaign|Shared|Research|Connect|Automatic|Two )/.test(
          error.message,
        )
        ? error.message.slice(0, 400)
        : "Engine work was held. Review configuration, delivery status and pending replies before continuing."
      : null,
  });
  return { enabled: true, messages };
}
