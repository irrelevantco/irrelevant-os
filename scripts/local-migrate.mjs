import { readFileSync, readdirSync } from "node:fs";
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
const files = readdirSync("supabase/migrations")
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();
for (const file of files) {
  const version = file.split("_")[0];
  if (
    sql(
      `select count(*) from local_migrations.versions where version='${version}';`,
    ) === "1"
  ) {
    console.log(`${version} already applied.`);
    continue;
  }
  const helpers =
    version === "202611170001"
      ? `create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''), nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid; $$; grant execute on function auth.uid() to anon, authenticated, service_role;`
      : "";
  const migration = readFileSync(`supabase/migrations/${file}`, "utf8").replace(
    /commit;\s*$/i,
    `insert into local_migrations.versions(version) values ('${version}');\ncommit;`,
  );
  sql(helpers + "\n" + migration);
  console.log(`Applied ${file}`);
}
sql("notify pgrst, 'reload schema';");
