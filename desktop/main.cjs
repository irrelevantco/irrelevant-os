const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
  session,
  safeStorage,
} = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const { validateConfig, importEnvironment } = require("./config.cjs");
const { installedClient } = require("./google-setup.cjs");
const { upgradeLocal, validateLocalTarget } = require("./local-upgrade.cjs");
const { createAppUpdater } = require("./app-updater.cjs");
let appUpdater, updateTimer, firstUpdateTimer;
let automationTimer,
  automationBusy = false,
  activeOrigin;
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
  clearInterval(automationTimer);
  activeOrigin = undefined;
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
    icon: path.join(webRoot, "public", "icon-192.png"),
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
async function googleSetup() {
  try {
    const value = await fs.readFile(
      path.join(app.getPath("userData"), "google-setup.bin"),
    );
    if (!safeStorage.isEncryptionAvailable())
      throw Error("OS credential encryption is unavailable");
    return JSON.parse(safeStorage.decryptString(value));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw Error(
      "Google setup could not be decrypted for this Windows account. Re-import the OAuth setup. Your CRM connection is unchanged.",
    );
  }
}
async function importGoogleSetup() {
  try {
    if (activeConfig?.mode !== "bundled")
      throw Error(
        "For a hosted app, configure Google OAuth on the host. Local OAuth setup is only for the bundled desktop server.",
      );
    if (!safeStorage.isEncryptionAvailable())
      throw Error(
        "Windows credential encryption must be available. No unencrypted secret will be saved.",
      );
    const result = await dialog.showOpenDialog(windowRef, {
      title: "Choose Google Desktop OAuth client JSON",
      properties: ["openFile"],
      filters: [{ name: "Google OAuth JSON", extensions: ["json"] }],
    });
    if (result.canceled) return;
    const file = await fs.readFile(result.filePaths[0], "utf8");
    if (file.length > 20000) throw Error("OAuth setup file is too large.");
    const prior = await googleSetup().catch(() => null);
    const setup = installedClient(file, prior?.encryptionKey);
    await fs.writeFile(
      path.join(app.getPath("userData"), "google-setup.bin"),
      safeStorage.encryptString(JSON.stringify(setup)),
    );
    if (activeConfig?.mode === "bundled") {
      const config = activeConfig;
      stopServer();
      await openWorkspace(config);
    }
    await dialog.showMessageBox(windowRef, {
      type: "info",
      message: "Google setup saved with OS encryption.",
      detail:
        "Use Workspace → Open Google connection in browser… and sign in to your CRM in that browser to complete Google's consent flow.",
    });
  } catch (error) {
    await dialog.showMessageBox(windowRef, {
      type: "error",
      message: "Google setup was not imported.",
      detail: error.message,
    });
  }
}
function startAutomation(origin) {
  clearInterval(automationTimer);
  activeOrigin = origin;
  async function tick() {
    if (automationBusy || !activeOrigin || quitting) return;
    automationBusy = true;
    try {
      if (
        !windowRef ||
        new URL(windowRef.webContents.getURL()).origin !== activeOrigin
      )
        return;
      // Execute one constant, same-origin request in the authenticated app context.
      // Chromium supplies the Origin and HttpOnly session cookies; CSRF protection stays strict.
      await windowRef.webContents.executeJavaScript(
        'fetch("/api/automation/tick", { method: "POST", credentials: "same-origin", cache: "no-store" }).then(response => response.text())',
      );
    } catch {
    } finally {
      automationBusy = false;
    }
  }
  automationTimer = setInterval(tick, 60000);
  void tick();
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
    const google = await googleSetup().catch(() => null);
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
        IRRELEVANT_DESKTOP: "true",
        GOOGLE_CLIENT_ID: google?.clientId || "",
        GOOGLE_CLIENT_SECRET: google?.clientSecret || "",
        GOOGLE_REDIRECT_URI: `${origin}/api/integrations/google/callback`,
        OAUTH_TOKEN_ENCRYPTION_KEY: google?.encryptionKey || "",
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
  startAutomation(origin);
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
    clearInterval(updateTimer);
    clearTimeout(firstUpdateTimer);
    stopServer();
  });
  app.on("window-all-closed", () => {
    if (!connecting && !quitting) app.quit();
  });
  app
    .whenReady()
    .then(async () => {
      if (process.platform === "win32")
        app.setAppUserModelId("co.irrelevant.os");
      session
        .fromPartition("persist:irrelevant-os")
        .setPermissionRequestHandler((_contents, _permission, callback) =>
          callback(false),
        );
      if (
        process.platform === "win32" &&
        require("node:fs").existsSync(
          path.join(process.resourcesPath, "app-update.yml"),
        )
      ) {
        appUpdater = createAppUpdater({
          updater: require("electron-updater").autoUpdater,
          version: app.getVersion(),
          showDialog: (options) =>
            quitting || !windowRef || windowRef.isDestroyed()
              ? Promise.resolve({ response: 1 })
              : dialog.showMessageBox(windowRef, options),
          canRestart: () => !automationBusy && !connecting && !upgrading,
        });
        if (!process.env.IRRELEVANT_DESKTOP_PROFILE) {
          firstUpdateTimer = setTimeout(() => appUpdater.check(), 15000);
          updateTimer = setInterval(
            () => appUpdater.check(),
            6 * 60 * 60 * 1000,
          );
          firstUpdateTimer.unref();
          updateTimer.unref();
        }
      }
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Workspace",
            submenu: [
              {
                label: "Check for app updates…",
                click: () =>
                  appUpdater
                    ? appUpdater.check(true)
                    : dialog.showMessageBox(windowRef, {
                        type: "info",
                        message:
                          "Install the Windows Setup edition to enable app updates.",
                        detail:
                          "Portable ZIP builds retain manual updates. Download the Setup edition from the official irrelevantco/irrelevant-os GitHub release. Your existing workspace data stays separate.",
                      }),
              },
              { label: "Change connection…", click: () => showSetup() },
              {
                label: "Update local database…",
                click: () => updateLocalDatabase(),
              },
              {
                label: "Import Google OAuth setup…",
                click: () => importGoogleSetup(),
              },
              {
                label: "Open Google connection in browser…",
                click: () => {
                  if (activeOrigin)
                    shell.openExternal(`${activeOrigin}/dashboard/connections`);
                },
              },
              { type: "separator" },
              {
                label: `About iRRELEVANT OS ${app.getVersion()}`,
                click: () =>
                  dialog.showMessageBox(windowRef, {
                    type: "info",
                    message: `iRRELEVANT OS ${app.getVersion()}`,
                    detail:
                      "Build your position. Personal preview by iRRELEVANT CO.",
                  }),
              },
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
