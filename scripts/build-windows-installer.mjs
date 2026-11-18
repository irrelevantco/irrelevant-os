import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { readdir } from "node:fs/promises";
if (process.platform !== "win32")
  throw Error("Build the Windows installer on Windows.");
const root = process.cwd();
const runtime = path.resolve("work/desktop-release/iRRELEVANT-OS-win32-x64");
// Standard electron-updater configuration. No token or configurable remote URL.
await writeFile(
  path.join(runtime, "resources/app-update.yml"),
  "provider: github\nowner: irrelevantco\nrepo: irrelevant-os\nupdaterCacheDirName: irrelevant-os-personal-updater\n",
);
const result = spawnSync(
  process.execPath,
  [
    "node_modules/electron-builder/out/cli/cli.js",
    "--prepackaged",
    runtime,
    "--win",
    "nsis",
    "--publish",
    "never",
    "--config",
    "electron-builder.json",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  },
);
if (result.status !== 0) throw Error("Windows installer build failed.");
await mkdir("work/windows-installer", { recursive: true });
for (const name of await readdir("work/windows-installer")) {
  if (!name.endsWith(".exe")) continue;
  const bytes = await readFile(path.join("work/windows-installer", name));
  await writeFile(
    path.join("work/windows-installer", `${name}.sha256`),
    `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`,
  );
}
