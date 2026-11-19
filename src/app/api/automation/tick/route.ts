import { appOrigin } from "@/lib/acquisition/origin";
import { requireContext } from "@/lib/context";
import { rpc } from "@/lib/acquisition/google";
import { runNext } from "@/lib/agents/worker";
import { z } from "zod";
import { tickEngine } from "@/lib/engine/runner";
export const maxDuration = 300;
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appOrigin(request))
    return new Response("Invalid origin", { status: 403 });
  try {
    const context = await requireContext();
    const { db, organization, role } = context;
    if (role !== "owner")
      return new Response("Owner required", { status: 403 });
    const engine = await db.rpc("engine_control", {
      org: organization.id,
      payload: { op: "policy_status" },
    });
    if ((engine.data as { enabled?: boolean } | null)?.enabled === true) {
      return Response.json(await tickEngine(context), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const result = z
      .object({ queued: z.number(), reason: z.string().optional() })
      .parse(await rpc(db, "enqueue_hourly_discovery", organization.id));
    const processed = result.reason
      ? "No automatic execution outside the enabled window."
      : await runNext(db, organization.id);
    return Response.json(
      { ...result, processed },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Automation could not run. Check sign-in, pause controls and the database update.",
      },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
