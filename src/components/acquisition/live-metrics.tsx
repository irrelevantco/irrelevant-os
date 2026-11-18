"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/utils";
import { z } from "zod";
const liveSchema = z.object({
  organization_id: z.string(),
  crm: z.object({
    total: z.number(),
    qualified: z.number(),
    open_value_cents: z.number(),
    follow_ups_due: z.number(),
  }),
  sales: z.object({
    meeting_value_cents: z.number(),
    meetings_without_estimate: z.number(),
  }),
});
type Live = z.infer<typeof liveSchema>;
export function LiveMetrics({ initial }: { initial: Live }) {
  const [data, setData] = useState(initial),
    [stale, setStale] = useState(false);
  useEffect(() => {
    let active = true,
      running = false;
    const abort = new AbortController();
    async function refresh() {
      if (!active || running || document.hidden) return;
      running = true;
      try {
        const response = await fetch("/api/live-summary", {
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok) throw Error();
        const next = liveSchema.parse(await response.json());
        if (active && next.organization_id === initial.organization_id) {
          setData(next);
          setStale(false);
        }
      } catch {
        if (active) setStale(true);
      } finally {
        running = false;
      }
    }
    const timer = setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [initial.organization_id]);
  const current =
    data.organization_id === initial.organization_id ? data : initial;
  const metrics = [
    {
      label: "Businesses in pipeline",
      value: current.crm.total.toLocaleString(),
      hint: "Every opportunity, one place",
    },
    {
      label: "Qualified & progressing",
      value: current.crm.qualified.toLocaleString(),
      hint: "Qualified through won",
    },
    {
      label: "Open opportunity value",
      value: money(current.sales.meeting_value_cents),
      hint: `Agreed calls / meetings · estimates, not revenue${current.sales.meetings_without_estimate ? ` · ${current.sales.meetings_without_estimate} without an estimate` : ""}`,
    },
    {
      label: "Follow-ups due",
      value: current.crm.follow_ups_due.toLocaleString(),
      hint: "Today and overdue · open leads",
    },
  ];
  return (
    <>
      <section
        aria-label="Pipeline metrics"
        className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {metrics.map((m, i) => (
          <Card key={m.label} className="p-5">
            <h2 className="mb-6 text-xs text-muted-foreground">{m.label}</h2>
            <p className="text-4xl tracking-[-.06em] tabular-nums">{m.value}</p>
            <p className="mt-3 text-[10px] text-muted-foreground">{m.hint}</p>
            <span className="sr-only">Metric {i + 1}</span>
          </Card>
        ))}
      </section>
      <p role="status" className="mb-8 text-xs text-muted-foreground">
        {stale
          ? "Refresh interrupted; displayed figures may be stale."
          : "Refreshes every 10 seconds while visible."}{" "}
        All open lead estimates: {money(current.crm.open_value_cents)}. Each
        lead is counted once in meeting-backed value.
      </p>
    </>
  );
}
