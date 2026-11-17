import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, isConfigured } from "./supabase/server";
export const requireUser = cache(async () => {
  if (!isConfigured()) redirect("/setup");
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  return { db, user };
});
export const requireContext = cache(async () => {
  const { db, user } = await requireUser();
  const { data: memberships, error } = await db
    .from("organization_members")
    .select("role, organization:organizations!inner(id, name)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error)
    throw new Error(
      "Could not load your organizations. Check the database migration and connection.",
    );
  if (!memberships?.length) redirect("/onboarding");
  const activeId = (await cookies()).get("ir_org")?.value;
  const membership =
    memberships.find((m) => m.organization.id === activeId) ?? memberships[0];
  return {
    db,
    user,
    organization: membership.organization,
    role: membership.role,
    memberships,
  };
});
