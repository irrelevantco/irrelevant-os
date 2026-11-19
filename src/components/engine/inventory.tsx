import Link from "next/link";
import { requireContext } from "@/lib/context";
import { inventorySchema } from "@/lib/engine/contracts";
import { Card } from "../ui/card";
export async function InventoryCard() {
  const { db, organization, user } = await requireContext();
  const result = await db.rpc("inventory_summary", { org: organization.id });
  if (result.error)
    return (
      <Card className="mb-7 p-5 text-sm">
        <Link className="text-primary underline" href="/dashboard/engine">
          Acquisition engine & count reconciliation →
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          Apply the app’s local database update to open the inventory report.
        </p>
      </Card>
    );
  const data = inventorySchema.parse(result.data);
  return (
    <Card className="mb-7 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base">Your lead inventory</h2>
          <p className="mt-2 break-words text-xs text-muted-foreground">
            {organization.name} · {user.email}. These counts come from the full
            workspace database.
          </p>
        </div>
        <a
          className="text-sm text-primary underline"
          href="/api/engine/inventory"
        >
          Download count report
        </a>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Active leads", data.active_leads],
          ["In Trash", data.trashed_leads ?? "Owner only"],
          ["Public email recorded", data.with_public_email],
          ["Uncommitted preview rows", data.preview_rows],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-2 text-2xl tabular-nums">
              {typeof value === "number" ? value.toLocaleString() : value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-xs leading-6 text-muted-foreground">
        {data.imported_rows.toLocaleString()} historical imported rows ·{" "}
        {data.duplicates_skipped.toLocaleString()} duplicate rows skipped ·{" "}
        {data.invalid_rows.toLocaleString()} invalid rows. Import rows are not
        necessarily distinct leads. Trash and uncommitted previews are excluded
        from active totals. An app update does not synchronize another PC’s
        database.
      </p>
      <div className="mt-3 flex flex-wrap gap-5 text-xs text-primary underline">
        <Link href="/dashboard/leads/trash">Review Trash</Link>
        <Link href="/dashboard/imports">Review import results</Link>
        <Link href="/dashboard/engine">Grow the pipeline →</Link>
      </div>
    </Card>
  );
}
