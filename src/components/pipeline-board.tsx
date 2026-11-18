"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { type PipelineStatus } from "@/lib/domain";
import { pipelineGroups, stagePage, type PipelineLead } from "@/lib/pipeline";
import { money } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/input";
import { LeadItem, LeadMenuButton } from "./lead-actions";

export function PipelineBoard({
  leads,
  totals,
  canDelete,
}: {
  leads: PipelineLead[];
  totals: Record<string, number>;
  canDelete: boolean;
}) {
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const groups = pipelineGroups(leads, query);
  const first = groups.find((g) => g.leads.length)?.status;
  const matches = groups.reduce((sum, group) => sum + group.leads.length, 0);
  function toggleAll(expand: boolean) {
    root.current
      ?.querySelectorAll<HTMLDetailsElement>("details[data-stage]")
      .forEach((el) => {
        el.open = expand && Number(el.dataset.count) > 0;
      });
  }
  return (
    <div
      ref={root}
      role="region"
      aria-label="Pipeline board"
      className="min-w-0 space-y-4"
    >
      <div className="sticky top-2 z-20 space-y-3 rounded-lg border border-border bg-card p-4 shadow-lg">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-0 flex-1 basis-52">
            <label htmlFor="pipeline-search" className="sr-only">
              Search pipeline
            </label>
            <Input
              id="pipeline-search"
              type="search"
              placeholder="Search business, industry or location…"
              value={query}
              maxLength={160}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="min-w-0 flex-1 basis-48 sm:max-w-64">
            <label htmlFor="pipeline-jump" className="sr-only">
              Jump to stage
            </label>
            <Select
              id="pipeline-jump"
              defaultValue=""
              onChange={(event) => {
                const i = Number(event.target.value);
                if (event.target.value === "") return;
                const stage = root.current?.querySelector<HTMLDetailsElement>(
                  `details[data-stage="${i}"]`,
                );
                if (stage) {
                  stage.open = true;
                  stage.scrollIntoView({ block: "start" });
                  stage.querySelector("summary")?.focus();
                }
                event.target.value = "";
              }}
            >
              <option value="">Jump to stage…</option>
              {groups.map((g, i) => (
                <option value={i} key={g.status}>
                  {g.status} ({totals[g.status] ?? 0})
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p role="status">
            {query
              ? `${matches} matching leads in the loaded pipeline`
              : `${leads.length} loaded leads · 12 cards per stage page`}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className="hover:text-primary underline"
              onClick={() => toggleAll(true)}
            >
              Expand populated stages
            </button>
            <button
              type="button"
              className="hover:text-primary underline"
              onClick={() => toggleAll(false)}
            >
              Collapse all
            </button>
          </div>
        </div>
      </div>
      {query && matches === 0 && (
        <p className="py-4 text-sm text-muted-foreground">
          No leads match this search.
        </p>
      )}
      {groups.map((group, index) => (
        <Stage
          key={`${group.status}:${query}`}
          status={group.status}
          index={index}
          leads={group.leads}
          total={totals[group.status] ?? 0}
          defaultOpen={group.status === first}
          canDelete={canDelete}
          searching={!!query}
        />
      ))}
    </div>
  );
}

function Stage({
  status,
  index,
  leads,
  total,
  defaultOpen,
  canDelete,
  searching,
}: {
  status: PipelineStatus;
  index: number;
  leads: PipelineLead[];
  total: number;
  defaultOpen: boolean;
  canDelete: boolean;
  searching: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [requested, setPage] = useState(1);
  const current = stagePage(leads, requested);
  return (
    <details
      data-stage={index}
      data-count={leads.length}
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
      className="group/stage scroll-mt-52 min-w-0 rounded-lg border border-border bg-card/70 sm:scroll-mt-36"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="eyebrow text-muted-foreground">
          /{String(index + 1).padStart(2, "0")}
        </span>
        <h2 className="min-w-0 flex-1 text-sm font-medium sm:text-base">
          {status}
        </h2>
        <span className="shrink-0 rounded bg-secondary px-2 py-1 text-xs tabular-nums text-muted-foreground">
          {searching ? `${leads.length} match` : total}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/stage:rotate-180"
        />
      </summary>
      <div className="border-t border-border p-3 sm:p-5">
        {leads.length ? (
          <>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {current.items.map((lead) => (
                <LeadItem
                  key={lead.id}
                  lead={{
                    id: lead.id,
                    name: lead.business.name,
                    updatedAt: lead.updated_at,
                  }}
                  canDelete={canDelete}
                  returnTo="/dashboard/pipeline"
                  className="min-w-0 rounded-md border border-border bg-background p-4 hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="flex min-w-0 flex-1 items-start gap-2 hover:text-primary"
                    >
                      <h3 className="min-w-0 flex-1 break-words text-sm font-medium">
                        {lead.business.name}
                      </h3>
                      <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                    <LeadMenuButton />
                  </div>
                  <Link href={`/dashboard/leads/${lead.id}`} className="block">
                    <p className="mt-2 break-words text-xs text-muted-foreground">
                      {lead.business.industry}
                    </p>
                    <p className="mt-1 break-words text-[11px] text-muted-foreground">
                      {lead.business.location}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-[11px]">
                      <span className="text-primary">
                        {lead.estimated_value_cents === null
                          ? "Value not set"
                          : money(lead.estimated_value_cents)}
                      </span>
                      <span className="text-muted-foreground">
                        {lead.next_follow_up ?? "No follow-up"}
                      </span>
                    </div>
                  </Link>
                </LeadItem>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <p>
                Showing {current.start + 1}–
                {current.start + current.items.length} of {leads.length}
                {!searching && total > leads.length
                  ? ` loaded (${total} total in stage)`
                  : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={current.page === 1}
                  aria-label={`Previous ${status} leads`}
                  onClick={() => setPage(current.page - 1)}
                >
                  ← Previous
                </Button>
                <span className="tabular-nums">
                  {current.page} / {current.pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={current.page === current.pages}
                  aria-label={`Next ${status} leads`}
                  onClick={() => setPage(current.page + 1)}
                >
                  Next →
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="py-5 text-center text-xs text-muted-foreground">
            {searching
              ? "No matching leads in this stage."
              : "No loaded leads in this stage."}
          </p>
        )}
      </div>
    </details>
  );
}
