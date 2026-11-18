import { z } from "zod";
export const acquisitionSchema = z.object({
  settings: z
    .object({
      enabled: z.boolean(),
      categories: z.array(z.string()),
      city: z.string(),
      state: z.string(),
      sending_enabled: z.boolean(),
      last_tick_at: z.string().nullable(),
    })
    .nullable(),
  meetings: z.array(
    z.object({
      id: z.uuid(),
      lead_id: z.uuid(),
      business_name: z.string(),
      public_email: z.string().nullable(),
      kind: z.string(),
      starts_at: z.string(),
      ends_at: z.string(),
      status: z.string(),
      agreement_note: z.string(),
      calendar_url: z.string().nullable(),
    }),
  ),
  deliveries: z.array(
    z.object({
      id: z.uuid(),
      lead_id: z.uuid(),
      recipient: z.string(),
      subject: z.string(),
      status: z.string(),
      error: z.string().nullable(),
      provider_message_id: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
  meeting_value_cents: z.number(),
  meetings_without_estimate: z.number(),
});
export type Acquisition = z.infer<typeof acquisitionSchema>;
