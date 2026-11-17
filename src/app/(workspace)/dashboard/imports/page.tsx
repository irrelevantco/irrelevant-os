import Link from "next/link";
import { requireContext } from "@/lib/context";
import { importSummary } from "@/lib/research-data";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { CsvImportForm } from "@/components/research/import-form";
import { dateTime } from "@/lib/utils";
export const metadata = { title: "Prospect imports" };
export default async function Imports() {
  const { db, organization, role } = await requireContext();
  const [summary, result] = await Promise.all([
    importSummary(),
    db
      .from("import_batches")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (result.error) throw new Error("Could not load import batches.");
  return (
    <>
      <PageHeading
        eyebrow="Acquisition / Imports"
        title="Start with a considered list."
        description="Preview your data, preserve its context, and bring good-fit prospects into your organization."
      />
      <section
        aria-label="Import results"
        className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {[
          ["Total imported", summary.total_imported],
          ["Duplicates skipped", summary.duplicates_skipped],
          ["Missing contact information", summary.missing_contact_information],
          ["Leads needing research", summary.leads_needing_research],
          ["Audits awaiting approval", summary.audits_awaiting_approval],
          ["Ready for outreach", summary.ready_for_outreach],
        ].map(([label, value]) => (
          <Card key={label} className="p-5">
            <h2 className="text-xs text-muted-foreground">{label}</h2>
            <p className="mt-4 text-3xl tabular-nums">{value}</p>
          </Card>
        ))}
      </section>
      <p className="mb-7 text-xs leading-6 text-muted-foreground">
        Missing contact information means either email or phone is missing. An
        empty email is unknown, not proof that email contact is unavailable.
        Research and approval counts can overlap.
      </p>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="min-w-0 p-5 sm:p-7">
          <h2 className="mb-5 text-lg">Import a prospect batch</h2>
          {role === "owner" ? (
            <CsvImportForm />
          ) : (
            <p className="text-sm text-muted-foreground">
              Only the organization owner can preview and import new batches.
            </p>
          )}
        </Card>
        <Card className="h-fit p-5">
          <h2 className="mb-4 text-base">Import history</h2>
          <div className="space-y-3">
            {result.data?.length ? (
              result.data.map((batch) => (
                <Link
                  key={batch.id}
                  href={`/dashboard/imports/${batch.id}`}
                  className="block rounded border border-border p-4 hover:border-primary/40"
                >
                  <p className="text-sm">{batch.label}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {batch.status} · {dateTime(batch.created_at)}
                  </p>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No batches yet. Loading a CSV alone does not import it.
              </p>
            )}
          </div>
          <Link
            href="/dashboard/research"
            className="mt-6 block text-sm text-primary underline"
          >
            Open research queue →
          </Link>
        </Card>
      </div>
    </>
  );
}
