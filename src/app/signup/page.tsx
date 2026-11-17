import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms";
import { AuthShell } from "@/components/auth-shell";
import { createClient, isConfigured } from "@/lib/supabase/server";
export default async function Signup() {
  if (!isConfigured()) redirect("/setup");
  const db = await createClient();
  if ((await db.auth.getUser()).data.user) redirect("/dashboard");
  return (
    <AuthShell
      eyebrow="Start with intention"
      title="Make your move."
      description="Create your private account, then set up an organization."
    >
      <AuthForm mode="signup" />
      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
