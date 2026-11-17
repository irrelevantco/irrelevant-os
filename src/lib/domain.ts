import { z } from "zod";
export const STATUSES = [
  "Discovered",
  "Researching",
  "Qualified",
  "Ready for Outreach",
  "Contacted",
  "Replied",
  "Meeting Scheduled",
  "Audit Delivered",
  "Proposal Sent",
  "Won",
  "Lost",
  "Suppressed",
] as const;
export type PipelineStatus = (typeof STATUSES)[number];
export const CLOSED_STATUSES: readonly PipelineStatus[] = [
  "Won",
  "Lost",
  "Suppressed",
];
export const statusSchema = z.enum(STATUSES);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null);
export const urlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((s) => {
    if (!s) return true;
    try {
      const u = new URL(s);
      return (
        ["http:", "https:"].includes(u.protocol) &&
        !!u.hostname &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  }, "Use a full http:// or https:// URL without embedded credentials.")
  .transform((s) => (s ? new URL(s).toString() : null));
export const emailSchema = z
  .union([z.literal(""), z.email().max(254)])
  .transform((s) => s || null);
export const followUpSchema = z
  .string()
  .refine(
    (s) =>
      !s ||
      (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
        !Number.isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s),
    "Choose a valid date.",
  )
  .transform((s) => s || null);
export const valueSchema = z
  .string()
  .trim()
  .refine(
    (s) => !s || /^\d{1,7}(\.\d{1,2})?$/.test(s),
    "Enter a positive dollar amount with up to two decimal places.",
  )
  .transform((s) => (s ? Math.round(Number(s) * 100) : null))
  .refine(
    (n) => n === null || n <= 100000000,
    "Maximum estimate is $1,000,000.",
  );
export const businessSchema = z.object({
  name: z.string().trim().min(2).max(160),
  website: urlSchema,
  email: emailSchema,
  phone: optionalText(40),
  industry: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(160),
  contact_page: urlSchema,
  social_urls: z
    .string()
    .max(20000)
    .transform((s) =>
      s
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .pipe(z.array(urlSchema).max(10)),
});
export const prospectSchema = businessSchema.extend({
  source_url: urlSchema,
  source_notes: optionalText(2000),
  estimated_value_cents: valueSchema,
  next_follow_up: followUpSchema,
});
export const leadUpdateSchema = z.object({
  id: z.uuid(),
  status: statusSchema,
  estimated_value_cents: valueSchema,
  next_follow_up: followUpSchema,
});
export const noteSchema = z.object({
  lead_id: z.uuid(),
  body: z.string().trim().min(1, "Write a note first.").max(5000),
});
export const organizationSchema = z.object({
  name: z.string().trim().min(2).max(100),
});
export const authSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
});
export type ActionState = { error?: string; success?: string };
export function validationMessage(error: z.ZodError) {
  const first = error.issues[0];
  return `${first.path.join(" ")}: ${first.message}`;
}
