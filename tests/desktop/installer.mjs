// Isolated native Windows install/update fixture. No Google, CRM or public feed calls.
import { _electron, expect } from "@playwright/test";
import {
  mkdtemp,
  readFile,
  writeFile,
  cp,
  mkdir,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const yaml = require("../../desktop/node_modules/js-yaml");
if (process.platform !== "win32")
  throw Error("Native installer verification requires Windows.");
const current = JSON.parse(
  await readFile("desktop/package.json", "utf8"),
).version;
const p = current.split(".").map(Number);
p[2]++;
const next = p.join(".");
const folder = await mkdtemp(path.join(tmpdir(), "irrelevant-update-test-"));
const install = path.join(folder, "installed");
const profile = path.join(folder, "profile");
const exe = path.join(install, "iRRELEVANT OS.exe");
let electronApp,
  server,
  monitorLogged = false;
const environment = { ...process.env, IRRELEVANT_DESKTOP_PROFILE: profile };
delete environment.ELECTRON_RUN_AS_NODE;
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 240000,
  });
  if (result.status !== 0)
    throw Error(
      `Native test command failed: ${result.stderr || result.error || command}`,
    );
}
async function runningPids() {
  const r = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name = 'iRRELEVANT OS.exe'\" | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8", timeout: 15000, windowsHide: true },
  );
  if (r.status !== 0) throw Error("Windows process enumeration failed.");
  const rows = [JSON.parse(r.stdout.trim() || "[]")].flat();
  const expected = await realpath(exe).catch(() => "");
  if (!monitorLogged) {
    console.log(
      "Native fixture process monitor:",
      JSON.stringify({ expected, reported: rows }),
    );
    monitorLogged = true;
  }
  const pids = [];
  for (const row of rows) {
    if (!row?.ExecutablePath) continue;
    const actual = await realpath(row.ExecutablePath).catch(() => "");
    if (expected && actual.toLowerCase() === expected.toLowerCase())
      pids.push(String(row.ProcessId));
  }
  return pids;
}
try {
  console.log("Native fixture: installing release Setup.");
  run(
    path.resolve(`work/windows-installer/iRRELEVANT-OS-Setup-${current}.exe`),
    ["/S", `/D=${install}`],
  );
  const packageFile = path.join(install, "resources/app/package.json");
  if (JSON.parse(await readFile(packageFile, "utf8")).version !== current)
    throw Error("Installed version does not match release.");
  const publicConfig = yaml.load(
    await readFile(path.join(install, "resources/app-update.yml"), "utf8"),
  );
  if (
    publicConfig.provider !== "github" ||
    publicConfig.owner !== "irrelevantco" ||
    publicConfig.repo !== "irrelevant-os"
  )
    throw Error("Unexpected public update feed.");
  // Verify the installed app's full setup/login flow, not only the ZIP executable.
  console.log("Native fixture: verifying installed application UI.");
  run(process.execPath, ["tests/desktop/smoke.mjs"], {
    ...process.env,
    DESKTOP_EXECUTABLE: exe,
  });
  // A second installer exists only in this isolated test output. It is never published.
  console.log("Native fixture: preparing next-version installer.");
  const fixtureRuntime = path.resolve("work/update-fixture-runtime");
  await cp("work/desktop-release/iRRELEVANT-OS-win32-x64", fixtureRuntime, {
    recursive: true,
  });
  const fixturePackage = path.join(
    fixtureRuntime,
    "resources/app/package.json",
  );
  const pkg = JSON.parse(await readFile(fixturePackage, "utf8"));
  pkg.version = next;
  pkg.main = "verify-update.cjs";
  await writeFile(fixturePackage, JSON.stringify(pkg, null, 2));
  // Fixture-only bootstrap reports from the actually restarted app after its
  // production main creates a loaded window. It avoids a second debugger attach
  // to an unmanaged relaunch and never enters the published installer.
  await writeFile(
    path.join(fixtureRuntime, "resources/app/verify-update.cjs"),
    `
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const profile=${JSON.stringify(profile)};
process.env.IRRELEVANT_DESKTOP_PROFILE=profile;
app.setPath('userData',profile);
app.once('browser-window-created',(_event,window)=>{
 window.webContents.once('did-finish-load',async()=>{
  try{
   const value=await fs.readFile(path.join(profile,'google-setup.bin'));
   const report={version:app.getVersion(),windowLoaded:true,
    marker:await fs.readFile(path.join(profile,'keep.txt'),'utf8'),
    googleMarker:JSON.parse(safeStorage.decryptString(value)).test_marker};
   await fs.writeFile(path.join(profile,'updated-app-report.json'),JSON.stringify(report));
  }catch{await fs.writeFile(path.join(profile,'updated-app-report.json'),JSON.stringify({error:'Retained profile verification failed'}));}
  setTimeout(()=>app.quit(),100);
 });
});
require('./main.cjs');
`,
  );
  const config = JSON.parse(await readFile("electron-builder.json", "utf8"));
  config.directories.output = path.resolve("work/update-fixture");
  config.extraMetadata = { version: next, main: "verify-update.cjs" };
  await writeFile("work/update-fixture-config.json", JSON.stringify(config));
  run(
    process.execPath,
    [
      "node_modules/electron-builder/out/cli/cli.js",
      "--prepackaged",
      fixtureRuntime,
      "--win",
      "nsis",
      "--publish",
      "never",
      "--config",
      "work/update-fixture-config.json",
    ],
    { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  );
  console.log("Native fixture: next-version installer built.");
  const fixtureName = `iRRELEVANT-OS-Setup-${next}.exe`;
  const bytes = await readFile(path.join("work/update-fixture", fixtureName));
  const metadata = yaml.load(
    await readFile("work/update-fixture/latest.yml", "utf8"),
  );
  if (
    metadata.version !== next ||
    metadata.files[0].sha512 !==
      createHash("sha512").update(bytes).digest("base64")
  )
    throw Error("Fixture update metadata/checksum mismatch.");
  let corrupt = true;
  server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.url.split("?")[0] === "/latest.yml") {
      const value = structuredClone(metadata);
      if (corrupt) {
        value.files[0].sha512 = Buffer.alloc(64).toString("base64");
        value.sha512 = value.files[0].sha512;
      }
      res.end(yaml.dump(value));
    } else if (req.url.split("?")[0] === "/" + fixtureName) {
      res.setHeader("Content-Length", bytes.length);
      res.end(bytes);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  // Only the disposable installed fixture points at this loopback server.
  await writeFile(
    path.join(install, "resources/app-update.yml"),
    yaml.dump({
      provider: "generic",
      url: `http://127.0.0.1:${server.address().port}`,
      updaterCacheDirName: "irrelevant-update-fixture-" + Date.now(),
    }),
  );
  await mkdir(profile, { recursive: true });
  const marker = "Synthetic retained workspace marker";
  await writeFile(path.join(profile, "keep.txt"), marker);
  electronApp = await _electron.launch({
    executablePath: exe,
    env: environment,
    timeout: 60000,
  });
  console.log("Native fixture: update client launched.");
  await expect(
    (await electronApp.firstWindow()).getByRole("heading", {
      name: "Build your position.",
    }),
  ).toBeVisible();
  const encrypted = await electronApp.evaluate(async ({ app, safeStorage }) => {
    const fs = process.getBuiltinModule("node:fs/promises"),
      path = process.getBuiltinModule("node:path");
    const bytes = safeStorage.encryptString(
      JSON.stringify({ test_marker: "Synthetic retained Google setup" }),
    );
    await fs.writeFile(
      path.join(app.getPath("userData"), "google-setup.bin"),
      bytes,
    );
    return bytes.toString("base64");
  });
  const initialPid = await electronApp.evaluate(() => process.pid);
  console.log("Native fixture: validating process monitor.");
  if (!(await runningPids()).includes(String(initialPid)))
    throw Error(
      "Native process monitor cannot identify the running fixture before update.",
    );
  const rejected = await electronApp.evaluate(async ({ app }) => {
    const moduleRequire = process
      .getBuiltinModule("node:module")
      .createRequire(
        process
          .getBuiltinModule("node:path")
          .join(app.getAppPath(), "main.cjs"),
      );
    const updater = moduleRequire("electron-updater").autoUpdater;
    updater.disableDifferentialDownload = true;
    await updater.checkForUpdates();
    try {
      await updater.downloadUpdate();
      return false;
    } catch {
      return true;
    }
  });
  if (!rejected) throw Error("A corrupted update was not rejected.");
  console.log("Native updater rejected the corrupted installer.");
  if (JSON.parse(await readFile(packageFile, "utf8")).version !== current)
    throw Error("Corrupt update changed installed files.");
  corrupt = false;
  await electronApp.evaluate(async ({ app }) => {
    const moduleRequire = process
      .getBuiltinModule("node:module")
      .createRequire(
        process
          .getBuiltinModule("node:path")
          .join(app.getAppPath(), "main.cjs"),
      );
    const updater = moduleRequire("electron-updater").autoUpdater;
    await updater.checkForUpdates();
    await updater.downloadUpdate();
  });
  const closed = electronApp.waitForEvent("close", { timeout: 60000 });
  await electronApp.evaluate(({ app }) => {
    const moduleRequire = process
      .getBuiltinModule("node:module")
      .createRequire(
        process
          .getBuiltinModule("node:path")
          .join(app.getAppPath(), "main.cjs"),
      );
    const updater = moduleRequire("electron-updater").autoUpdater;
    setTimeout(() => updater.quitAndInstall(true, true), 50);
  });
  await closed;
  electronApp = undefined;
  await expect
    .poll(
      async () => {
        try {
          return JSON.parse(await readFile(packageFile, "utf8")).version;
        } catch {
          return "";
        }
      },
      { timeout: 120000 },
    )
    .toBe(next);
  console.log("Native updater installed fixture version", next);
  console.log(
    "Native fixture: waiting for the restarted application window report.",
  );
  let retained;
  await expect
    .poll(
      async () => {
        try {
          retained = JSON.parse(
            await readFile(
              path.join(profile, "updated-app-report.json"),
              "utf8",
            ),
          );
          return retained;
        } catch {
          return null;
        }
      },
      { timeout: 120000 },
    )
    .toEqual({
      version: next,
      windowLoaded: true,
      marker,
      googleMarker: "Synthetic retained Google setup",
    });
  if (
    (await readFile(path.join(profile, "keep.txt"), "utf8")) !== marker ||
    (await readFile(path.join(profile, "google-setup.bin"))).toString(
      "base64",
    ) !== encrypted
  )
    throw Error("Update did not preserve profile data.");
  console.log(
    "Windows installed update cycle passed: installer → installed UI → corrupt checksum rejected → valid update applied/restarted → retained workspace marker and decryptable Google setup. No external API or message calls.",
  );
} finally {
  if (electronApp)
    await Promise.race([
      electronApp.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  server?.closeAllConnections();
  server?.close();
  for (const pid of await runningPids())
    spawnSync("taskkill", ["/PID", pid, "/T", "/F"], {
      windowsHide: true,
      timeout: 15000,
    });
  await rm(folder, { recursive: true, force: true }).catch(() => undefined);
}
