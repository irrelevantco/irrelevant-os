// Disposable loopback database only; no hosted records or providers are touched.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { assertLocalTestEnvironment } from "./local-guard";
assertLocalTestEnvironment();
const base = [
  "compose",
  "--env-file",
  "work/stack.env",
  "-f",
  "compose.phase1.yml",
  "exec",
  "-T",
  "db",
];
const database = "import_perf_" + randomUUID().replaceAll("-", "").slice(0, 12);
const owner = randomUUID(),
  outsider = randomUUID();
let passed = 0;
function sql(query: string, db = database, expectedSuccess = true) {
  const result = spawnSync(
    "docker",
    [
      ...base,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      db,
    ],
    { input: query, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  if (expectedSuccess) assert.equal(result.status, 0, result.stderr);
  else assert.notEqual(result.status, 0, "Expected denied operation");
  return result.stdout.trim();
}
const prefix = (user = owner) =>
  `set request.jwt.claims='${JSON.stringify({ sub: user, role: "authenticated" })}';set role authenticated;set statement_timeout='8s';`;
const json = (value: unknown) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
};
const row = (i: number, name: string, website: string, valid = true) => ({
  row_number: i + 2,
  raw: { business_name: name },
  payload: valid
    ? {
        business_name: name,
        industry: "Synthetic services",
        location: "Test City PA",
        website,
        research_priority: "C",
        audit_hypothesis_not_verified:
          "Synthetic hypothesis; research required",
        source_type: "Synthetic test",
        source_url: "https://example.test/source",
        source_timestamp: "2026-11-19T12:00:00Z",
      }
    : null,
  errors: valid ? [] : ["Missing business name"],
});
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const auth = spawnSync(
  "docker",
  [
    ...base,
    "pg_dump",
    "-U",
    "postgres",
    "--schema-only",
    "--schema=auth",
    "postgres",
  ],
  { encoding: "utf8" },
);
assert.equal(auth.status, 0, auth.stderr);
sql(`create database ${database}`, "postgres");
try {
  sql(auth.stdout);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql(readFileSync(`supabase/migrations/${file}`, "utf8"));
  sql(
    `insert into auth.users(id,email) values('${owner}','import-performance-owner@example.test'),('${outsider}','import-performance-outsider@example.test');`,
  );
  const org = sql(
    prefix() +
      "select public.create_organization('Synthetic import performance');",
  );
  const otherOrg = sql(
    prefix(outsider) +
      "select public.create_organization('Synthetic other tenant');",
  );
  const fixtureStart = performance.now();
  const seedRows = Array.from({ length: 796 }, (_, i) =>
    row(i, `Existing fixture ${i}`, `https://existing-${i}.example.test`),
  );
  const seed = sql(
    prefix() +
      `select public.preview_prospect_import('${org}','Existing synthetic fixtures','existing.csv','${hash("seed")}','{}'::jsonb,${json(seedRows)});`,
  );
  sql(prefix() + `select public.commit_prospect_import('${org}','${seed}');`);
  check(
    true,
    "796 existing prospects imported within the hosted eight-second timeout",
  );
  const rows = Array.from({ length: 2000 }, (_, i) =>
    i < 1800
      ? row(i, `Incoming fixture ${i}`, `https://incoming-${i}.example.test`)
      : i < 1900
        ? row(
            i,
            `Existing domain variant ${i}`,
            `https://www.existing-${i - 1800}.example.test/contact`,
          )
        : i < 1999
          ? row(i, `INCOMING FIXTURE ${i - 1900}.`, "")
          : row(i, "", "", false),
  );
  const previewCall = (fingerprint: string, batchRows = rows, tenant = org) =>
    `select public.preview_prospect_import('${tenant}','Synthetic large batch','synthetic.csv','${fingerprint}','{}'::jsonb,${json(batchRows)});`;
  const fingerprint = hash("large-2000");
  const before = performance.now();
  const batch = sql(prefix() + previewCall(fingerprint));
  const previewMs = performance.now() - before;
  check(
    Boolean(batch),
    "2,000-row preview succeeds under an eight-second statement timeout",
  );
  const states = JSON.parse(
    sql(
      prefix() +
        `select json_object_agg(status,n) from(select status,count(*) n from public.import_rows where batch_id='${batch}' group by status)s;`,
    ),
  );
  check(
    states.valid === 1800 && states.duplicate === 199 && states.invalid === 1,
    "Existing identities, in-file duplicates and invalid rows classified correctly",
  );
  check(
    Number(
      sql(
        prefix() +
          `select count(*) from public.leads where organization_id='${org}';`,
      ),
    ) === 796,
    "Preview never creates leads",
  );
  check(
    sql(prefix() + previewCall(fingerprint)) === batch,
    "Re-preview returns the same batch",
  );
  check(
    Number(
      sql(
        prefix() +
          `select count(*) from public.import_rows where batch_id='${batch}';`,
      ),
    ) === 2000,
    "Re-preview creates no additional rows",
  );
  sql(prefix(outsider) + previewCall(fingerprint), database, false);
  sql(`set role anon;` + previewCall(fingerprint), database, false);
  passed += 2;
  const commitStart = performance.now();
  sql(prefix() + `select public.commit_prospect_import('${org}','${batch}');`);
  const commitMs = performance.now() - commitStart;
  check(
    Number(
      sql(
        prefix() +
          `select count(*) from public.leads where organization_id='${org}';`,
      ),
    ) === 2596,
    "Large commit adds exactly 1,800 records, beyond any 1,000-lead display limit",
  );
  sql(prefix() + `select public.commit_prospect_import('${org}','${batch}');`);
  check(
    Number(
      sql(
        prefix() +
          `select count(*) from public.leads where organization_id='${org}';`,
      ),
    ) === 2596,
    "Repeated commit is idempotent",
  );
  check(
    Number(
      sql(
        prefix() +
          `select count(*) from public.leads where research_metadata->>'import_batch_id'='${batch}' and status='Discovered' and estimated_value_cents is null and audit_hypothesis_not_verified='Synthetic hypothesis; research required' and research_metadata->>'independently_verified'='false';`,
      ),
    ) === 1800,
    "Research hypotheses stay unverified and budgets are not invented",
  );
  const reimport = sql(
    prefix() + previewCall(hash("same-identities-new-file")),
  );
  check(
    Number(
      sql(
        prefix() +
          `select count(*) from public.import_rows where batch_id='${reimport}' and status='duplicate';`,
      ),
    ) === 1999,
    "A differently fingerprinted re-import detects existing identities",
  );
  const chain = [
    row(0, "Chain Alpha", "https://alpha.example.test"),
    row(1, "CHAIN ALPHA.", "https://beta.example.test"),
    row(2, "Chain Gamma", "https://beta.example.test"),
    row(3, "", "https://delta.example.test", false),
    row(4, "Chain Delta", "https://delta.example.test"),
  ];
  const chainBatch = sql(prefix() + previewCall(hash("chain"), chain));
  check(
    sql(
      prefix() +
        `select string_agg(status,',' order by row_number) from public.import_rows where batch_id='${chainBatch}';`,
    ) === "valid,duplicate,valid,invalid,valid",
    "Only accepted valid rows contribute identities; duplicate chains retain their semantics",
  );
  const otherBatch = sql(
    prefix(outsider) +
      previewCall(
        hash("other-tenant"),
        [row(0, "Incoming fixture 0", "https://incoming-0.example.test")],
        otherOrg,
      ),
  );
  check(
    sql(
      prefix(outsider) +
        `select status from public.import_rows where batch_id='${otherBatch}';`,
    ) === "valid",
    "Another organization's identities do not leak into duplicate classification",
  );
  check(
    Number(
      sql(
        prefix(outsider) +
          `select count(*) from public.import_rows where batch_id='${batch}';`,
      ),
    ) === 0,
    "RLS hides all other-tenant batch rows",
  );
  console.log(
    `Import performance: ${passed} checks passed. Fixture ${Math.round(commitStart - fixtureStart)}ms; preview ${Math.round(previewMs)}ms; commit ${Math.round(commitMs)}ms. Each operation enforced an 8s statement timeout. Disposable local data only.`,
  );
} finally {
  sql(`drop database if exists ${database} with(force)`, "postgres");
}
