import { requireContext } from "@/lib/context";
export async function GET() {
  try {
    const { db, organization } = await requireContext();
    const [crm, sales] = await Promise.all([
      db.rpc("crm_summary", { org: organization.id }),
      db.rpc("acquisition_state", {
        org: organization.id,
        payload: { metrics_only: true },
      }),
    ]);
    if (crm.error || sales.error)
      return Response.json(
        { error: "Metrics unavailable" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    return Response.json(
      {
        organization_id: organization.id,
        crm: crm.data,
        sales: sales.data,
        observed_at: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Sign in to refresh metrics" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
