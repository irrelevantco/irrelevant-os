// Explicit local-only bootstrap/import. No admin/service-role key and no external communications.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { autoMapping, parseCsv, previewRows } from "../src/lib/imports/csv";
import type { Database, Json } from "../src/lib/supabase/database.types";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error(
    "Batch bootstrap is restricted to the local development backend. Use the authenticated import UI elsewhere.",
  );
const db = createClient<Database>(
  url,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const ownerFile = "work/local-owner.json";
const existing = existsSync(ownerFile);
const owner: { email: string; password: string; organization_id?: string } =
  existing
    ? JSON.parse(readFileSync(ownerFile, "utf8"))
    : {
        email: `owner-${randomUUID().slice(0, 8)}@irrelevant.local`,
        password: randomBytes(24).toString("base64url") + "aA1!",
      };
if (!existing) {
  writeFileSync(ownerFile, JSON.stringify(owner, null, 2) + "\n", {
    mode: 0o600,
  });
  const signup = await db.auth.signUp({
    email: owner.email,
    password: owner.password,
  });
  if (signup.error || !signup.data.session)
    throw new Error(
      "Local owner signup failed. Preserve the generated login file and inspect local Auth configuration.",
    );
} else {
  const signin = await db.auth.signInWithPassword(owner);
  if (signin.error)
    throw new Error(
      "Could not sign in to the preserved local owner account. No credentials were replaced.",
    );
}
if (!owner.organization_id) {
  const org = await db.rpc("create_organization", {
    organization_name: "iRRELEVANT CO",
  });
  if (org.error || !org.data)
    throw new Error(
      org.error?.message || "Could not create local organization",
    );
  owner.organization_id = org.data;
  writeFileSync(ownerFile, JSON.stringify(owner, null, 2) + "\n", {
    mode: 0o600,
  });
}
const text = readFileSync(
  "data/imports/irrelevant_os_30_prospects.csv",
  "utf8",
);
const { headers, records } = parseCsv(text);
const mapping = autoMapping(headers);
const rows = previewRows(records, mapping);
if (rows.length !== 30 || rows.some((row) => row.errors.length))
  throw new Error("Bundled Batch 001 must contain exactly 30 valid records.");
const fingerprint = createHash("sha256")
  .update(
    "prospects-v1\n" +
      text +
      "\n" +
      JSON.stringify(Object.entries(mapping).sort()),
  )
  .digest("hex");
const preview = await db.rpc("preview_prospect_import", {
  org: owner.organization_id,
  batch_label: "Prospect Batch 001",
  file_name: "irrelevant_os_30_prospects.csv",
  file_fingerprint: fingerprint,
  field_mapping: mapping,
  rows: rows as unknown as Json,
});
if (preview.error || !preview.data)
  throw new Error(preview.error?.message || "Preview failed");
const priorBatch = await db
  .from("import_batches")
  .select("status")
  .eq("id", preview.data)
  .single();
if (priorBatch.error) throw new Error("Could not verify batch state.");
const firstImport = priorBatch.data.status === "preview";
const commit = await db.rpc("commit_prospect_import", {
  org: owner.organization_id,
  batch: preview.data,
});
if (commit.error) throw new Error(commit.error.message);
const replay = await db.rpc("commit_prospect_import", {
  org: owner.organization_id,
  batch: preview.data,
});
if (replay.error) throw new Error(replay.error.message);
const summary = await db.rpc("prospect_import_summary", {
  org: owner.organization_id,
  batch: preview.data,
});
if (summary.error) throw new Error(summary.error.message);
const importedRows = await db
  .from("import_rows")
  .select("lead_id,status")
  .eq("batch_id", preview.data)
  .eq("organization_id", owner.organization_id);
if (importedRows.error) throw new Error("Could not inspect imported rows.");
const leadIds = [
  ...new Set(
    importedRows.data
      .map((row) => row.lead_id)
      .filter((id): id is string => Boolean(id)),
  ),
];
const { data: leads, error } = await db
  .from("leads")
  .select("id,status,research_priority,estimated_value_cents")
  .eq("organization_id", owner.organization_id)
  .in("id", leadIds);
if (error || leads?.length !== 30)
  throw new Error("Expected exactly 30 leads after idempotency replay.");
const newlyImportedIds = new Set(
  importedRows.data
    .filter((row) => row.status === "imported")
    .map((row) => row.lead_id),
);
if (
  firstImport &&
  leads.some(
    (l) =>
      newlyImportedIds.has(l.id) &&
      (l.status !== "Discovered" || l.estimated_value_cents !== null),
  )
)
  throw new Error("New batch must remain Discovered with no assumed budget.");
const result = {
  organization_id: owner.organization_id,
  batch_id: preview.data,
  summary: summary.data,
  priorities: Object.fromEntries(
    ["A", "B", "C"].map((p) => [
      p,
      leads.filter((l) => l.research_priority === p).length,
    ]),
  ),
  reimport_created_additional_records: false,
};
writeFileSync(
  "work/batch-001-results.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
console.log(
  "Owner login details are saved only in ignored work/local-owner.json. No password or auth token is printed.",
);
