import { z } from "zod";
import { SENDER_EMAIL, emailRaw } from "./contracts";
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events.owned",
];
export const tokenSchema = z.object({
  access_token: z.string().min(1).max(12000),
  refresh_token: z.string().min(1).max(12000).optional(),
  expires_in: z.number().positive().max(86400),
  scope: z.string().max(4000),
});
export async function googleJson(
  url: string,
  init: RequestInit,
  transport: typeof fetch = fetch,
) {
  const response = await transport(url, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error(
      `Google request rejected (${response.status}). No automatic retry.`,
    );
  const text = await response.text();
  if (text.length > 1000000) throw Error("Google response exceeded its limit.");
  return JSON.parse(text) as unknown;
}
export async function verifyGoogleAccount(
  accessToken: string,
  transport: typeof fetch = fetch,
) {
  const account = z
    .object({ email: z.email(), email_verified: z.boolean() })
    .parse(
      await googleJson(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } },
        transport,
      ),
    );
  if (!account.email_verified || account.email.toLowerCase() !== SENDER_EMAIL)
    throw Error(
      "Connect contact.irrelevantcollective@gmail.com, with a verified email address.",
    );
  return account.email.toLowerCase();
}
export async function gmailSend(
  token: string,
  message: { recipient: string; subject: string; body: string },
  transport: typeof fetch = fetch,
) {
  return z
    .object({
      id: z.string().min(1).max(200),
      threadId: z.string().max(200).optional(),
    })
    .parse(
      await googleJson(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            raw: emailRaw(message.recipient, message.subject, message.body),
          }),
        },
        transport,
      ),
    );
}
export const calendarId = (id: string) =>
  "ir" + z.uuid().parse(id).replaceAll("-", "");
export async function calendarSave(
  token: string,
  meeting: {
    id: string;
    starts_at: string;
    ends_at: string;
    kind: string;
    business_name: string;
    public_email: string | null;
    agreement_note: string;
  },
  invite: boolean,
  transport: typeof fetch = fetch,
) {
  const id = calendarId(meeting.id),
    base = "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  const prior = await transport(`${base}/${id}`, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const eventSchema = z.object({
    id: z.string(),
    htmlLink: z.url().optional(),
    status: z.string().optional(),
  });
  if (prior.ok) {
    const event = eventSchema.parse(await prior.json());
    if (event.status === "cancelled")
      throw Error(
        "The Google event is cancelled. Reconcile it before scheduling again.",
      );
    return { ...event, existing: true };
  }
  if (prior.status !== 404)
    throw Error(
      "Could not reconcile the Google event. No duplicate event was created.",
    );
  const busy = z
    .object({
      calendars: z.record(
        z.string(),
        z.object({
          busy: z.array(z.object({ start: z.string(), end: z.string() })),
          errors: z.array(z.unknown()).optional(),
        }),
      ),
    })
    .parse(
      await googleJson(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            timeMin: meeting.starts_at,
            timeMax: meeting.ends_at,
            items: [{ id: "primary" }],
          }),
        },
        transport,
      ),
    );
  if (
    !busy.calendars.primary ||
    busy.calendars.primary.errors?.length ||
    busy.calendars.primary.busy.length
  )
    throw Error(
      "The calendar is busy or availability could not be confirmed. No event was created.",
    );
  if (invite) z.email().parse(meeting.public_email);
  const saved = eventSchema.parse(
    await googleJson(
      `${base}?sendUpdates=${invite ? "all" : "none"}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          id,
          summary: `${meeting.kind === "call" ? "Call" : "Growth meeting"} / ${meeting.business_name}`,
          description: "A business growth conversation with iRRELEVANT CO.",
          start: { dateTime: meeting.starts_at, timeZone: "America/New_York" },
          end: { dateTime: meeting.ends_at, timeZone: "America/New_York" },
          ...(invite ? { attendees: [{ email: meeting.public_email }] } : {}),
        }),
      },
      transport,
    ),
  );
  return { ...saved, existing: false };
}
export async function calendarCancel(
  token: string,
  id: string,
  transport: typeof fetch = fetch,
) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarId(id)}`;
  const headers = { Authorization: `Bearer ${token}` };
  const prior = await transport(url, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (prior.status === 404 || prior.status === 410) return;
  if (!prior.ok)
    throw Error(
      "Google cancellation could not be reconciled. No retry was made.",
    );
  const event = z
    .object({ status: z.string().optional() })
    .parse(await prior.json());
  if (event.status === "cancelled") return;
  const result = await transport(`${url}?sendUpdates=all`, {
    method: "DELETE",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (![204, 404, 410].includes(result.status))
    throw Error(
      "Google did not confirm cancellation. Review the Calendar before another attempt.",
    );
}
