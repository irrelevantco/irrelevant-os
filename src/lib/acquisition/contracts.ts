import { z } from "zod";
import { US_STATES } from "../agents/discovery-options";
export const SENDER_EMAIL = "contact.irrelevantcollective@gmail.com";
export const CATEGORIES = [
  "cleaning",
  "hvac",
  "plumber",
  "roofer",
  "electrician",
  "gardener",
  "builder",
] as const;
export const automationSchema = z.object({
  enabled: z.boolean(),
  categories: z
    .array(z.enum(CATEGORIES))
    .min(1)
    .max(7)
    .transform((value) => [...new Set(value)]),
  city: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[\p{L} .'-]+$/u),
  state: z.string().refine((value) => US_STATES.includes(value)),
  sending_enabled: z.boolean(),
});
export const meetingSchema = z.object({
  lead_id: z.uuid(),
  local_start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  duration: z.coerce.number().int().min(15).max(120),
  kind: z.enum(["call", "meeting"]),
  agreement_note: z.string().trim().min(10).max(2000),
  estimated_value: z
    .string()
    .trim()
    .regex(/^(\d{1,7}(\.\d{1,2})?)?$/),
  confirmed: z.literal(true),
  request_key: z.uuid(),
});
export function easternParts(date: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
}
export function meetingTimes(local: string, minutes: number, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw Error("Choose an Eastern date and time.");
  const [year, month, day, hour, minute] = local.match(/\d+/g)!.map(Number);
  const noon = new Date(Date.UTC(year, month - 1, day, 12));
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  })
    .formatToParts(noon)
    .find((p) => p.type === "timeZoneName")!.value;
  const offset = Number(zone.replace("GMT", ""));
  const start = new Date(Date.UTC(year, month - 1, day, hour - offset, minute)),
    end = new Date(start.getTime() + minutes * 60000);
  const p = easternParts(start),
    q = easternParts(end);
  if (
    `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` !== local ||
    !Number.isInteger(minutes) ||
    minutes < 15 ||
    minutes > 120 ||
    start <= now ||
    ["Sat", "Sun"].includes(p.weekday) ||
    Number(p.hour) < 7 ||
    Number(q.hour) * 60 + Number(q.minute) > 900 ||
    p.day !== q.day
  )
    throw Error(
      "Choose a future Monday–Friday appointment entirely between 7 a.m. and 3 p.m. Eastern, 15–120 minutes long.",
    );
  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}
export function messageBody(body: string, name: string, address: string) {
  if (!body.trim() || !name.trim() || !address.trim())
    throw Error(
      "Save a message, sender name and business postal address first.",
    );
  return `${body}\n\n${name}\niRRELEVANT CO\n${SENDER_EMAIL}\n${address}\n\nTo opt out of further contact, reply and let us know.`;
}
// HTML multipart form submission normalizes line endings, including hidden
// inputs. Use an ASCII envelope so the exact saved UTF-8 preview survives it.
export function encodeApprovalBody(body: string) {
  z.string().min(1).max(14000).parse(body);
  return Buffer.from(body, "utf8").toString("base64");
}
export function decodeApprovalBody(encoded: string) {
  const invalid = () =>
    new Error(
      "Draft approval preview is invalid. Reload the page and review it again.",
    );
  if (
    !z
      .string()
      .min(1)
      .max(75000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .safeParse(encoded).success
  )
    throw invalid();
  const bytes = Buffer.from(encoded, "base64");
  const body = bytes.toString("utf8");
  if (
    bytes.toString("base64") !== encoded ||
    !Buffer.from(body, "utf8").equals(bytes) ||
    !body.length ||
    body.length > 14000
  )
    throw invalid();
  return body;
}
export function emailRaw(
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string,
  automaticReply = false,
) {
  z.email().parse(to);
  if (/[\r\n]/.test(to + subject) || !subject.trim() || subject.length > 160)
    throw Error("Invalid email headers.");
  if (inReplyTo && !/^<[^<>\r\n\s]{1,300}>$/.test(inReplyTo))
    throw Error("Invalid email reply header.");
  return Buffer.from(
    `From: iRRELEVANT CO <${SENDER_EMAIL}>\r\nTo: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=\r\n${inReplyTo ? `In-Reply-To: ${inReplyTo}\r\nReferences: ${inReplyTo}\r\n` : ""}${automaticReply ? "Auto-Submitted: auto-replied\r\nX-Auto-Response-Suppress: All\r\n" : ""}MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(
      body,
    )
      .toString("base64")
      .match(/.{1,76}/g)!
      .join("\r\n")}`,
  ).toString("base64url");
}
