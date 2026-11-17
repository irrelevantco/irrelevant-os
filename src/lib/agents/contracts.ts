import { z } from "zod";
export const JOB_KINDS = [
  "research_plan",
  "outreach_draft",
  "follow_up",
  "discovery",
] as const;
export const settingsSchema = z.object({
  paused: z.boolean(),
  daily_job_limit: z.coerce.number().int().min(1).max(25),
  explee_daily_credit_limit: z.coerce.number().min(0).max(50),
  sender_name: z.string().trim().max(160),
  sender_email: z.union([z.email().max(254), z.literal("")]),
  postal_address: z.string().trim().max(500),
});
export const discoverySchema = z.object({
  industry: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(160),
  count: z.coerce.number().int().min(1).max(10),
});
export const enqueueSchema = z.object({
  kind: z.enum(JOB_KINDS),
  lead: z.union([z.uuid(), z.literal("")]).default(""),
  request_key: z.uuid(),
});
export const eventSchema = z.object({
  lead: z.uuid(),
  kind: z.enum([
    "outbound_email",
    "outbound_call",
    "reply",
    "positive_reply",
    "opt_out",
  ]),
  date: z.iso.date(),
  note: z.string().trim().min(1).max(2000),
  confirm: z.literal("on"),
});
export const claimedJobSchema = z.object({
  job: z.object({
    id: z.uuid(),
    organization_id: z.uuid(),
    lead_id: z.uuid().nullable(),
    kind: z.enum(JOB_KINDS),
    lease_token: z.uuid(),
    input: z.unknown(),
    reserved_credits: z.number(),
  }),
  business: z
    .object({
      name: z.string(),
      industry: z.string(),
      location: z.string(),
      website: z.string().nullable(),
    })
    .nullable(),
  review: z
    .object({ revision: z.number(), suggested_offer: z.string() })
    .nullable(),
  points: z.array(
    z.object({
      pillar: z.string(),
      observation: z.string(),
      recommendation: z.string(),
      source_url: z.url(),
      confidence: z.string(),
      verification_status: z.literal("verified"),
    }),
  ),
  settings: settingsSchema,
});
export type ClaimedJob = z.infer<typeof claimedJobSchema>;
