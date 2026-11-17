import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
function runNode(args) {
  // Argument arrays preserve paths such as C:\\Program Files\\nodejs\\node.exe.
  // Launch npm's JS entrypoint with Node, avoiding PowerShell and cmd quoting.
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.error)
    console.error(`Could not start Node (${result.error.code}).`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const npmCli = process.env.npm_execpath;
if (!npmCli || !existsSync(npmCli)) {
  console.error(
    "Run this setup through npm.cmd run local:setup on Windows, or npm run local:setup elsewhere.",
  );
  process.exit(1);
}
if (!existsSync(".env.local") && !existsSync("work/stack.env"))
  runNode(["scripts/local-env.mjs"]);
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
runNode([npmCli, "run", "local:up"]);
runNode([npmCli, "run", "local:migrate"]);
console.log(
  "Local backend ready. Start npm run dev and open http://localhost:3030. This address refers to the computer running Next.js.",
);
