// Accept both Next.js CLI flags and the preview runner's Vite-style host flags.
import { spawn } from "node:child_process";
const args = process.argv
  .slice(2)
  .filter((arg) => arg !== "--strictPort")
  .map((arg) => (arg === "--host" ? "--hostname" : arg));
if (!args.includes("--hostname") && !args.includes("-H"))
  args.push("--hostname", "0.0.0.0");
if (!args.includes("--port") && !args.includes("-p")) args.push("--port", process.env.PORT || "3030");
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", ...args],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
