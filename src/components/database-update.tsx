import Link from "next/link";
import { Card } from "@/components/ui/card";
export function DatabaseUpdate() {
  return (
    <Card className="max-w-3xl p-6 sm:p-8">
      <p className="eyebrow text-primary">Workspace / Database version</p>
      <h1 className="editorial mt-4 text-3xl">A database update is needed.</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        Your connection is working, but this app needs newer database tables
        before this screen can open.
      </p>
      <p className="mt-4 text-sm leading-7">
        In the Windows app, choose{" "}
        <strong>Workspace → Update local database…</strong>, confirm the update,
        then reload this screen. Your existing accounts, leads, notes and
        research are retained.
      </p>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">
        For browser/local source use, apply the repository migrations with npm
        run local:migrate. A hosted database requires its own reviewed
        migration; the desktop updater only operates on the supported local
        Docker stack.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block text-sm text-primary underline"
      >
        Return to overview
      </Link>
    </Card>
  );
}
