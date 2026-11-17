import { z } from "zod";
import { followUpSchema, urlSchema } from "./domain";
export const PILLARS = [
  "Digital Presence",
  "Social Presence",
  "Customer Growth",
] as const;
export const pointSchema = z
  .object({
    pillar: z.enum(PILLARS),
    observation: z.string().trim().max(3000),
    recommendation: z.string().trim().max(3000),
    source_url: urlSchema,
    verification_status: z.enum(["unverified", "verified", "rejected"]),
    confidence: z.enum(["unknown", "low", "medium", "high"]),
    last_researched_date: followUpSchema,
  })
  .refine(
    (p) =>
      p.verification_status !== "verified" ||
      Boolean(
        p.observation &&
        p.source_url &&
        p.last_researched_date &&
        p.confidence !== "unknown",
      ),
    "A verified observation needs an observation, source URL, confidence and research date.",
  );
export const reviewSchema = z.object({
  lead_id: z.uuid(),
  expected_revision: z.coerce.number().int().positive(),
  suggested_offer: z.string().trim().max(500),
  points: z
    .array(pointSchema)
    .length(3)
    .refine(
      (p) => new Set(p.map((x) => x.pillar)).size === 3,
      "Provide each pillar once.",
    ),
});
export const draftSchema = z.object({
  lead_id: z.uuid(),
  email_draft: z.string().trim().max(12000),
  call_script: z.string().trim().max(6000),
  next_follow_up: followUpSchema,
});
export function initialOutreach(
  name: string,
  industry: string,
  location: string,
) {
  return {
    email_draft: `Hi ${name} team,\n\nI’m with iRRELEVANT CO. We help service businesses present their work and make it easier for prospective customers to get in touch.\n\nI’m reaching out to learn about your ${industry.toLowerCase()} business in ${location}. Would you be open to a short conversation about your current priorities?\n\n[Your name]\niRRELEVANT CO\n[Public business contact details]`,
    call_script: `Hi, I’m [your name] with iRRELEVANT CO. Am I speaking with the person who looks after ${name}’s website or customer inquiries? I’d like to learn about your priorities before suggesting any work. Is there a good time for a brief conversation?`,
  };
}
