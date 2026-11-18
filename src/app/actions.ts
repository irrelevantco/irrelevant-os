"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext, requireUser } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import {
  authSchema,
  businessSchema,
  leadUpdateSchema,
  noteSchema,
  organizationSchema,
  prospectSchema,
  validationMessage,
  type ActionState,
} from "@/lib/domain";

import { operatorAllowed } from "@/lib/operator-access";
function databaseMessage(code?: string) {
  if (code === "23505")
    return "This business already exists in this organization. Check existing leads or Trash before adding it again.";
  if (code === "42501")
    return "Your account does not have permission to make this change.";
  return "The change could not be saved. Check your connection and try again.";
}
const orgCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};
export async function signIn(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  if (
    !operatorAllowed(
      parsed.data.email,
      process.env.OPERATOR_EMAIL_ALLOWLIST,
      process.env.NODE_ENV === "production",
    )
  )
    return {
      error: "This private workspace is limited to approved operator accounts.",
    };
  const db = await createClient();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error)
    return {
      error:
        "Unable to sign in. Check your email and password, confirm your email if required, or try again later.",
    };
  redirect("/dashboard");
}
export async function signUp(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = authSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  if (
    !operatorAllowed(
      parsed.data.email,
      process.env.OPERATOR_EMAIL_ALLOWLIST,
      process.env.NODE_ENV === "production",
    )
  )
    return {
      error: "This private workspace is limited to approved operator accounts.",
    };
  const db = await createClient();
  const { data, error } = await db.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${process.env.APP_URL || "http://localhost:3030"}/auth/callback`,
    },
  });
  if (error)
    return {
      error:
        "Unable to create an account. Please try again later or contact the workspace owner.",
    };
  if (!data.session)
    return { success: "Check your inbox to confirm your email, then sign in." };
  redirect("/onboarding");
}
export async function signOut() {
  const db = await createClient();
  const { error } = await db.auth.signOut();
  if (error) throw new Error("Sign-out failed. Try again.");
  (await cookies()).delete("ir_org");
  redirect("/login");
}
export async function createOrganization(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db } = await requireUser();
  const parsed = organizationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  const { data, error } = await db.rpc("create_organization", {
    organization_name: parsed.data.name,
  });
  if (error || !data) return { error: databaseMessage(error?.code) };
  (await cookies()).set("ir_org", data, orgCookie);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
export async function switchOrganization(form: FormData) {
  const { db, user } = await requireUser();
  const id = z.uuid().parse(form.get("organization_id"));
  const { data, error } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", id)
    .single();
  if (error || !data) throw new Error("Organization access denied.");
  (await cookies()).set("ir_org", id, orgCookie);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
export async function renameOrganization(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization, role } = await requireContext();
  if (role !== "owner")
    return { error: "Only the organization owner can rename this workspace." };
  const parsed = organizationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  const { data, error } = await db
    .from("organizations")
    .update({ name: parsed.data.name })
    .eq("id", organization.id)
    .select("id")
    .single();
  if (error || !data) return { error: databaseMessage(error?.code) };
  revalidatePath("/dashboard", "layout");
  return { success: "Organization name updated." };
}
export async function createProspect(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization } = await requireContext();
  const parsed = prospectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  const { data, error } = await db.rpc("create_prospect", {
    payload: { ...parsed.data, organization_id: organization.id },
  });
  if (error || !data) return { error: databaseMessage(error?.code) };
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/leads/${data}`);
}
export async function updateLead(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization } = await requireContext();
  const parsed = leadUpdateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  const { id, ...values } = parsed.data;
  const { data, error } = await db
    .from("leads")
    .update(values)
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("id")
    .single();
  if (error || !data)
    return {
      error: error?.message.includes("requires a verified")
        ? "Ready for Outreach requires a verified, source-backed Growth Review and explicit owner approval. Open the Growth Review to approve it."
        : databaseMessage(error?.code),
    };
  revalidatePath("/dashboard", "layout");
  return { success: "Lead updated." };
}
export async function updateBusiness(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization } = await requireContext();
  const parsed = businessSchema
    .extend({ id: z.uuid() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  const { id, ...values } = parsed.data;
  const { data, error } = await db
    .from("businesses")
    .update(values)
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("id")
    .single();
  if (error || !data) return { error: databaseMessage(error?.code) };
  revalidatePath("/dashboard", "layout");
  return { success: "Business updated. Original source provenance retained." };
}
export async function addNote(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db, organization } = await requireContext();
  const parsed = noteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  const { error } = await db
    .from("lead_notes")
    .insert({ ...parsed.data, organization_id: organization.id });
  if (error) return { error: databaseMessage(error.code) };
  revalidatePath(`/dashboard/leads/${parsed.data.lead_id}`);
  revalidatePath("/dashboard/activity");
  return { success: "Note added." };
}
