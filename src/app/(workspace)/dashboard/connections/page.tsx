import { headers } from "next/headers";
import Link from "next/link";
import { requireContext } from "@/lib/context";
import { connection, googleConfigured } from "@/lib/acquisition/google";
import { acquisitionSchema } from "@/lib/acquisition/state";
import { missingDatabaseMigration } from "@/lib/database-failure";
import { DatabaseUpdate } from "@/components/database-update";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AutomationForm,
  DisconnectGoogleForm,
} from "@/components/acquisition/forms";
export const metadata = { title: "Connections and automation" };
export default async function Connections({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const { db, organization, role } = await requireContext(),
    query = await searchParams;
  const result = await db.rpc("acquisition_state", { org: organization.id });
  if (missingDatabaseMigration(result.error)) return <DatabaseUpdate />;
  if (result.error) throw Error("Could not load acquisition controls.");
  const nativeView =
    (await headers()).get("user-agent")?.includes("Electron/") ?? false;
  const data = acquisitionSchema.parse(result.data),
    google = role === "owner" ? await connection(db, organization.id) : null,
    configured = googleConfigured();
  return (
    <>
      <PageHeading
        eyebrow="Operations / Connections"
        title="Connected, with your approval."
        description="Company Gmail, Calendar and bounded hourly discovery. External sends and invitations require a separate explicit approval."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="min-w-0 space-y-5 p-6">
          <h2 className="text-lg">Google account</h2>
          <p className="break-all text-sm">
            contact.irrelevantcollective@gmail.com
          </p>
          <p className="text-xs leading-6 text-muted-foreground">
            {google
              ? "Connected for this organization owner. Encrypted credentials are stored on the server."
              : "Not connected. No Gmail sends or Google events are active."}{" "}
            Requested permissions: verified account email, send Gmail, check
            calendar availability, and manage events on calendars you own. No
            mailbox-reading permission is requested.
          </p>
          {query.google && (
            <p role="status" className="text-sm text-primary">
              {query.google === "connected"
                ? "Google account connected."
                : "Connection was not completed. Check the OAuth setup and consented account; no sending was enabled."}
            </p>
          )}
          {role === "owner" && (
            <>
              {configured && !nativeView ? (
                <form method="post" action="/api/integrations/google/start">
                  <Button type="submit">
                    Connect / renew Google permission
                  </Button>
                </form>
              ) : (
                <div className="text-xs leading-6 text-muted-foreground">
                  <p>
                    Google OAuth setup is still required. For a Windows bundle,
                    choose Workspace → Import Google OAuth setup… and select an
                    official Desktop OAuth client JSON. Then choose Workspace →
                    Open Google connection in browser… and sign in there. The
                    browser completes Google consent flow.
                  </p>
                  <p className="mt-3">
                    For a hosted app, configure GOOGLE_CLIENT_ID,
                    GOOGLE_CLIENT_SECRET and OAUTH_TOKEN_ENCRYPTION_KEY on the
                    host and register the exact callback shown in the setup
                    guide. Never paste secrets into chat.
                  </p>
                </div>
              )}
              {google && <DisconnectGoogleForm />}
            </>
          )}
          <Link
            href="https://github.com/irrelevantco/irrelevant-os/blob/main/docs/GOOGLE_INTEGRATION.md"
            className="block text-sm text-primary underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google setup guide
          </Link>
          <Link
            href="/dashboard/agents"
            className="block text-sm text-primary underline"
          >
            Configure sender name and postal address
          </Link>
        </Card>
        {role === "owner" && (
          <Card className="min-w-0 p-6">
            <h2 className="mb-5 text-lg">Hourly acquisition controls</h2>
            <AutomationForm
              settings={data.settings}
              googleConnected={Boolean(
                google?.scopes.includes(
                  "https://www.googleapis.com/auth/gmail.send",
                ),
              )}
            />
            <p className="mt-5 text-xs leading-6 text-muted-foreground">
              Last automation heartbeat:{" "}
              {data.settings?.last_tick_at
                ? new Intl.DateTimeFormat("en-US", {
                    timeZone: "America/New_York",
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(data.settings.last_tick_at)) + " ET"
                : "not run"}
              . Desktop automation requires the app open, the PC awake, backend
              running and an owner signed in. Browser automation requires an
              open page. No unattended hosted worker is configured.
            </p>
          </Card>
        )}
      </div>
      <Card className="mt-6 p-6">
        <h2 className="mb-4 text-lg">Email delivery history / latest 50</h2>
        {!data.deliveries.length ? (
          <p className="text-sm text-muted-foreground">
            No email deliveries recorded.
          </p>
        ) : (
          <ul className="space-y-4">
            {data.deliveries.map((d) => (
              <li className="border-t border-border pt-4" key={d.id}>
                <p className="break-all text-sm">
                  {d.recipient} · {d.subject}
                </p>
                <p className="mt-2 text-xs text-primary">{d.status}</p>
                {d.error && (
                  <p className="mt-2 text-xs text-red-300">{d.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
