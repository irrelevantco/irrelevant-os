import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { claimedJobSchema } from "./contracts";
import { prepare } from "./prepare";
import { discoverOpenStreetMap } from "./openstreetmap";
import { discover } from "./explee";
export async function runNext(db: SupabaseClient<Database>, org: string) {
  const args = { org };
  const claim = await db.rpc("claim_agent_job", args);
  if (claim.error) throw new Error("Could not claim a preparation job.");
  if (!claim.data) return "No eligible queued jobs, or agents are paused.";
  const context = claimedJobSchema.parse(claim.data);
  let output: Json | undefined;
  let failure: string | undefined;
  try {
    output = (context.job.kind === "discovery"
      ? (context.job.input as { provider?: string })?.provider === "osm"
        ? await discoverOpenStreetMap(context.job.input)
        : await discover(
            context.job.input,
            process.env.EXPLEE_API_KEY ?? "",
            context.job.reserved_credits,
          )
      : prepare(context)) as unknown as Json;
  } catch (error) {
    // Persist only controlled errors; never record provider payloads, headers or credentials.
    failure =
      error instanceof Error &&
      /^(OpenStreetMap|Explee|Configure|Verified|Business|Insufficient)/.test(
        error.message,
      )
        ? error.message.slice(0, 500)
        : "Preparation failed. Check configuration and retry after review.";
  }
  const finished = await db.rpc("finish_agent_job", {
    ...args,
    job: context.job.id,
    lease: context.job.lease_token,
    ...(output ? { output } : {}),
    ...(failure ? { failure } : {}),
  });
  if (finished.error)
    return "Job was stopped or its lease expired; no proposal was accepted. Refresh the queue.";
  return failure
    ? "Preparation failed; see the job error and retry policy."
    : "Preparation processed. Check the final job status and review any result; nothing was sent.";
}
