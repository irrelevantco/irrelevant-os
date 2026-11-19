import { requireContext } from "@/lib/context";
import { supabaseConfig } from "@/lib/supabase/config";
export async function GET() {
  const { db, organization, user, role, memberships } = await requireContext();
  if (role !== "owner") return new Response("Owner required", { status: 403 });
  const result = await db.rpc("inventory_summary", { org: organization.id });
  if (result.error)
    return Response.json(
      { error: "Apply the database update before downloading the report." },
      { status: 503 },
    );
  const { url } = supabaseConfig();
  return Response.json(
    {
      generated_at: new Date().toISOString(),
      workspace: organization,
      account: user.email,
      backend: url ? new URL(url).host : "not configured",
      available_workspaces: memberships.map((m) => m.organization),
      inventory: result.data,
      note: "Counts are organization-scoped. Imported rows may overlap. No keys, tokens, passwords, message bodies or research hypotheses are included.",
    },
    {
      headers: {
        "Content-Disposition":
          'attachment; filename="irrelevant-inventory-report.json"',
        "Cache-Control": "private, no-store",
      },
    },
  );
}
