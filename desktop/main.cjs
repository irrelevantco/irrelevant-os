const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
  session,
} = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const { validateConfig, importEnvironment } = require("./config.cjs");
const { upgradeLocal, validateLocalTarget } = require("./local-upgrade.cjs");
let activeConfig,
  upgrading = false;
let windowRef,
  child,
  connecting = false,
  quitting = false;
const webRoot = path.join(__dirname, "web");
if (process.env.IRRELEVANT_DESKTOP_PROFILE)
  app.setPath("userData", path.resolve(process.env.IRRELEVANT_DESKTOP_PROFILE));
function connectionFile() {
  return path.join(app.getPath("userData"), "connection.json");
}
function stopServer() {
  if (child) {
    child.kill();
    child = null;
  }
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}
function createWindow(setup = false) {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 390,
    minHeight: 600,
    backgroundColor: "#101110",
    title: "iRRELEVANT OS",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      partition: "persist:irrelevant-os",
      ...(setup ? { preload: path.join(__dirname, "preload.cjs") } : {}),
    },
  });
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    if (windowRef === win) {
      windowRef = null;
      if (!connecting) app.quit();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (["https:", "http:"].includes(parsed.protocol))
        shell.openExternal(parsed.href);
    } catch {}
    return { action: "deny" };
  });
  return win;
}
async function showSetup() {
  activeConfig = null;
  stopServer();
  connecting = true;
  const old = windowRef;
  windowRef = createWindow(true);
  await windowRef.loadFile(path.join(__dirname, "setup.html"));
  old?.close();
  connecting = false;
}
async function openWorkspace(config) {
  const validated = validateConfig(config);
  activeConfig = validated;
  let origin = validated.appUrl;
  if (validated.mode === "bundled") {
    const health = await fetch(`${validated.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: validated.publishableKey },
      signal: AbortSignal.timeout(7000),
    }).catch(() => null);
    if (!health?.ok)
      throw new Error(
        "Supabase is not responding. For your local workspace, start Docker Desktop and the existing iRRELEVANT Supabase containers, then try again.",
      );
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // Embedded Electron Node runtime: no system Node/npm and no port 3030 dependency.
    child = spawn(process.execPath, [path.join(webRoot, "server.js")], {
      cwd: webRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        APP_URL: origin,
        SUPABASE_URL: validated.supabaseUrl,
        SUPABASE_PUBLISHABLE_KEY: validated.publishableKey,
        OPERATOR_EMAIL_ALLOWLIST: validated.operatorEmail,
        ALLOW_LOCAL_INTEGRATION_TESTS: "false",
        CRON_SECRET: "",
        AGENT_WORKER_ORGANIZATION_IDS: "",
        EXPLEE_API_KEY: "",
      },
    });
    let exited = false;
    child.once("exit", () => {
      exited = true;
    });
    // Drain logs without persisting request data or credentials.
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (exited)
        throw new Error(
          "The bundled server exited before startup. See the desktop troubleshooting guide.",
        );
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(1000),
      }).catch(() => null);
      if (response?.ok) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready)
      throw new Error(
        "The bundled server did not start. Close the app and try again.",
      );
  }
  connecting = true;
  const old = windowRef;
  const next = createWindow();
  windowRef = next;
  next.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== origin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });
  await next.loadURL(`${origin}/dashboard`);
  old?.close();
  connecting = false;
  return validated;
}
async function updateLocalDatabase() {
  if (upgrading) return;
  try {
    if (activeConfig?.mode !== "bundled")
      throw new Error(
        "Open a bundled app with your existing local connection before updating. Hosted databases are not changed by this updater.",
      );
    validateLocalTarget(activeConfig.supabaseUrl);
    const answer = await dialog.showMessageBox(windowRef, {
      type: "question",
      title: "Update local database",
      message: "Apply the missing iRRELEVANT database migrations?",
      detail:
        "This updates only your existing local iRRELEVANT Docker database. Your accounts, leads, notes and research are retained. No database is reset, no example data is imported, and no hosted database or email is touched. Keep Docker Desktop running.",
      buttons: ["Cancel", "Update local database"],
      defaultId: 0,
      cancelId: 0,
    });
    if (answer.response !== 1) return;
    upgrading = true;
    // Wait for the dialog to close before running a short, bounded local Docker command.
    await new Promise((resolve) => setImmediate(resolve));
    const result = upgradeLocal({ url: activeConfig.supabaseUrl });
    await dialog.showMessageBox(windowRef, {
      type: "info",
      title: "Database ready",
      message: result.applied.length
        ? "Local database updated."
        : "Local database is already up to date.",
      detail:
        "Your existing records were retained. Reload Outreach drafts and Agent control now. No message was sent.",
    });
    windowRef?.webContents.reload();
  } catch (error) {
    await dialog.showMessageBox(windowRef, {
      type: "error",
      title: "Database update did not finish",
      message:
        error instanceof Error
          ? error.message
          : "The local update did not finish. No reset was requested.",
    });
  } finally {
    upgrading = false;
  }
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    windowRef?.restore();
    windowRef?.focus();
  });
  app.on("before-quit", () => {
    quitting = true;
    stopServer();
  });
  app.on("window-all-closed", () => {
    if (!connecting && !quitting) app.quit();
  });
  app
    .whenReady()
    .then(async () => {
      session
        .fromPartition("persist:irrelevant-os")
        .setPermissionRequestHandler((_contents, _permission, callback) =>
          callback(false),
        );
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Workspace",
            submenu: [
              { label: "Change connection…", click: () => showSetup() },
              {
                label: "Update local database…",
                click: () => updateLocalDatabase(),
              },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          { role: "editMenu" },
          {
            role: "viewMenu",
            submenu: [
              { role: "reload" },
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
        ]),
      );
      ipcMain.handle("import-environment", async (event) => {
        if (
          event.sender !== windowRef?.webContents ||
          !event.sender.getURL().startsWith("file:")
        )
          return { error: "Setup window required." };
        const result = await dialog.showOpenDialog(windowRef, {
          title: "Choose your existing .env.local",
          properties: ["openFile", "showHiddenFiles"],
        });
        if (result.canceled) return { cancelled: true };
        try {
          const file = result.filePaths[0];
          const stat = await fs.stat(file);
          if (stat.size > 65536)
            throw new Error("Configuration file is too large.");
          return importEnvironment(await fs.readFile(file, "utf8"));
        } catch {
          return {
            error:
              "Could not read the configuration file. Choose .env.local from your app folder.",
          };
        }
      });
      ipcMain.handle("connect", async (event, raw) => {
        if (
          event.sender !== windowRef?.webContents ||
          !event.sender.getURL().startsWith("file:") ||
          connecting
        )
          return { error: "Setup window required." };
        try {
          const config = await openWorkspace(raw);
          await fs.mkdir(app.getPath("userData"), { recursive: true });
          await fs.writeFile(connectionFile(), JSON.stringify(config), {
            mode: 0o600,
          });
          return { ok: true };
        } catch (error) {
          stopServer();
          connecting = false;
          return {
            error:
              error instanceof Error ? error.message : "Connection failed.",
          };
        }
      });
      try {
        const config = validateConfig(
          JSON.parse(await fs.readFile(connectionFile(), "utf8")),
        );
        await openWorkspace(config);
      } catch {
        await showSetup();
      }
    })
    .catch(() => {
      dialog.showErrorBox(
        "iRRELEVANT OS",
        "Could not start the desktop application. Extract the complete archive to a writable folder and retry.",
      );
      app.quit();
    });
}
