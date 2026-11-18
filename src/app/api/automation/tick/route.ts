import { appOrigin } from "@/lib/acquisition/origin";
import { requireContext } from "@/lib/context";
import { rpc } from "@/lib/acquisition/google";
import { runNext } from "@/lib/agents/worker";
import { z } from "zod";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appOrigin(request))
    return new Response("Invalid origin", { status: 403 });
  try {
    const { db, organization, role } = await requireContext();
    if (role !== "owner")
      return new Response("Owner required", { status: 403 });
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
