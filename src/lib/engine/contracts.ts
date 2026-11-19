import { z } from "zod";
import { US_STATES, FREE_CATEGORIES } from "../agents/discovery-options";

export const ENGINE_CATEGORIES = Object.keys(FREE_CATEGORIES) as [
  keyof typeof FREE_CATEGORIES,
  ...(keyof typeof FREE_CATEGORIES)[],
];
export const territorySchema = z.object({
  city: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[\p{L} .'-]+$/u),
  state: z.string().refine((s) => US_STATES.includes(s)),
});
export const TERRITORIES = [
  ...[
    "Erie",
    "Oil City",
    "Titusville",
    "Union City",
    "Waterford",
    "Warren",
    "Franklin",
    "Bradford",
    "Meadville",
    "Corry",
    "Edinboro",
    "Girard",
    "North East",
    "Fairview",
  ].map((city) => ({ city, state: "PA" })),
  ...[
    "Jamestown",
    "Angola",
    "Dunkirk",
    "Fredonia",
    "Westfield",
    "Ripley",
    "Lakewood",
    "Silver Creek",
    "Falconer",
  ].map((city) => ({ city, state: "NY" })),
  ...[
    "Conneaut",
    "Ashtabula",
    "Akron",
    "Geneva",
    "Madison",
    "Painesville",
    "Mentor",
    "Chardon",
    "Kent",
    "Ravenna",
    "Stow",
    "Cuyahoga Falls",
    "Youngstown",
    "Warren",
    "Niles",
    "Hudson",
    "Barberton",
  ].map((city) => ({ city, state: "OH" })),
];
export const engineSettingsSchema = z.object({
  enabled: z.boolean(),
  target_leads: z.coerce.number().int().min(1000).max(100000),
  contact_goal: z.coerce.number().int().min(1).max(100000),
  research_enabled: z.boolean(),
  discovery_enabled: z.boolean(),
  auto_import: z.boolean(),
  daily_research_limit: z.coerce.number().int().min(1).max(50),
  daily_discovery_limit: z.coerce.number().int().min(1).max(56),
  ai_provider: z.enum(["rules", "ollama", "openai"]).default("rules"),
  ai_model: z
    .string()
    .trim()
    .max(100)
    .regex(/^[\w./:-]*$/)
    .default(""),
  territories: z
    .array(territorySchema)
    .min(1)
    .max(50)
    .refine(
      (a) =>
        new Set(a.map((t) => `${t.city.toLowerCase()}:${t.state}`)).size ===
        a.length,
      "Each territory must be unique.",
    ),
  categories: z
    .array(z.enum(ENGINE_CATEGORIES))
    .min(1)
    .max(13)
    .refine((a) => new Set(a).size === a.length),
});
export const campaignPolicySchema = z.object({
  daily_limit: z.coerce.number().int().min(1).max(500),
  total_limit: z.coerce.number().int().min(1).max(1000),
  follow_ups: z.boolean(),
  auto_replies: z.boolean(),
  auto_meetings: z.boolean(),
  confirmed: z.literal(true),
  expected_revision: z.coerce.number().int().nonnegative(),
});
export const inventorySchema = z.object({
  organization_id: z.uuid(),
  active_leads: z.number(),
  trashed_leads: z.number().nullable(),
  businesses: z.number(),
  with_public_email: z.number(),
  approved_reviews: z.number(),
  imported_rows: z.number(),
  duplicates_skipped: z.number(),
  invalid_rows: z.number(),
  preview_rows: z.number(),
  by_status: z.record(z.string(), z.number()),
});
export type EngineSettings = z.infer<typeof engineSettingsSchema>;
export const DEFAULT_SETTINGS: EngineSettings = {
  enabled: false,
  target_leads: 1000,
  contact_goal: 10000,
  research_enabled: true,
  discovery_enabled: true,
  auto_import: false,
  daily_research_limit: 25,
  daily_discovery_limit: 24,
  territories: TERRITORIES,
  categories: ENGINE_CATEGORIES,
  ai_provider: "rules",
  ai_model: "",
};
export const engineStateSchema = z.object({
  settings: engineSettingsSchema
    .extend({
      campaign_revision: z.number(),
      campaign_until: z.string().nullable(),
      campaign_daily_limit: z.number(),
      campaign_total_limit: z.number(),
      follow_ups: z.boolean(),
      auto_replies: z.boolean(),
      auto_meetings: z.boolean(),
      last_tick_at: z.string().nullable(),
      last_error: z.string().nullable(),
      sent_count: z.number(),
      sent_count_checked_at: z.string().nullable(),
    })
    .nullable(),
  sent: z.number(),
  attempts_today: z.number(),
  campaign_attempts: z.number(),
  paused: z.boolean(),
  jobs: z.array(
    z.object({
      id: z.uuid(),
      lead_id: z.uuid().nullable(),
      kind: z.string(),
      status: z.string(),
      error: z.string().nullable(),
      business_name: z.string().nullable(),
      created_at: z.string(),
      result: z.unknown().nullable(),
      approved_at: z.string().nullable().optional(),
    }),
  ),
  replies: z.array(
    z.object({
      id: z.uuid(),
      lead_id: z.uuid(),
      business_name: z.string(),
      body: z.string(),
      classification: z.string(),
      received_at: z.string(),
      handled_at: z.string().nullable(),
      error: z.string().nullable(),
    }),
  ),
  appointments: z.array(
    z.object({ starts_at: z.string(), ends_at: z.string() }),
  ),
  outbox: z.array(
    z.object({
      id: z.uuid(),
      lead_id: z.uuid(),
      business_name: z.string(),
      kind: z.string(),
      status: z.string(),
      recipient: z.string(),
      subject: z.string(),
      body: z.string(),
      error: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
  holds: z.array(
    z.object({ id: z.uuid(), business_name: z.string(), reason: z.string() }),
  ),
  preview: z.array(
    z.object({
      business_name: z.string(),
      recipient: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
  ),
});
export type EngineState = z.infer<typeof engineStateSchema>;
export const THREAD_READ_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";
