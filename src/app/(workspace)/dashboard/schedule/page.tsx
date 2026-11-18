import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireContext } from "@/lib/context";
import { acquisitionSchema } from "@/lib/acquisition/state";
import { connection } from "@/lib/acquisition/google";
import { missingDatabaseMigration } from "@/lib/database-failure";
import { DatabaseUpdate } from "@/components/database-update";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import {
  MeetingForm,
  CalendarForm,
  CancelMeetingForm,
  CancelGoogleMeetingForm,
} from "@/components/acquisition/forms";
export const metadata = { title: "Calls and meetings" };
export default async function Schedule() {
  const { db, organization, role } = await requireContext();
  const [result, leads] = await Promise.all([
    db.rpc("acquisition_state", { org: organization.id }),
    db
      .from("leads")
      .select("id,business:businesses!inner(name)")
      .eq("organization_id", organization.id)
      .not("status", "in", "(Won,Lost,Suppressed)")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (missingDatabaseMigration(result.error)) return <DatabaseUpdate />;
  if (result.error || leads.error) throw Error("Could not load appointments.");
  const data = acquisitionSchema.parse(result.data),
    google = role === "owner" ? await connection(db, organization.id) : null;
  const connected = Boolean(
    google?.scopes.includes(
      "https://www.googleapis.com/auth/calendar.events.owned",
    ),
  );
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <>
      <PageHeading
        eyebrow="Sales / Agreed next steps"
        title="Make time for the right conversation."
        description="Monday–Friday, 7 a.m.–3 p.m. Eastern. Record an actual agreement before scheduling. Values are manual estimates, counted once per open lead."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        {role === "owner" && (
          <Card className="min-w-0 p-6">
            <h2 className="mb-5 text-lg">Record an agreed call or meeting</h2>
            <MeetingForm
              requestKey={randomUUID()}
              leads={(leads.data ?? []).map((l) => ({
                id: l.id,
                name: l.business.name,
              }))}
            />
          </Card>
        )}
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Latest 100 appointments. Local records do not create a Google event
            until you explicitly approve it.{" "}
            <Link
              href="/dashboard/connections"
              className="text-primary underline"
            >
              Google connection
            </Link>
          </p>
          {!data.meetings.length && (
            <Card className="p-6">No agreed appointments recorded yet.</Card>
          )}
          {data.meetings.map((m) => (
            <Card key={m.id} className="min-w-0 p-6">
              <h2 className="text-lg">
                {m.business_name} / {m.kind}
              </h2>
              <p className="mt-3 text-sm">
                {format(m.starts_at)} — {format(m.ends_at)} ET
              </p>
              <p className="mt-2 text-xs text-primary">{m.status}</p>
              <p className="mt-4 whitespace-pre-wrap text-xs leading-6">
                Agreement: {m.agreement_note}
              </p>
              {m.calendar_url && (
                <a
                  className="mt-4 block text-sm text-primary underline"
                  href={m.calendar_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Google event
                </a>
              )}
              {role === "owner" && m.status !== "cancelled" && (
                <>
                  <CalendarForm
                    id={m.id}
                    email={m.public_email}
                    connected={connected}
                  />
                  {["scheduled", "unknown"].includes(m.status) && (
                    <CancelGoogleMeetingForm id={m.id} connected={connected} />
                  )}
                  {!["syncing", "scheduled", "unknown"].includes(m.status) && (
                    <CancelMeetingForm id={m.id} />
                  )}
                </>
              )}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
