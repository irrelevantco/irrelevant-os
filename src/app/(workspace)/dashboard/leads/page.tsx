import Link from "next/link";
import { Columns3, Plus, Search } from "lucide-react";
import { getLeads } from "@/lib/data";
import { STATUSES } from "@/lib/domain";
import { PageHeading } from "@/components/page-heading";
import { LeadsTable } from "@/components/leads-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
export const metadata = { title: "Leads" };
export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    due?: string;
  }>;
}) {
  const p = await searchParams;
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(p.page || "1") || 1),
  );
  const q = (p.q || "").slice(0, 160);
  const status = STATUSES.includes(p.status as (typeof STATUSES)[number])
    ? p.status!
    : "";
  const due = p.due === "1";
  const { leads, count } = await getLeads({ search: q, status, page, due });
  const pageLink = (n: number) =>
    `/dashboard/leads?${new URLSearchParams({ q, status, page: String(n), ...(due ? { due: "1" } : {}) })}`;
  return (
    <>
      <PageHeading
        eyebrow="Acquisition / Relationships"
        title="Good fits. Real potential."
        description="Build a considered pipeline, with the context to move each opportunity forward."
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/pipeline">
                <Columns3 />
                Board
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/leads/new">
                <Plus />
                Add business
              </Link>
            </Button>
          </div>
        }
      />
      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div className="min-w-44 flex-1">
            <label htmlFor="lead-search" className="sr-only">
              Business name
            </label>
            <Input
              id="lead-search"
              name="q"
              defaultValue={q}
              placeholder="Search by business name…"
              maxLength={160}
            />
          </div>
          <div className="w-48">
            <label htmlFor="status-filter" className="sr-only">
              Pipeline status
            </label>
            <Select id="status-filter" name="status" defaultValue={status}>
              <option value="">All stages</option>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
          <label className="flex h-11 items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              name="due"
              value="1"
              defaultChecked={due}
              className="accent-primary"
            />
            Follow-ups due
          </label>
          <Button type="submit" variant="outline">
            <Search />
            Filter
          </Button>
          {(q || status || due) && (
            <Link
              className="py-3 text-xs text-muted-foreground underline"
              href="/dashboard/leads"
            >
              Clear
            </Link>
          )}
        </form>
        <LeadsTable leads={leads} filtered={Boolean(q || status || due)} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
          <span>
            {count
              ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, count)} of ${count}`
              : "0"}{" "}
            businesses{q || status || due ? " match" : ""}
          </span>
          <div className="flex items-center gap-4">
            {page > 1 && (
              <Link href={pageLink(page - 1)} className="hover:text-primary">
                ← Previous
              </Link>
            )}
            <span>
              Page {page} of {Math.max(1, Math.ceil(count / 25))}
            </span>
            {page * 25 < count && (
              <Link href={pageLink(page + 1)} className="hover:text-primary">
                Next →
              </Link>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
