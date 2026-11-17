import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Plus } from "lucide-react";
import { getLeads, getSummary } from "@/lib/data";
import { money } from "@/lib/utils";
import { STATUSES } from "@/lib/domain";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LeadsTable } from "@/components/leads-table";
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
  const metrics = [
    {
      label: "Businesses in pipeline",
      value: summary.total.toLocaleString(),
      hint: "Every opportunity, one place",
      n: "01",
    },
    {
      label: "Qualified & progressing",
      value: summary.qualified.toLocaleString(),
      hint: "Qualified through won",
      n: "02",
    },
    {
      label: "Open opportunity value",
      value: money(summary.open_value_cents),
      hint: "Manual estimates · not revenue",
      n: "03",
    },
    {
      label: "Follow-ups due",
      value: summary.follow_ups_due.toLocaleString(),
      hint: "Today and overdue · open leads",
      n: "04",
    },
  ];
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
      <section
        aria-label="Pipeline metrics"
        className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {metrics.map((m) => (
          <Card key={m.n} className="relative overflow-hidden p-5">
            <div className="mb-6 flex justify-between gap-2">
              <h2 className="text-xs font-medium text-muted-foreground">
                {m.label}
              </h2>
              <span className="text-[10px] text-muted-foreground/60">
                /{m.n}
              </span>
            </div>
            <p className="text-4xl font-normal tracking-[-.06em] tabular-nums">
              {m.value}
            </p>
            <p className="mt-3 text-[10px] text-muted-foreground">{m.hint}</p>
            {m.n === "04" && (
              <div className="absolute bottom-0 left-0 h-0.5 w-full bg-primary/60" />
            )}
          </Card>
        ))}
      </section>
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
        <LeadsTable leads={recent.leads} />
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
