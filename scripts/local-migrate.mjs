import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
function sql(input) {
  const p = spawnSync(
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
      "-At",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input, encoding: "utf8" },
  );
  if (p.status !== 0) {
    console.error(p.stderr);
    process.exit(1);
  }
  return p.stdout.trim();
}
const health = await fetch("http://127.0.0.1:54321/auth/v1/health").catch(
  () => null,
);
if (!health?.ok) {
  console.error(
    "Local auth service is not ready. Run npm run local:up and inspect container logs.",
  );
  process.exit(1);
}
sql(
  "create schema if not exists local_migrations; create table if not exists local_migrations.versions(version text primary key);",
);
if (
  sql(
    "select count(*) from local_migrations.versions where version='202611170001';",
  ) === "1"
) {
  console.log("Phase 1 migration already applied.");
  process.exit(0);
}
const helpers = `create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''), nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid; $$; grant execute on function auth.uid() to anon, authenticated, service_role;`;
const migration = readFileSync(
  "supabase/migrations/202611170001_phase_one.sql",
  "utf8",
).replace(
  /commit;\s*$/i,
  "insert into local_migrations.versions(version) values ('202611170001');\ncommit;",
);
console.log(sql(helpers + "\n" + migration));
console.log("Phase 1 migration applied.");
sql("notify pgrst, 'reload schema';");
