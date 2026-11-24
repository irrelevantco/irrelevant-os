import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertLocalTestEnvironment } from "./local-guard";
assertLocalTestEnvironment();
const require = createRequire(import.meta.url);
const { upgradeLocal } = require("../../desktop/local-upgrade.cjs");
const dbName = `repair_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
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
function sql(database: string, input: string) {
  const p = spawnSync(
    "docker",
    [
      ...base,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-U",
      "postgres",
      "-d",
      database,
    ],
    { input, encoding: "utf8" },
  );
  assert.equal(p.status, 0, p.stderr);
  return p.stdout.trim();
}
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
const user = randomUUID(),
  org = randomUUID(),
  business = randomUUID(),
  lead = randomUUID();
const prefix = `select set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',false);`;
let passed = 0;
function check(value: unknown, message: string) {
  assert.ok(value, message);
  passed++;
}
sql("postgres", `create database ${dbName};`);
try {
  sql(dbName, auth.stdout);
  for (const file of [
    "202611170001_phase_one.sql",
    "202611170002_prospect_batch.sql",
  ])
    sql(dbName, readFileSync(`supabase/migrations/${file}`, "utf8"));
  sql(
    dbName,
    `create schema local_migrations;create table local_migrations.versions(version text primary key);insert into local_migrations.versions values('202611170001'),('202611170002');
 insert into auth.users(id,email) values('${user}','repair-synthetic@example.test');
 ${prefix}
 insert into public.organizations(id,name) values('${org}','Synthetic Upgrade Test');
 insert into public.organization_members(organization_id,user_id,role) values('${org}','${user}','owner');
 insert into public.businesses(id,organization_id,name,industry,location,source_notes) values('${business}','${org}','Synthetic Preserved Business','Cleaning','Erie PA','Original supplied research remains unverified');
 insert into public.leads(id,organization_id,business_id,research_priority,audit_hypothesis_not_verified) values('${lead}','${org}','${business}','A','Unverified question to preserve');
 insert into public.lead_notes(organization_id,lead_id,body) values('${org}','${lead}','A preserved note');
 update public.growth_reviews set suggested_offer='Original scope discussion only' where lead_id='${lead}';
 update public.outreach_drafts set email_draft='An original human draft. Never sent.',call_script='An original call opening.' where lead_id='${lead}';`,
  );
  const snapshot = () =>
    sql(
      dbName,
      "select jsonb_build_object('businesses',(select jsonb_agg(to_jsonb(b)) from public.businesses b),'leads',(select jsonb_agg(to_jsonb(l)-'deleted_at'-'deleted_by') from public.leads l),'notes',(select jsonb_agg(to_jsonb(n)) from public.lead_notes n),'reviews',(select jsonb_agg(to_jsonb(r)) from public.growth_reviews r),'points',(select jsonb_agg(to_jsonb(p)) from public.growth_review_points p),'drafts',(select jsonb_agg(to_jsonb(d)) from public.outreach_drafts d))::text;",
    );
  const before = snapshot();
  check(
    sql(
      dbName,
      "select to_regclass('public.agent_jobs') is null and to_regclass('public.contact_events') is null;",
    ) === "t",
    "Reproduced working Phase 2 database without agent/contact tables",
  );
  const execute = (args: string[], input?: string) => {
    if (args[0] === "inspect") return "irrelevant-phase1";
    if (args[0] === "port") return "127.0.0.1:54321";
    assert.equal(args[0], "exec");
    assert.equal(args[2], "irrelevant-phase1-db-1");
    // Every repair statement is redirected to the temporary test DB, never the user's database.
    return sql(dbName, input!);
  };
  const result = upgradeLocal({
    url: "http://127.0.0.1:54321",
    migrationsDirectory: path.resolve("supabase/migrations"),
    execute,
  });
  check(
    JSON.stringify(result.applied) ===
      JSON.stringify([
        "20261117175427",
        "20261117203425",
        "20261117221021",
        "20261117231231",
        "20261118153305",
        "20261118191851",
        "20261119021025",
        "20261119024350",
        "20261119201405",
      ]),
    "Applied precisely the missing migrations",
  );
  check(
    snapshot() === before,
    "Accounts, prospect data, notes, unverified hypotheses, review and human drafts preserved byte-for-byte",
  );
  check(
    sql(
      dbName,
      "select count(*) from public.leads where deleted_at is not null or deleted_by is not null;",
    ) === "0",
    "Existing leads are not removed by the upgrade",
  );
  check(
    sql(
      dbName,
      "select count(*) from pg_tables where schemaname='public' and not rowsecurity;",
    ) === "0",
    "All application tables retain RLS",
  );
  check(
    sql(
      dbName,
      `begin;${prefix}set local role authenticated;select count(*) from public.contact_events where organization_id='${org}';rollback;`,
    ).includes("\n0\n"),
    "Authenticated owner can query contact history after repair",
  );
  const ownerJob = sql(
    dbName,
    `begin;${prefix}set local role authenticated;select public.configure_agents('${org}','{"paused":false,"daily_job_limit":10,"explee_daily_credit_limit":0,"sender_name":"","sender_email":"","postal_address":""}');select public.enqueue_agent_job('${org}','research_plan','${lead}','repair-test-request-key');rollback;`,
  );
  check(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(
      ownerJob,
    ),
    "Owner can use the repaired Agent Control RPCs",
  );
  check(
    sql(
      dbName,
      "select has_function_privilege('anon','public.claim_agent_job(uuid)','EXECUTE');",
    ) === "f",
    "No anonymous job execution introduced",
  );
  const again = upgradeLocal({
    url: "http://127.0.0.1:54321",
    migrationsDirectory: path.resolve("supabase/migrations"),
    execute,
  });
  check(
    again.applied.length === 0 && snapshot() === before,
    "Repair is idempotent and preserves original data on repeat",
  );
  console.log(
    `${passed} migration-repair checks passed against an isolated old-schema database; only the temporary database was changed.`,
  );
} finally {
  sql("postgres", `drop database ${dbName};`);
}
