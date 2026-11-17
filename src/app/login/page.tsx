import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms";
import { AuthShell } from "@/components/auth-shell";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { operatorAllowed } from "@/lib/operator-access";
import { signOut } from "@/app/actions";
// Desktop builds intentionally contain no backend credentials; read configuration per request.
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isConfigured()) redirect("/setup");
  const db = await createClient();
  const current = (await db.auth.getUser()).data.user;
  const allowed = operatorAllowed(
    current?.email,
    process.env.OPERATOR_EMAIL_ALLOWLIST,
    process.env.NODE_ENV === "production",
  );
  if (current && allowed) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <AuthShell
      eyebrow="Your next move"
      title="Welcome back."
      description="Sign in to your organization’s acquisition workspace."
    >
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-300">
          The confirmation link could not be verified. Try signing in or request
          a new confirmation through signup.
        </p>
      )}
      {current && !allowed && (
        <div className="mb-5 text-sm">
          <p>
            This account is not an approved operator. Contact the workspace
            owner.
          </p>
          <form action={signOut}>
            <button className="mt-3 text-primary underline">
              Sign out and use another account
            </button>
          </form>
        </div>
      )}
      <AuthForm mode="login" />
      <p className="mt-6 text-sm text-muted-foreground">
        First time here?{" "}
        <Link href="/signup" className="text-foreground underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
