"use server";
import { requireContext } from "@/lib/context";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/domain";
import {
  automationSchema,
  meetingSchema,
  meetingTimes,
  decodeApprovalBody,
} from "@/lib/acquisition/contracts";
import { accessToken, rpc, credentialKeyId } from "@/lib/acquisition/google";
import {
  gmailSend,
  calendarSave,
  calendarCancel,
} from "@/lib/acquisition/google-http";
async function owner() {
  const c = await requireContext();
  if (c.role !== "owner") throw Error("Organization owner required.");
  return c;
}
function changed() {
  revalidatePath("/dashboard", "layout");
}
function failure(error: unknown): ActionState {
  return {
    error:
      error instanceof Error &&
      /^(Organization|Choose|Google|The calendar|The guest|Could not reconcile|Connect |Configure |Save |Draft|Recipient|Sender|A public|Sending|Five-message|This |Appointment|Agreed|No active|Invalid Calendar|Local )/.test(
        error.message,
      )
        ? error.message.slice(0, 300)
        : "The request was not completed. Check the configuration and saved records.",
  };
}
export async function saveAutomation(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { db, organization } = await owner();
    const settings = automationSchema.parse({
      ...Object.fromEntries(form),
      enabled: form.get("enabled") === "on",
      sending_enabled: form.get("sending_enabled") === "on",
      categories: form.getAll("categories"),
    });
    await rpc(db, "save_acquisition_settings", organization.id, settings);
    changed();
    return {
      success:
        "Controls saved. Hourly discovery runs while the desktop app is open and you are signed in; email still requires exact-message approval.",
    };
  } catch (e) {
    return failure(e);
  }
}
export async function saveMeeting(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { db, organization } = await owner();
    const parsed = meetingSchema.parse({
      ...Object.fromEntries(form),
      confirmed: form.get("confirmed") === "on",
    });
    const times = meetingTimes(parsed.local_start, parsed.duration);
    await rpc(db, "save_agreed_meeting", organization.id, {
      ...parsed,
      ...times,
      estimated_value_cents: parsed.estimated_value
        ? Math.round(Number(parsed.estimated_value) * 100)
        : null,
    });
    changed();
    return {
      success:
        "Agreed appointment recorded. Your opportunity estimate is now included once for this lead. Google Calendar has not been changed.",
    };
  } catch (e) {
    return failure(e);
  }
}
export async function cancelMeeting(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { db, organization } = await owner();
    await rpc(db, "cancel_sales_meeting", organization.id, {
      id: z.uuid().parse(form.get("id")),
    });
    changed();
    return {
      success:
        "Local appointment cancelled. Meeting-backed value will refresh.",
    };
  } catch (e) {
    return failure(e);
  }
}
export async function sendApprovedEmail(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  let attempt: string | undefined;
  const c = await owner();
  try {
    const input = z
      .object({
        lead_id: z.uuid(),
        request_key: z.uuid(),
        draft_updated_at: z.string(),
        recipient: z.email(),
        expected_body_base64: z.string().min(1).max(75000),
        subject: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .refine((s) => !/[\r\n]/.test(s)),
        confirmed: z.literal("on"),
      })
      .parse(Object.fromEntries(form));
    const { expected_body_base64, ...approval } = input;
    const expectedBody = decodeApprovalBody(expected_body_base64);
    const token = await accessToken(c.db, c.organization.id, c.user.id);
    const result = z.object({ id: z.uuid() }).parse(
      await rpc(c.db, "approve_email_delivery", c.organization.id, {
        ...approval,
        expected_body: expectedBody,
        confirmed: true,
      }),
    );
    const raw = await rpc(c.db, "claim_email_delivery", c.organization.id, {
      id: result.id,
    });
    if (!raw)
      return {
        error:
          "This approval was already processed. Check delivery history; no duplicate was sent.",
      };
    const message = z
      .object({
        id: z.uuid(),
        recipient: z.email(),
        subject: z.string(),
        body: z.string(),
      })
      .parse(raw);
    attempt = message.id;
    const sent = await gmailSend(token, message);
    await rpc(c.db, "finish_email_delivery", c.organization.id, {
      id: message.id,
      message_id: sent.id,
      thread_id: sent.threadId ?? null,
    });
    changed();
    return {
      success:
        "Gmail confirmed this approved message. Actual outbound contact is logged in the CRM.",
    };
  } catch (error) {
    if (attempt) {
      await rpc(c.db, "finish_email_delivery", c.organization.id, {
        id: attempt,
      }).catch(() => undefined);
      changed();
      return {
        error:
          "Delivery is uncertain. Check Gmail and delivery history before any further attempt. Nothing was automatically retried.",
      };
    }
    return failure(error);
  }
}
export async function syncMeeting(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const c = await owner();
  let claimed: string | undefined;
  try {
    const input = z
      .object({ id: z.uuid(), confirmed: z.literal("on") })
      .parse(Object.fromEntries(form));
    const invite = form.get("invite_guest") === "on";
    const token = await accessToken(c.db, c.organization.id, c.user.id);
    const state = z
      .object({
        meetings: z.array(
          z.object({
            id: z.uuid(),
            business_name: z.string(),
            public_email: z.string().nullable(),
            agreement_note: z.string(),
            starts_at: z.string(),
            ends_at: z.string(),
            kind: z.string(),
          }),
        ),
      })
      .parse(await rpc(c.db, "acquisition_state", c.organization.id));
    const meeting = state.meetings.find((m) => m.id === input.id);
    if (!meeting) throw Error("Appointment not found.");
    if (invite) {
      z.email().parse(meeting.public_email);
      if (
        String(form.get("expected_email")).toLowerCase() !==
        meeting.public_email?.toLowerCase()
      )
        throw Error("The guest contact changed. Review the appointment again.");
    }
    await rpc(c.db, "calendar_meeting", c.organization.id, {
      id: input.id,
      op: "claim",
      invite_guest: invite,
    });
    claimed = input.id;
    const event = await calendarSave(token, meeting, invite);
    await rpc(c.db, "calendar_meeting", c.organization.id, {
      id: input.id,
      op: "finish",
      event_id: event.id,
      calendar_url: event.htmlLink ?? null,
      ...(!event.existing ? { invite_guest: invite } : {}),
    });
    changed();
    return {
      success: event.existing
        ? "Existing Google event reconciled. No new invitation was requested."
        : invite
          ? "Google Calendar confirmed the event and was asked to notify the approved guest."
          : "Google Calendar confirmed your appointment. No guest invitation was requested.",
    };
  } catch (error) {
    if (claimed) {
      await rpc(c.db, "calendar_meeting", c.organization.id, {
        id: claimed,
        op: "finish",
      }).catch(() => undefined);
      changed();
    }
    return failure(error);
  }
}
export async function disconnectGoogle(): Promise<ActionState> {
  const c = await owner();
  // Remove this runtime's credentials. Other connected runtimes retain their own grants.
  const r = await c.db.rpc("google_connection", {
    org: c.organization.id,
    payload: { op: "delete", key_id: credentialKeyId() },
  });
  if (r.error) return { error: "Could not disconnect Google." };
  changed();
  return {
    success:
      "Google connection removed from this app. Other connected installations are separate. You can revoke the app grant in your Google account.",
  };
}
export async function cancelGoogleMeeting(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const c = await owner();
  let claimed: string | undefined;
  try {
    const input = z
      .object({ id: z.uuid(), confirmed: z.literal("on") })
      .parse(Object.fromEntries(form));
    const token = await accessToken(c.db, c.organization.id, c.user.id);
    await rpc(c.db, "calendar_meeting", c.organization.id, {
      id: input.id,
      op: "claim_cancel",
    });
    claimed = input.id;
    await calendarCancel(token, input.id);
    await rpc(c.db, "calendar_meeting", c.organization.id, {
      id: input.id,
      op: "cancelled",
    });
    changed();
    return {
      success:
        "Google cancellation confirmed. The local appointment and meeting-backed value are updated.",
    };
  } catch (error) {
    if (claimed) {
      await rpc(c.db, "calendar_meeting", c.organization.id, {
        id: claimed,
        op: "finish",
      }).catch(() => undefined);
      changed();
    }
    return failure(error);
  }
}
