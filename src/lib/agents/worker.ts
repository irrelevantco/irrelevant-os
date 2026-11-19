import { stageDiscovery } from "./import-preview";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { claimedJobSchema } from "./contracts";
import { prepare } from "./prepare";
import { discoverOpenStreetMap } from "./openstreetmap";
import { discover } from "./explee";
import { researchBusiness } from "../engine/research";
import { enhanceResearch } from "../engine/ai";
import { engineRpc } from "../engine/rpc";
export async function runNext(db: SupabaseClient<Database>, org: string) {
  const args = { org };
  const claim = await db.rpc("claim_agent_job", args);
  if (claim.error) throw new Error("Could not claim a preparation job.");
  if (!claim.data) return "No eligible queued jobs, or agents are paused.";
  const context = claimedJobSchema.parse(claim.data);
  let output: Json | undefined;
  let failure: string | undefined;
  try {
    const seen =
      context.job.kind === "discovery" &&
      (context.job.input as { provider?: string })?.provider === "osm"
        ? await db.rpc("discovery_seen_sources", { org })
        : null;
    if (seen?.error)
      throw new Error(
        "OpenStreetMap history could not be checked. No request was made.",
      );
    const previous = Array.isArray(seen?.data)
      ? seen.data.filter((value): value is string => typeof value === "string")
      : [];
    output = (context.job.kind === "discovery"
      ? (context.job.input as { provider?: string })?.provider === "osm"
        ? await discoverOpenStreetMap(context.job.input, fetch, previous)
        : await discover(
            context.job.input,
            process.env.EXPLEE_API_KEY ?? "",
            context.job.reserved_credits,
          )
      : context.job.kind === "research_audit"
        ? await enhanceResearch(
            await researchBusiness(context.business?.website ?? ""),
            context.job.input,
          )
        : prepare(context)) as unknown as Json;
    if (Buffer.byteLength(JSON.stringify(output), "utf8") > 95000)
      throw Error(
        "Research proposal exceeded its storage limit; review the source manually.",
      );
  } catch (error) {
    output = undefined;
    // Persist only controlled errors; never record provider payloads, headers or credentials.
    failure =
      error instanceof Error &&
      /^(OpenStreetMap|Explee|Configure|Verified|Business|Insufficient|Research|Local AI)/.test(
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
  if (
    !failure &&
    context.job.kind === "discovery" &&
    output &&
    typeof output === "object" &&
    !Array.isArray(output) &&
    Array.isArray(output.companies) &&
    output.companies.length
  ) {
    const saved = await db
      .from("agent_jobs")
      .select("status")
      .eq("organization_id", org)
      .eq("id", context.job.id)
      .single();
    const settings = await db
      .from("agent_settings")
      .select("paused")
      .eq("organization_id", org)
      .single();
    if (saved.data?.status === "succeeded" && settings.data?.paused === false) {
      try {
        const batch = await stageDiscovery(
          db,
          org,
          context.job.id,
          (context.job.input as { provider?: string })?.provider === "osm"
            ? "osm"
            : "explee",
          output.companies,
        );
        if (
          batch &&
          context.job.idempotency_key?.startsWith("engine:discovery:")
        ) {
          await engineRpc(db, org, "auto_import", {
            job_id: context.job.id,
            batch_id: batch,
          });
        }
      } catch {
        return "Candidates were saved; preview staging needs review. Use Preview candidates in job history. No business records were imported.";
      }
    }
  }
  return failure
    ? "Preparation failed; see the job error and retry policy."
    : "Preparation processed. Check the final job status and review any result; nothing was sent.";
}
