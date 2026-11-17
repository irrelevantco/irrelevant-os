"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createHash } from "node:crypto";
import { requireContext } from "@/lib/context";
import type { ActionState } from "@/lib/domain";
import type { Json } from "@/lib/supabase/database.types";
import {
  settingsSchema,
  enqueueSchema,
  eventSchema,
  discoverySchema,
} from "@/lib/agents/contracts";
import { runNext } from "@/lib/agents/worker";
import { candidatesCsv } from "@/lib/agents/explee";
import { autoMapping, parseCsv, previewRows } from "@/lib/imports/csv";
function changed() {
  revalidatePath("/dashboard", "layout");
}
export async function configureAgents(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner") return { error: "Organization owner required." };
  const parsed = settingsSchema.safeParse({
    ...Object.fromEntries(form),
    paused: form.get("paused") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await db.rpc("configure_agents", {
    org: organization.id,
    config: parsed.data,
  });
  if (error) return { error: "Could not save agent settings." };
  changed();
  return { success: "Limits saved. Outreach remains draft-only." };
}
export async function enqueueJob(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner") return { error: "Organization owner required." };
  const parsed = enqueueSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Choose a workflow and a prospect." };
  const { kind, lead, request_key } = parsed.data;
  let parameters: Json = {};
  if (kind === "discovery") {
    if (!process.env.EXPLEE_API_KEY)
      return {
        error:
          "Explee API key is not configured. Use CSV Imports until a provider is connected.",
      };
    const query = discoverySchema.safeParse(Object.fromEntries(form));
    if (!query.success) return { error: query.error.issues[0].message };
    parameters = query.data;
    if (form.get("credit_approval") !== "on")
      return {
        error:
          "Confirm this provider request may consume your configured Explee credits.",
      };
  } else if (!lead) return { error: "Choose a prospect." };
  const { error } = await db.rpc("enqueue_agent_job", {
    org: organization.id,
    job_kind: kind,
    ...(lead ? { lead } : {}),
    request_key,
    parameters,
  });
  if (error) return { error: error.message.slice(0, 300) };
  changed();
  return {
    success:
      "Job queued. Use Run next while signed in as the organization owner.",
  };
}
export async function runAgent(): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner") return { error: "Organization owner required." };
  try {
    const message = await runNext(db, organization.id);
    changed();
    return { success: message };
  } catch {
    return { error: "Worker failed. Verify the agent migration and settings." };
  }
}
export async function stopAgents(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner") return { error: "Organization owner required." };
  const job = z
    .union([z.uuid(), z.literal("")])
    .safeParse(form.get("job") ?? "");
  if (!job.success) return { error: "Invalid job." };
  const { error } = await db.rpc("stop_agent_jobs", {
    org: organization.id,
    ...(job.data ? { job: job.data } : {}),
  });
  if (error) return { error: "Could not stop jobs." };
  changed();
  return {
    success: job.data
      ? "Job stopped."
      : "Agents paused and queued/running jobs cancelled. An already-started provider request may still be billed.",
  };
}
export async function acceptDraft(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner") return { error: "Organization owner required." };
  const parsed = z
    .object({ job: z.uuid(), confirm: z.literal("on") })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error:
        "Review the entire proposal and confirm replacing the editable draft.",
    };
  const { error } = await db.rpc("accept_agent_draft", {
    org: organization.id,
    job: parsed.data.job,
  });
  if (error) return { error: error.message.slice(0, 300) };
  changed();
  return {
    success:
      "Proposal copied into the editable draft. No sending was authorized.",
  };
}
export async function logContact(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization } = await requireContext();
  const parsed = eventSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Confirm an actual contact event, its date and a note." };
  const v = parsed.data;
  const { error } = await db.rpc("log_contact_event", {
    org: organization.id,
    lead: v.lead,
    event_kind: v.kind,
    event_at: `${v.date}T00:00:00-05:00`,
    event_note: v.note,
  });
  if (error)
    return {
      error: "Could not record event. Use a date in the past or today.",
    };
  changed();
  return {
    success:
      v.kind === "opt_out"
        ? "Opt-out recorded, prospect suppressed and pending preparation cancelled."
        : "Actual contact recorded manually. This did not send a message or place a call.",
  };
}
export async function previewDiscovery(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner") return { error: "Organization owner required." };
  const job = z.uuid().safeParse(form.get("job"));
  if (!job.success) return { error: "Invalid discovery result." };
  const { data } = await db
    .from("agent_jobs")
    .select("result,kind,status")
    .eq("organization_id", organization.id)
    .eq("id", job.data)
    .single();
  if (!data || data.kind !== "discovery" || data.status !== "succeeded")
    return { error: "No completed discovery result." };
  const result = z
    .object({
      companies: z.array(z.record(z.string(), z.string())).min(1).max(10),
    })
    .safeParse(data.result);
  if (!result.success)
    return { error: "No importable candidates. Check provider results." };
  const csv = candidatesCsv(result.data.companies);
  const rows = parseCsv(csv);
  const mapping = autoMapping(rows.headers);
  const { data: batch, error } = await db.rpc("preview_prospect_import", {
    org: organization.id,
    batch_label: "Explee discovery candidates",
    file_name: `explee-${job.data}.csv`,
    file_fingerprint: createHash("sha256")
      .update(`explee-v1:${job.data}`)
      .digest("hex"),
    field_mapping: mapping,
    rows: previewRows(rows.records, mapping) as unknown as Json,
  });
  if (error || !batch)
    return { error: "Could not preview candidates. No leads were imported." };
  redirect(`/dashboard/imports/${batch}`);
}
