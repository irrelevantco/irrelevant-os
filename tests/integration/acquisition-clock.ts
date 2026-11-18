// Clock-controlled checks run only in a disposable database; the app DB clock/functions are untouched.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
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
const db = `clock_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
  user = randomUUID();
function sql(database: string, input: string) {
  const r = spawnSync(
    "docker",
    [
      ...base,
      "psql",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
    ],
    { input, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
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
const prefix = `set request.jwt.claims='{"sub":"${user}","role":"authenticated"}';set role authenticated;`;
let passed = 0;
const check = (c: unknown, msg: string) => {
  assert.ok(c, msg);
  passed++;
};
sql("postgres", `create database ${db}`);
try {
  sql(db, auth.stdout);
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql(db, readFileSync(`supabase/migrations/${f}`, "utf8"));
  sql(
    db,
    `insert into auth.users(id,email) values('${user}','clock-only@example.test')`,
  );
  const org = sql(
    db,
    prefix + "select public.create_organization('Synthetic Clock Test');",
  );
  const settings = JSON.stringify({
    enabled: true,
    categories: [
      "cleaning",
      "hvac",
      "plumber",
      "roofer",
      "electrician",
      "gardener",
      "builder",
    ],
    city: "Erie",
    state: "PA",
    sending_enabled: false,
  });
  sql(
    db,
    prefix +
      `select public.save_acquisition_settings('${org}','${settings}'::jsonb);`,
  );
  const original = sql(
    db,
    "select pg_get_functiondef('public.enqueue_hourly_discovery(uuid,jsonb)'::regprocedure)",
  );
  function clock(value: string) {
    sql(
      db,
      original.replaceAll("now()", `'${value}'::timestamptz`) +
        `;alter table public.agent_jobs alter column created_at set default '${value}'::timestamptz;`,
    );
  }
  const tick = () =>
    JSON.parse(
      sql(db, prefix + `select public.enqueue_hourly_discovery('${org}');`),
    );
  clock("2026-11-18T13:10:00Z");
  check(
    tick().queued === 7,
    "Seven selected categories queue during the Eastern working window",
  );
  check(tick().queued === 0, "Same hour is idempotent");
  check(
    sql(db, `select count(*) from public.agent_jobs where status='queued'`) ===
      "7",
    "One job per category",
  );
  check(
    sql(
      db,
      `select extract(epoch from max(run_after)-min(run_after)) from public.agent_jobs`,
    ) === "390.000000",
    "Provider starts are staggered by 65 seconds",
  );
  clock("2026-11-18T14:10:00Z");
  check(tick().queued === 7, "Next hour creates one fresh batch");
  check(
    sql(
      db,
      "select count(*) from public.agent_jobs where status='cancelled'",
    ) === "7",
    "Missed-hour requests are cancelled without a catch-up burst",
  );
  clock("2026-11-18T20:00:00Z");
  check(
    tick().reason === "outside hours",
    "3 p.m. Eastern stops automatic discovery",
  );
  clock("2026-11-21T14:00:00Z");
  check(tick().queued === 0, "Weekend discovery is skipped");
  clock("2026-07-06T11:00:00Z");
  check(tick().queued === 7, "Summer daylight-saving 7 a.m. start is accepted");
  clock("2026-07-06T10:59:00Z");
  check(
    tick().reason === "outside hours",
    "Summer 6:59 a.m. is outside the window",
  );
  clock("2026-11-19T14:00:00Z");
  sql(
    db,
    `insert into public.agent_jobs(organization_id,kind,idempotency_key,status,created_by) select '${org}','discovery','daily-fill-'||n,'failed','${user}' from generate_series(1,100) n;`,
  );
  check(
    tick().queued === 0,
    "The 100-job global ceiling cannot be exceeded by hourly discovery",
  );
  sql(db, prefix + `select public.stop_agent_jobs('${org}');`);
  check(tick().reason === "paused", "Pause overrides the saved hourly setting");
  console.log(
    `${passed} isolated-clock assertions passed. No provider was contacted; no application database function or clock was changed.`,
  );
} finally {
  sql("postgres", `drop database ${db}`);
}
