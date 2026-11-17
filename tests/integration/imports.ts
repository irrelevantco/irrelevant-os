import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { assertLocalTestEnvironment } from "./local-guard";
import { parseCsv, autoMapping, previewRows } from "../../src/lib/imports/csv";
import { PILLARS } from "../../src/lib/reviews";
import type { Database, Json } from "../../src/lib/supabase/database.types";
const { url, key } = assertLocalTestEnvironment();
const run = randomUUID().slice(0, 8);
const make = () =>
  createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const a = make(),
  b = make(),
  member = make(),
  anonymous = make();
let passed = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  passed++;
}
for (const [i, client] of [a, b, member].entries()) {
  const result = await client.auth.signUp({
    email: `imports-${i}-${run}@example.test`,
    password: `Test-only-${randomUUID()}!`,
  });
  assert.ok(
    result.data.session,
    result.error?.message ?? "Expected local session",
  );
}
const orgA = (
  await a.rpc("create_organization", {
    organization_name: `Import Test A ${run}`,
  })
).data!;
const orgB = (
  await b.rpc("create_organization", {
    organization_name: `Import Test B ${run}`,
  })
).data!;
assert.ok(orgA && orgB);
const memberId = (await member.auth.getUser()).data.user!.id;
const membership = spawnSync(
  "docker",
  [
    "compose",
    "--env-file",
    "work/stack.env",
    "-f",
    "compose.phase1.yml",
    "exec",
    "-T",
    "db",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
  ],
  {
    input: `insert into public.organization_members(organization_id,user_id,role) values ('${orgA}','${memberId}','member');`,
    encoding: "utf8",
  },
);
assert.equal(membership.status, 0, membership.stderr);
const csv = `business_name,location,industry,website,public_phone,research_priority,audit_hypothesis_not_verified,verified_digital_issue\nExample & Co ${run},Erie PA,Cleaning,https://${run}.example.test,814-555-0100,A,Maybe a quote flow opportunity,Unverified supplied claim\nOther Co ${run},Erie PA,HVAC,,814-555-0101,B,Research first,\nEXAMPLE AND CO. ${run},erie pa,Cleaning,,,A,Repeated row,\nX,Erie PA,Cleaning,javascript:alert(1),,C,Invalid row,`;
const parsed = parseCsv(csv);
const mapping = autoMapping(parsed.headers);
const rows = previewRows(parsed.records, mapping);
const args = {
  org: orgA,
  batch_label: "Integration batch",
  file_name: "synthetic.csv",
  file_fingerprint: createHash("sha256").update(csv).digest("hex"),
  field_mapping: mapping,
  rows: rows as unknown as Json,
};
const preview = await a.rpc("preview_prospect_import", args);
assert.ok(preview.data, JSON.stringify(preview.error));
const batch = preview.data;
check(
  (await a.from("leads").select("id")).data?.length === 0,
  "Preview creates no leads",
);
const previewStatuses = (
  await a.from("import_rows").select("status").eq("batch_id", batch)
).data!;
check(
  previewStatuses.filter((r) => r.status === "valid").length === 2,
  "Preview identifies valid rows",
);
check(
  previewStatuses.filter((r) => r.status === "duplicate").length === 1,
  "Preview detects normalized in-file duplicate",
);
check(
  previewStatuses.filter((r) => r.status === "invalid").length === 1,
  "Preview preserves row-level validation errors",
);
check(
  (await b.from("import_batches").select("id")).data?.length === 0,
  "Other tenant cannot read batches",
);
check(
  (await b.from("import_rows").select("id")).data?.length === 0,
  "Other tenant cannot read row data",
);
check(
  Boolean((await b.rpc("commit_prospect_import", { org: orgA, batch })).error),
  "Cross-tenant commit denied",
);
check(
  Boolean((await member.rpc("preview_prospect_import", args)).error),
  "Non-owner cannot create imports",
);
check(
  Boolean(
    (await member.rpc("commit_prospect_import", { org: orgA, batch })).error,
  ),
  "Non-owner cannot commit imports",
);
check(
  Boolean((await anonymous.rpc("preview_prospect_import", args)).error),
  "Anonymous preview denied",
);
check(
  Boolean(
    (
      await a
        .from("import_batches")
        .update({ status: "completed" })
        .eq("id", batch)
    ).error,
  ),
  "Direct result forgery denied",
);
const commits = await Promise.all([
  a.rpc("commit_prospect_import", { org: orgA, batch }),
  a.rpc("commit_prospect_import", { org: orgA, batch }),
]);
check(
  commits.every((r) => !r.error),
  "Concurrent idempotent commits succeed",
);
check(
  (await a.rpc("preview_prospect_import", args)).data === batch,
  "Same fingerprint returns original batch",
);
const leads = (
  await a
    .from("leads")
    .select("*")
    .eq("organization_id", orgA)
    .order("research_priority")
).data!;
check(leads.length === 2, "Repeated commits create exactly two leads");
check(
  leads.every(
    (l) => l.status === "Discovered" && l.estimated_value_cents === null,
  ),
  "Imported leads have no ready status or assumed budget",
);
const lead = leads[0];
check(
  lead.research_priority === "A" && Boolean(lead.audit_hypothesis_not_verified),
  "Priority and unverified hypothesis preserved",
);
check(
  (lead.research_metadata as Record<string, Json>).independently_verified ===
    false,
  "Imported metadata never implies verified research",
);
check(
  (await a.from("growth_review_points").select("*")).data?.every(
    (p) =>
      p.verification_status === "unverified" && !p.observation && !p.source_url,
  ),
  "All review observations start unverified and empty",
);
check(
  (await a.from("outreach_drafts").select("*")).data?.every(
    (d) => d.status === "draft" && d.email_draft.length > 0,
  ),
  "Persisted introductions remain draft-only",
);
check(
  (await b.from("growth_reviews").select("id")).data?.length === 0,
  "Other tenant cannot read reviews",
);
check(
  (await b.from("growth_review_points").select("id")).data?.length === 0,
  "Other tenant cannot read observations",
);
check(
  (await b.from("outreach_drafts").select("id")).data?.length === 0,
  "Other tenant cannot read outreach drafts",
);
check(
  Boolean(
    (
      await a
        .from("leads")
        .update({ status: "Ready for Outreach" })
        .eq("id", lead.id)
    ).error,
  ),
  "Pipeline status cannot bypass evidence and approval",
);
check(
  Boolean(
    (
      await a.rpc("approve_growth_review", {
        org: orgA,
        lead: lead.id,
        expected_revision: 1,
      })
    ).error,
  ),
  "Unverified review cannot be approved",
);
const review = (
  await a.from("growth_reviews").select("*").eq("lead_id", lead.id).single()
).data!;
check(
  Boolean(
    (
      await a
        .from("growth_reviews")
        .update({ approved_at: new Date().toISOString() })
        .eq("id", review.id)
    ).error,
  ),
  "Direct approval forgery denied",
);
const points = PILLARS.map((pillar, i) => ({
  pillar,
  observation:
    i === 0 ? "Synthetic test observation, not a real business finding." : "",
  recommendation: i === 0 ? "Synthetic test recommendation" : "",
  source_url: i === 0 ? "https://example.test/test-evidence" : null,
  verification_status: i === 0 ? "verified" : "unverified",
  confidence: i === 0 ? "high" : "unknown",
  last_researched_date: i === 0 ? "2026-11-17" : null,
}));
check(
  Boolean(
    (
      await b.rpc("save_growth_review", {
        org: orgA,
        lead: lead.id,
        expected_revision: 1,
        points,
        offer: "",
      })
    ).error,
  ),
  "Other tenant cannot edit review",
);
check(
  !(
    await member.rpc("save_growth_review", {
      org: orgA,
      lead: lead.id,
      expected_revision: 1,
      points,
      offer: "Scope discussion required",
    })
  ).error,
  "Organization member can record research",
);
check(
  Boolean(
    (
      await a.rpc("approve_growth_review", {
        org: orgA,
        lead: lead.id,
        expected_revision: 1,
      })
    ).error,
  ),
  "Stale review version cannot be approved",
);
check(
  Boolean(
    (
      await member.rpc("approve_growth_review", {
        org: orgA,
        lead: lead.id,
        expected_revision: 2,
      })
    ).error,
  ),
  "Member cannot perform owner approval",
);
check(
  !(
    await a.rpc("approve_growth_review", {
      org: orgA,
      lead: lead.id,
      expected_revision: 2,
    })
  ).error,
  "Owner can explicitly approve sourced review",
);
check(
  (await a.from("leads").select("status").eq("id", lead.id).single()).data
    ?.status === "Ready for Outreach",
  "Approval sets Ready for Outreach",
);
check(
  !(
    await a.rpc("save_outreach_draft", {
      org: orgA,
      lead: lead.id,
      email_body: "Synthetic draft, never sent",
      opening_script: "Synthetic call opener",
    })
  ).error,
  "Optional follow-up can be cleared without sending",
);
check(
  Boolean(
    (
      await a
        .from("outreach_drafts")
        .update({ status: "sent" })
        .eq("lead_id", lead.id)
    ).error,
  ),
  "Draft cannot become sent through direct update",
);
check(
  !(
    await a.rpc("save_growth_review", {
      org: orgA,
      lead: lead.id,
      expected_revision: 2,
      points,
      offer: "Revised scope suggestion",
    })
  ).error,
  "Review can be edited after approval",
);
check(
  (
    await a
      .from("growth_reviews")
      .select("approved_at")
      .eq("id", review.id)
      .single()
  ).data?.approved_at === null,
  "Editing invalidates approval",
);
check(
  (await a.from("leads").select("status").eq("id", lead.id).single()).data
    ?.status === "Researching",
  "Editing demotes Ready lead to Researching",
);
check(
  Boolean(
    (
      await a.rpc("save_growth_review", {
        org: orgA,
        lead: lead.id,
        expected_revision: 2,
        points,
        offer: "Stale overwrite",
      })
    ).error,
  ),
  "Stale edits rejected",
);
const invalidPoints = points.map((p, i) =>
  i === 0 ? { ...p, source_url: null } : p,
);
check(
  Boolean(
    (
      await a.rpc("save_growth_review", {
        org: orgA,
        lead: lead.id,
        expected_revision: 3,
        points: invalidPoints,
        offer: "",
      })
    ).error,
  ),
  "Database rejects source-less verified point",
);
const dupeRows = previewRows(
  parsed.records.slice(0, 1).map((r) => ({
    ...r,
    business_name: "Renamed alias",
    website: `https://www.${run}.example.test/elsewhere`,
  })),
  mapping,
);
const dupe = await a.rpc("preview_prospect_import", {
  ...args,
  file_fingerprint: createHash("sha256")
    .update(run + "alias")
    .digest("hex"),
  rows: dupeRows as unknown as Json,
});
assert.ok(dupe.data, dupe.error?.message ?? "Expected duplicate preview");
assert.ok(
  !(await a.rpc("commit_prospect_import", { org: orgA, batch: dupe.data }))
    .error,
);
check(
  (await a.from("leads").select("id")).data?.length === 2,
  "New file with duplicate domain does not create another lead",
);
check(
  (await a.from("import_rows").select("status").eq("batch_id", dupe.data))
    .data?.[0].status === "duplicate",
  "Existing domain duplicate is reported",
);
const summary = await a.rpc("prospect_import_summary", { org: orgA, batch });
const summaryData = summary.data as Record<string, number>;
check(
  summaryData.total_imported === 2 &&
    summaryData.duplicates_skipped === 1 &&
    summaryData.row_errors === 1,
  "Import summary matches persisted results",
);
check(
  (await b.rpc("prospect_import_summary", { org: orgA })).data !== null &&
    (
      (await b.rpc("prospect_import_summary", { org: orgA })).data as Record<
        string,
        number
      >
    ).total_imported === 0,
  "Summary RPC cannot leak another tenant",
);
console.log(
  `${passed} import, idempotency, review-approval and RLS assertions passed. Synthetic fixtures are isolated in Import Test organizations.`,
);
