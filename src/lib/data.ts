import "server-only";
import { z } from "zod";
import { requireContext } from "./context";
import { statusSchema } from "./domain";
import type { Database } from "./supabase/database.types";
export type Business = Database["public"]["Tables"]["businesses"]["Row"];
export type Lead = Database["public"]["Tables"]["leads"]["Row"] & {
  business: Business;
};
const summarySchema = z.object({
  total: z.number(),
  qualified: z.number(),
  open_value_cents: z.number(),
  won: z.number(),
  follow_ups_due: z.number(),
  by_status: z.record(z.string(), z.number()),
});
export async function getSummary() {
  const { db, organization } = await requireContext();
  const { data, error } = await db.rpc("crm_summary", { org: organization.id });
  if (error) throw new Error("Could not load CRM metrics.");
  return summarySchema.parse(data);
}
export async function getLeads({
  search = "",
  status = "",
  page = 1,
  limit = 25,
  due = false,
}: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  due?: boolean;
} = {}) {
  const { db, organization } = await requireContext();
  const offset = (Math.max(1, page) - 1) * limit;
  let query = db
    .from("leads")
    .select("*, business:businesses!inner(*)", { count: "exact" })
    .eq("organization_id", organization.id);
  if (search)
    query = query.ilike(
      "business.name",
      `%${search.replace(/[\\%_]/g, "\\$&").slice(0, 160)}%`,
    );
  const parsedStatus = statusSchema.safeParse(status);
  if (parsedStatus.success) query = query.eq("status", parsedStatus.data);
  if (due)
    query = query
      .lte(
        "next_follow_up",
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/New_York",
        }).format(new Date()),
      )
      .not("status", "in", "(Won,Lost,Suppressed)");
  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error("Could not load leads. Please try again.");
  return { leads: data as Lead[], count: count ?? 0 };
}
