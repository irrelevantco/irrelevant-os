import { redirect } from "next/navigation";
import { requireUser } from "@/lib/context";
import { AuthShell } from "@/components/auth-shell";
import { OrganizationForm } from "@/components/forms";
import { signOut } from "@/app/actions";
// Desktop builds intentionally contain no backend credentials; read configuration per request.
export const dynamic = "force-dynamic";
export default async function Onboarding() {
  const { db, user } = await requireUser();
  const { data, error } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1);
  if (error)
    throw new Error(
      "Could not check organization membership. Apply the database migration.",
    );
  if (data?.length) redirect("/dashboard");
  return (
    <AuthShell
      eyebrow="01 / Your foundation"
      title="Give it a home."
      description="Create an organization to keep your businesses, leads, and conversations together."
    >
      <OrganizationForm />
      <form action={signOut} className="mt-6">
        <button className="text-sm text-muted-foreground underline">
          Sign out of {user.email}
        </button>
      </form>
    </AuthShell>
  );
}
