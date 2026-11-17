const { spawnSync } = require("node:child_process");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const DB = "irrelevant-phase1-db-1";
const API = "irrelevant-phase1-gateway-1";
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      "Docker could not complete the local database update. Keep Docker Desktop and the existing iRRELEVANT containers running, then try again. No database reset was requested.",
    );
  return result.stdout.trim();
}
function validateLocalTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("A local database connection is required.");
  }
  if (
    !["http://127.0.0.1:54321", "http://localhost:54321"].includes(
      url.origin,
    ) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "This updater only supports the existing local Supabase connection on port 54321. It cannot update a hosted database.",
    );
  return url.origin;
}
function upgradeLocal({
  url,
  migrationsDirectory = path.join(__dirname, "migrations"),
  execute = docker,
  report = () => {},
}) {
  validateLocalTarget(url);
  const label = [
    "inspect",
    "--format",
    '{{index .Config.Labels "com.docker.compose.project"}}',
  ];
  if (
    execute([...label, DB]).trim() !== "irrelevant-phase1" ||
    execute([...label, API]).trim() !== "irrelevant-phase1"
  )
    throw new Error(
      "The supported iRRELEVANT local stack was not found. No database changes were made.",
    );
  const bindings = execute(["port", API, "80/tcp"]).trim().split(/\r?\n/);
  if (
    !bindings.includes("127.0.0.1:54321") ||
    bindings.some((v) => !["127.0.0.1:54321", "[::1]:54321"].includes(v))
  )
    throw new Error(
      "Local API port ownership does not match the supported stack. No database changes were made.",
    );
  const sql = (input) =>
    execute(
      [
        "exec",
        "-i",
        DB,
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-U",
        "postgres",
        "-d",
        "postgres",
      ],
      input,
    );
  const versions = new Set(
    sql(
      "select version from local_migrations.versions order by version;",
    ).split(/\r?\n/),
  );
  if (!versions.has("202611170001"))
    throw new Error(
      "An existing versioned iRRELEVANT CRM database is required. This tool does not initialize or reset databases.",
    );
  const snapshotSql =
    "select jsonb_build_object('organizations',(select count(*) from public.organizations),'memberships',(select count(*) from public.organization_members),'businesses',(select count(*) from public.businesses),'leads',(select count(*) from public.leads),'notes',(select count(*) from public.lead_notes))::text;";
  const before = JSON.parse(sql(snapshotSql));
  const pending = readdirSync(migrationsDirectory)
    .filter((n) => /^\d+_.+\.sql$/.test(n))
    .sort()
    .filter((n) => !versions.has(n.split("_")[0]))
    .map((file) => {
      const version = file.split("_")[0];
      const original = readFileSync(
        path.join(migrationsDirectory, file),
        "utf8",
      );
      if (!/^\s*begin;/i.test(original) || !/commit;\s*$/i.test(original))
        throw new Error(
          "A bundled migration is not transactional. No update was started.",
        );
      return {
        version,
        file,
        statement: original.replace(
          /commit;\s*$/i,
          `insert into local_migrations.versions(version) values ('${version}');\ncommit;`,
        ),
      };
    });
  const applied = [];
  for (const migration of pending) {
    report(`Applying ${migration.file}`);
    sql(migration.statement);
    applied.push(migration.version);
  }
  sql("notify pgrst, 'reload schema';");
  const after = JSON.parse(sql(snapshotSql));
  if (Object.entries(before).some(([key, value]) => after[key] !== value))
    throw new Error(
      "The update finished but existing record counts changed. Stop and inspect the database before proceeding.",
    );
  const readiness = JSON.parse(
    sql(
      "select jsonb_build_object('contacts',to_regclass('public.contact_events') is not null,'jobs',to_regclass('public.agent_jobs') is not null,'settings',to_regclass('public.agent_settings') is not null,'suppression',to_regclass('public.suppression_entries') is not null,'claim',to_regprocedure('public.claim_agent_job(uuid)') is not null)::text;",
    ),
  );
  if (Object.values(readiness).some((v) => v !== true))
    throw new Error(
      "Some required tables or functions are still missing. No reset was performed.",
    );
  return { applied, preserved: after };
}
module.exports = { upgradeLocal, validateLocalTarget };
