import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/context";
import { importSummary } from "@/lib/research-data";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CommitImportForm } from "@/components/research/import-form";
export const metadata = { title: "Batch results" };
export default async function Batch({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { db, organization, role } = await requireContext();
  const [batch, rows, summary] = await Promise.all([
    db
      .from("import_batches")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    db
      .from("import_rows")
      .select("*")
      .eq("batch_id", id)
      .eq("organization_id", organization.id)
      .order("row_number"),
    importSummary(id),
  ]);
  if (batch.error || rows.error)
    throw new Error("Could not load import preview.");
  if (!batch.data) notFound();
  const counts = rows.data.reduce<Record<string, number>>(
    (a, row) => ({ ...a, [row.status]: (a[row.status] ?? 0) + 1 }),
    {},
  );
  return (
    <>
      <Link
        href="/dashboard/imports"
        className="mb-5 inline-block text-xs text-muted-foreground underline"
      >
        ← All imports
      </Link>
      <PageHeading
        eyebrow={`CSV / ${batch.data.filename}`}
        title={batch.data.label}
        description={
          batch.data.status === "preview"
            ? "Review every mapped row. Only the explicit import action will create businesses and leads."
            : "This batch is complete. Loading the same file and mapping returns this result without importing again."
        }
        action={<Badge>{batch.data.status}</Badge>}
      />
      <div className="mb-6 flex flex-wrap gap-3">
        {Object.entries(counts).map(([status, count]) => (
          <Badge key={status}>
            {count} {status}
          </Badge>
        ))}
      </div>
      {batch.data.status === "completed" && (
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-base">Import results</h2>
          <dl className="grid gap-5 sm:grid-cols-3">
            {Object.entries(summary).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-muted-foreground">
                  {key.replaceAll("_", " ")}
                </dt>
                <dd className="mt-2 text-xl">{value}</dd>
              </div>
            ))}
          </dl>
          <Link
            href="/dashboard/research"
            className="mt-5 block text-sm text-primary underline"
          >
            Research these prospects →
          </Link>
        </Card>
      )}
      <Card className="mb-6">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                {[
                  "CSV row",
                  "Business / location",
                  "Priority",
                  "Unverified research hypothesis",
                  "Result",
                ].map((label) => (
                  <th key={label} className="p-4 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.data.map((row) => {
                const payload = (row.payload ?? row.raw_row) as Record<
                  string,
                  unknown
                >;
                return (
                  <tr key={row.id}>
                    <td className="p-4">{row.row_number}</td>
                    <td className="max-w-72 p-4">
                      <p>
                        {String(payload.business_name ?? "Invalid identity")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {String(payload.location ?? "")}
                      </p>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Mapped data & original row
                        </summary>
                        <pre className="mt-3 max-w-80 whitespace-pre-wrap break-words text-[11px]">
                          {JSON.stringify(
                            { mapped: row.payload, original: row.raw_row },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </td>
                    <td className="p-4">
                      {String(payload.research_priority || "—")}
                    </td>
                    <td className="max-w-72 p-4 text-xs leading-6 text-muted-foreground">
                      {String(
                        payload.audit_hypothesis_not_verified || "Not supplied",
                      )}
                      <p className="mt-1 text-[10px] text-primary">
                        Not a verified finding
                      </p>
                    </td>
                    <td className="max-w-72 p-4">
                      <Badge>{row.status}</Badge>
                      {row.duplicate_reason && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {row.duplicate_reason}
                        </p>
                      )}
                      {Array.isArray(row.errors) && row.errors.length > 0 && (
                        <ul className="mt-2 list-inside list-disc text-xs text-red-300">
                          {row.errors.map((error, i) => (
                            <li key={i}>{String(error)}</li>
                          ))}
                        </ul>
                      )}
                      {row.lead_id && (
                        <Link
                          href={`/dashboard/research/${row.lead_id}`}
                          className="mt-3 block text-xs text-primary underline"
                        >
                          Open review →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {batch.data.status === "preview" && role === "owner" && (
        <Card className="p-5">
          <CommitImportForm batch={id} />
        </Card>
      )}
    </>
  );
}
