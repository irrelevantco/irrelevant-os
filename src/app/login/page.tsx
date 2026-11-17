import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms";
import { AuthShell } from "@/components/auth-shell";
import { createClient, isConfigured } from "@/lib/supabase/server";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isConfigured()) redirect("/setup");
  const db = await createClient();
  if ((await db.auth.getUser()).data.user) redirect("/dashboard");
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
