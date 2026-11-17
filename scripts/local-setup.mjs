import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!existsSync(".env.local") && !existsSync("work/stack.env"))
  run(process.execPath, ["scripts/local-env.mjs"]);
if (!existsSync(".env.local") || !existsSync("work/stack.env")) {
  console.error(
    "Local environment is incomplete. Preserve existing credentials and follow README.md.",
  );
  process.exit(1);
}
const config = readFileSync(".env.local", "utf8");
if (
  !/^NEXT_PUBLIC_SUPABASE_URL=http:\/\/(127\.0\.0\.1|localhost):54321\s*$/m.test(
    config,
  )
) {
  console.error(
    "local:setup only starts the loopback development backend. Use your existing hosted Supabase configuration with npm run dev.",
  );
  process.exit(1);
}
run("npm", ["run", "local:up"]);
run("npm", ["run", "local:migrate"]);
console.log(
  "Local backend ready. Start npm run dev and open http://localhost:3030. This address refers to the computer running Next.js.",
);
