import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
export default function Setup() {
  return (
    <AuthShell
      eyebrow="Workspace setup"
      title="Connect your foundation."
      description="The CRM needs a Supabase database and authentication service before you can sign in."
    >
      <div className="space-y-5 text-sm leading-6 text-muted-foreground">
        <p>
          Follow the local setup in{" "}
          <code className="text-foreground">README.md</code>: install
          dependencies, start Supabase, and copy its local URL and publishable
          key into <code className="text-foreground">.env.local</code>.
        </p>
        <p>
          Apply the migration, restart Next.js, then create your account. No
          example leads or production metrics are preloaded.
        </p>
        <Button asChild>
          <Link href="/login">Check connection →</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
