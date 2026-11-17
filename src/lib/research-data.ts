import "server-only";
import { z } from "zod";
import { notFound } from "next/navigation";
import { requireContext } from "./context";
import type { Lead } from "./data";
export async function researchLead(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const { db, organization } = await requireContext();
  const result = await db
    .from("leads")
    .select("*, business:businesses!inner(*)")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (result.error) throw new Error("Could not load prospect.");
  if (!result.data) notFound();
  return result.data as Lead;
}
export async function growthReview(leadId: string) {
  const { db, organization } = await requireContext();
  const review = await db
    .from("growth_reviews")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("lead_id", leadId)
    .single();
  if (review.error)
    throw new Error(
      "Could not load Growth Review. Apply the prospect migration.",
    );
  const points = await db
    .from("growth_review_points")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("review_id", review.data.id);
  if (points.error) throw new Error("Could not load review pillars.");
  return { review: review.data, points: points.data };
}
export const importSummarySchema = z.object({
  total_imported: z.number(),
  duplicates_skipped: z.number(),
  row_errors: z.number(),
  missing_contact_information: z.number(),
  leads_needing_research: z.number(),
  audits_awaiting_approval: z.number(),
  ready_for_outreach: z.number(),
});
export async function importSummary(batch?: string) {
  const { db, organization } = await requireContext();
  const { data, error } = await db.rpc("prospect_import_summary", {
    org: organization.id,
    ...(batch ? { batch } : {}),
  });
  if (error) throw new Error("Could not load import results.");
  return importSummarySchema.parse(data);
}
