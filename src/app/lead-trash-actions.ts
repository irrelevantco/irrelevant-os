"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/context";
import { type ActionState, validationMessage } from "@/lib/domain";
import { leadTrashSchema, restoreLeadSchema } from "@/lib/lead-trash";
import { missingDatabaseMigration } from "@/lib/database-failure";

function failure(error: { message: string; code: string }): ActionState {
  if (missingDatabaseMigration(error))
    return {
      error:
        "Update the local database through Workspace → Update local database… and try again.",
    };
  if (
    /^(Only the organization owner|This lead|Lead changed|Wait for running|Cancel upcoming)/.test(
      error.message,
    )
  )
    return { error: error.message };
  return {
    error: "The lead was not changed. Check your connection and try again.",
  };
}

export async function removeLead(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner")
    return { error: "Only the organization owner can remove leads." };
  const parsed = leadTrashSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  const { id, expected_updated_at, return_to } = parsed.data;
  const { data, error } = await db.rpc("change_lead_trash", {
    org: organization.id,
    lead: id,
    restore: false,
    expected_updated_at,
  });
  if (error) return failure(error);
  if (!data)
    return { error: "The lead was not removed. Refresh and try again." };
  revalidatePath("/dashboard", "layout");
  redirect(`${return_to}?removed=1`);
}

export async function restoreLead(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner")
    return { error: "Only the organization owner can restore leads." };
  const parsed = restoreLeadSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  const { data, error } = await db.rpc("change_lead_trash", {
    org: organization.id,
    lead: parsed.data.id,
    restore: true,
    expected_updated_at: parsed.data.expected_updated_at,
  });
  if (error) return failure(error);
  if (!data)
    return { error: "The lead was not restored. Refresh and try again." };
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/leads/trash?restored=1");
}
