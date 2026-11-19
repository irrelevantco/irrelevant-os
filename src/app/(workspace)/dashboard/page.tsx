import { requireContext } from "@/lib/context";
import { LiveMetrics } from "@/components/acquisition/live-metrics";
import { DatabaseUpdate } from "@/components/database-update";
import { missingDatabaseMigration } from "@/lib/database-failure";
import { z } from "zod";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Plus } from "lucide-react";
import { getLeads, getSummary } from "@/lib/data";
import { STATUSES } from "@/lib/domain";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LeadsTable } from "@/components/leads-table";
import { InventoryCard } from "@/components/engine/inventory";
export const metadata = { title: "Overview" };
export default async function Dashboard() {
  const [summary, recent, due] = await Promise.all([
    getSummary(),
    getLeads({ limit: 5 }),
    getLeads({ limit: 4, due: true }),
  ]);
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date());
  const { db, organization } = await requireContext();
  const sales = await db.rpc("acquisition_state", {
    org: organization.id,
    payload: { metrics_only: true },
  });
  if (missingDatabaseMigration(sales.error)) return <DatabaseUpdate />;
  if (sales.error) throw Error("Could not load appointment metrics.");
  const salesMetrics = z
    .object({
      meeting_value_cents: z.number(),
      meetings_without_estimate: z.number(),
    })
    .parse(sales.data);
  return (
    <>
      <PageHeading
        eyebrow={`Your workspace / ${day}`}
        title="Make the next move."
        description="A clear view of your pipeline. A little more focus on what matters."
        action={
          <Button asChild>
            <Link href="/dashboard/leads/new">
              <Plus />
              Add business
            </Link>
          </Button>
        }
      />
      <LiveMetrics
        initial={{
          organization_id: organization.id,
          crm: summary,
          sales: salesMetrics,
        }}
      />
      <InventoryCard />
      <div className="mb-7 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-border px-5 py-5">
            <div>
              <p className="eyebrow text-muted-foreground">
                The bigger picture
              </p>
              <h2 className="mt-1.5 text-base font-medium">
                Pipeline at a glance
              </h2>
            </div>
            <Button asChild size="icon" variant="ghost">
              <Link href="/dashboard/pipeline" aria-label="Open pipeline">
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
          <div className="space-y-4 p-5">
            {STATUSES.filter((s) => !["Lost", "Suppressed"].includes(s)).map(
              (s) => {
                const count = summary.by_status[s] ?? 0;
                return (
                  <div
                    key={s}
                    className="grid grid-cols-[130px_1fr_24px] items-center gap-3 text-xs"
                  >
                    <Link
                      href={`/dashboard/leads?status=${encodeURIComponent(s)}`}
                      className="text-muted-foreground hover:text-primary"
                    >
                      {s}
                    </Link>
                    <div className="h-1.5 rounded-full bg-secondary">
                      <div
                        className="h-1.5 rounded-full bg-primary/80"
                        style={{
                          width: `${summary.total ? (count / summary.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-right tabular-nums">{count}</span>
                  </div>
                );
              },
            )}
          </div>
        </Card>
        <Card className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-5">
            <div>
              <p className="eyebrow text-muted-foreground">
                Keep things moving
              </p>
              <h2 className="mt-1.5 text-base font-medium">Your follow-ups</h2>
            </div>
            <CalendarDays className="size-4 text-primary" strokeWidth={1.5} />
          </div>
          {due.leads.length ? (
            <div className="divide-y divide-border">
              {due.leads.map((l) => (
                <Link
                  key={l.id}
                  href={`/dashboard/leads/${l.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-secondary/40"
                >
                  <div>
                    <p className="text-sm font-medium">{l.business.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {l.next_follow_up} · {l.status}
                    </p>
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="m-auto flex flex-col items-center px-7 py-9 text-center">
              <div className="mb-5 flex size-16 items-center justify-center rounded-full border border-dashed border-primary/35">
                <CalendarDays
                  className="size-6 text-primary/70"
                  strokeWidth={1}
                />
              </div>
              <p className="editorial text-2xl">A little breathing room.</p>
              <p className="mt-3 max-w-56 text-xs leading-5 text-muted-foreground">
                No follow-ups due. Schedule your next action on any lead to keep
                the momentum going.
              </p>
            </div>
          )}
          <Link
            href="/dashboard/leads?due=1"
            className="mt-auto flex items-center justify-between border-t border-border px-5 py-4 text-xs text-muted-foreground hover:text-primary"
          >
            View follow-up queue
            <ArrowRight className="size-3.5" />
          </Link>
        </Card>
      </div>
      <Card>
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <p className="eyebrow text-muted-foreground">
              Relationships in motion
            </p>
            <h2 className="mt-1.5 text-base font-medium">Recently updated</h2>
          </div>
          <Link
            href="/dashboard/leads"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
          >
            All leads
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <LeadsTable leads={recent.leads} canDelete={recent.canDelete} />
      </Card>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Built for fit. Designed for follow-through.</span>
        <span>
          {summary.won} {summary.won === 1 ? "opportunity" : "opportunities"}{" "}
          marked won · Contract and payment tracking arrives in a later phase.
        </span>
      </div>
    </>
  );
}
