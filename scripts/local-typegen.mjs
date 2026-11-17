import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const env = Object.fromEntries(
  readFileSync("work/stack.env", "utf8")
    .trim()
    .split("\n")
    .map((line) => line.split("=")),
);
const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--network",
    "irrelevant-phase1_default",
    "-e",
    "PG_META_DB_HOST=db",
    "-e",
    "PG_META_DB_PORT=5432",
    "-e",
    "PG_META_DB_NAME=postgres",
    "-e",
    "PG_META_DB_USER=postgres",
    "-e",
    "PG_META_DB_PASSWORD",
    "-e",
    "PG_META_GENERATE_TYPES=typescript",
    "-e",
    "PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS=public",
    "-e",
    "PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS=true",
    "public.ecr.aws/supabase/postgres-meta:v0.95.1",
  ],
  {
    encoding: "utf8",
    env: { ...process.env, PG_META_DB_PASSWORD: env.POSTGRES_PASSWORD },
  },
);
if (result.status !== 0) {
  console.error(
    result.stderr.replaceAll(
      env.POSTGRES_PASSWORD,
      "[local password redacted]",
    ),
  );
  process.exit(1);
}
if (!result.stdout.includes("export type Database")) {
  console.error("Type generation returned an unexpected format.");
  process.exit(1);
}
writeFileSync("src/lib/supabase/database.types.ts", result.stdout);
console.log("Generated public schema types.");
