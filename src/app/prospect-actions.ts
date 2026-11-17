"use server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/context";
import {
  autoMapping,
  mappingSchema,
  parseCsv,
  previewRows,
} from "@/lib/imports/csv";
import type { Mapping } from "@/lib/imports/fields";
import { draftSchema, PILLARS, reviewSchema } from "@/lib/reviews";
import type { ActionState } from "@/lib/domain";
import type { Json } from "@/lib/supabase/database.types";
export type CsvStage = {
  error?: string;
  text?: string;
  filename?: string;
  headers?: string[];
  mapping?: Mapping;
  rowCount?: number;
};
export async function loadCsv(_: CsvStage, form: FormData): Promise<CsvStage> {
  const { role } = await requireContext();
  if (role !== "owner")
    return { error: "Only an organization owner can import prospects." };
  try {
    let text: string;
    let filename: string;
    if (form.get("source") === "batch001") {
      text = await readFile(
        path.join(process.cwd(), "data/imports/irrelevant_os_30_prospects.csv"),
        "utf8",
      );
      filename = "irrelevant_os_30_prospects.csv";
    } else {
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 512 * 1024)
        throw new Error("Choose a CSV file up to 512 KB.");
      text = await file.text();
      filename = file.name.slice(0, 200);
    }
    const parsed = parseCsv(text);
    return {
      text,
      filename,
      headers: parsed.headers,
      mapping: autoMapping(parsed.headers),
      rowCount: parsed.records.length,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not read CSV.",
    };
  }
}
export async function previewImport(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner")
    return { error: "Only an organization owner can import prospects." };
  let batchId: string;
  try {
    const text = z.string().max(524288).parse(form.get("csv_text"));
    const label = z.string().trim().min(1).max(160).parse(form.get("label"));
    const filename = z.string().max(200).parse(form.get("filename"));
    const mapping = mappingSchema.parse(
      JSON.parse(String(form.get("mapping"))),
    );
    const { records, headers } = parseCsv(text);
    if (Object.values(mapping).some((h) => h && !headers.includes(h)))
      throw new Error("A mapped column is not present in this CSV.");
    const rows = previewRows(records, mapping);
    const fingerprint = createHash("sha256")
      .update(
        "prospects-v1\n" +
          text +
          "\n" +
          JSON.stringify(Object.entries(mapping).sort()),
      )
      .digest("hex");
    const { data, error } = await db.rpc("preview_prospect_import", {
      org: organization.id,
      batch_label: label,
      file_name: filename,
      file_fingerprint: fingerprint,
      field_mapping: mapping,
      rows: rows as unknown as Json,
    });
    if (error || !data)
      throw new Error(
        "Preview could not be saved. Verify your organization access and database migration.",
      );
    batchId = data;
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not preview import.",
    };
  }
  redirect(`/dashboard/imports/${batchId}`);
}
export async function commitImport(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner") return { error: "Organization owner required." };
  const parsed = z
    .object({ batch: z.uuid(), confirm: z.literal("on") })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Confirm the preview before importing." };
  const { error } = await db.rpc("commit_prospect_import", {
    org: organization.id,
    batch: parsed.data.batch,
  });
  if (error)
    return {
      error:
        "Import failed. No uncommitted rows should be assumed saved. Check access and retry.",
    };
  revalidatePath("/dashboard", "layout");
  return {
    success:
      "Import completed. This batch is idempotent: repeating it creates no additional leads.",
  };
}
export async function saveReview(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization } = await requireContext();
  const parsed = reviewSchema.safeParse({
    lead_id: form.get("lead_id"),
    expected_revision: form.get("expected_revision"),
    suggested_offer: form.get("suggested_offer"),
    points: PILLARS.map((pillar, i) => ({
      pillar,
      ...Object.fromEntries(
        [
          "observation",
          "recommendation",
          "source_url",
          "verification_status",
          "confidence",
          "last_researched_date",
        ].map((k) => [k, form.get(`point_${i}_${k}`)]),
      ),
    })),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await db.rpc("save_growth_review", {
    org: organization.id,
    lead: v.lead_id,
    expected_revision: v.expected_revision,
    points: v.points,
    offer: v.suggested_offer,
  });
  if (error)
    return {
      error: error.message.includes("Reload")
        ? "This review changed. Reload the page before saving."
        : "Review could not be saved. Verified observations require a source, confidence and research date.",
    };
  revalidatePath("/dashboard", "layout");
  return {
    success:
      "Review saved. Any previous approval was invalidated; outreach remains a draft.",
  };
}
export async function approveReview(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner")
    return { error: "Only the organization owner can approve this review." };
  const parsed = z
    .object({
      lead_id: z.uuid(),
      expected_revision: z.coerce.number().int().positive(),
      confirm: z.literal("on"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Explicitly confirm this review version before approval." };
  const { error } = await db.rpc("approve_growth_review", {
    org: organization.id,
    lead: parsed.data.lead_id,
    expected_revision: parsed.data.expected_revision,
  });
  if (error)
    return {
      error: error.message.includes("Reload")
        ? "Review changed. Reload before approving."
        : "Approval requires a verified, source-backed observation and an open lead.",
    };
  revalidatePath("/dashboard", "layout");
  return {
    success:
      "Review approved and lead marked Ready for Outreach. No email was sent or approved for sending.",
  };
}
export async function saveDraft(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization } = await requireContext();
  const parsed = draftSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await db.rpc("save_outreach_draft", {
    org: organization.id,
    lead: v.lead_id,
    email_body: v.email_draft,
    opening_script: v.call_script,
    follow_up: v.next_follow_up ?? undefined,
  });
  if (error) return { error: "Draft could not be saved. Try again." };
  revalidatePath("/dashboard", "layout");
  return { success: "Preparation saved as draft. No communication was sent." };
}
