"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/context";
import {
  engineSettingsSchema,
  campaignPolicySchema,
} from "@/lib/engine/contracts";
import { engineRpc } from "@/lib/engine/rpc";
import { credentialKeyId } from "@/lib/acquisition/google";
import { decodeApprovalBody } from "@/lib/acquisition/contracts";
import { tickEngine } from "@/lib/engine/runner";
import type { ActionState } from "@/lib/domain";
async function owner() {
  const c = await requireContext();
  if (c.role !== "owner") throw Error("Organization owner required.");
  return c;
}
function changed() {
  revalidatePath("/dashboard", "layout");
}
function failed(error: unknown): ActionState {
  if (error instanceof z.ZodError) return { error: error.issues[0].message };
  return {
    error:
      error instanceof Error &&
      /^(Organization|Choose|Research|Campaign|Connect|Configure|Enable|Review|Explicitly|A |An |The |Only |Current |Shared|Invalid|Confirm|Too |This )/.test(
        error.message,
      )
        ? error.message.slice(0, 400)
        : "The engine request was held. Check the database update, configuration and current approvals.",
  };
}
export async function saveEngine(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const c = await owner();
    const settings = engineSettingsSchema.parse({
      ...Object.fromEntries(form),
      enabled: form.get("enabled") === "on",
      research_enabled: form.get("research_enabled") === "on",
      discovery_enabled: form.get("discovery_enabled") === "on",
      auto_import: form.get("auto_import") === "on",
      categories: form.getAll("categories"),
      territories: String(form.get("territories") ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(",");
          return {
            city: parts[0]?.trim(),
            state: parts[1]?.trim().toUpperCase(),
          };
        }),
    });
    const allowPaid = form.get("allow_paid_ai") === "on";
    if (settings.ai_provider === "openai" && !allowPaid)
      throw Error(
        "Explicitly approve bounded OpenAI use or choose the free provider.",
      );
    await engineRpc(c.db, c.organization.id, "configure", {
      ...settings,
      allow_paid_ai: allowPaid,
    });
    changed();
    return {
      success:
        "Engine controls saved. Previous automatic-email approval was paused. The local runner requires the app open, PC awake and owner signed in.",
    };
  } catch (error) {
    return failed(error);
  }
}
export async function approveCampaign(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const c = await owner();
    const policy = campaignPolicySchema.parse({
      ...Object.fromEntries(form),
      follow_ups: form.get("follow_ups") === "on",
      auto_replies: form.get("auto_replies") === "on",
      auto_meetings: form.get("auto_meetings") === "on",
      confirmed: form.get("confirmed") === "on",
    });
    const expectedSender = z
      .object({
        name: z.string().max(160),
        email: z.email(),
        address: z.string().max(500),
      })
      .parse(
        JSON.parse(
          decodeApprovalBody(String(form.get("expected_sender_base64"))),
        ),
      );
    z.literal("sourced-v1").parse(form.get("template_version"));
    await engineRpc(c.db, c.organization.id, "approve_campaign", {
      ...policy,
      expected_sender: expectedSender,
      template_version: "sourced-v1",
      key_id: credentialKeyId(),
    });
    changed();
    return {
      success:
        "This seven-day campaign policy is approved. Eligible, fully verified and owner-approved reviews can now produce automatic messages while the local runner is active. Pause stops queued work.",
    };
  } catch (error) {
    return failed(error);
  }
}
export async function pauseCampaign(): Promise<ActionState> {
  try {
    const c = await owner();
    await engineRpc(c.db, c.organization.id, "pause_campaign");
    changed();
    return {
      success:
        "Campaign paused and queued automatic messages cancelled. An external request already in progress may still complete.",
    };
  } catch (error) {
    return failed(error);
  }
}
export async function runEngine(): Promise<ActionState> {
  try {
    const c = await owner();
    const result = await tickEngine(c);
    changed();
    return {
      success: result.enabled ? result.messages?.join(" ") : result.message,
    };
  } catch (error) {
    return failed(error);
  }
}
export async function queueResearch(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const c = await owner();
    const lead = z.uuid().parse(form.get("lead_id"));
    const key = z.uuid().parse(form.get("request_key"));
    await engineRpc(c.db, c.organization.id, "queue_research", {
      lead_id: lead,
      request_key: key,
    });
    changed();
    return {
      success:
        "Public-web research queued. Run the engine or keep the enabled app open during the working window. Findings remain unverified until you review them.",
    };
  } catch (error) {
    return failed(error);
  }
}
export async function applyResearch(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  let lead: string;
  try {
    const c = await owner();
    const id = z.uuid().parse(form.get("job_id"));
    z.literal("on").parse(form.get("confirmed"));
    const result = z.object({ lead_id: z.uuid() }).parse(
      await engineRpc(c.db, c.organization.id, "accept_research", {
        job_id: id,
        confirmed: true,
        contact_email: z
          .union([z.email(), z.literal("")])
          .parse(form.get("contact_email") ?? ""),
      }),
    );
    lead = result.lead_id;
    changed();
  } catch (error) {
    return failed(error);
  }
  redirect(`/dashboard/research/${lead}`);
}
export async function resolveDelivery(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const c = await owner();
    const input = z
      .object({
        id: z.uuid(),
        message_id: z.string().trim().max(200),
        confirmed: z.literal("on"),
      })
      .parse(Object.fromEntries(form));
    await engineRpc(c.db, c.organization.id, "resolve_delivery", {
      ...input,
      confirmed: true,
    });
    changed();
    return {
      success:
        "Your manual Gmail check was recorded. No automatic retry was queued.",
    };
  } catch (error) {
    return failed(error);
  }
}
