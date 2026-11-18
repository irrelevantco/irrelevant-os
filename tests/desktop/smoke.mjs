import ExcelJS from "exceljs";
import { _electron, expect } from "playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const executablePath = process.env.DESKTOP_EXECUTABLE;
if (!executablePath) throw new Error("DESKTOP_EXECUTABLE is required.");
const profile = await mkdtemp(path.join(tmpdir(), "irrelevant-desktop-test-"));
let mock, electronApp;
try {
  let url, key, email, password, leadId;
  const real = process.env.DESKTOP_TEST_REAL_BACKEND === "true";
  if (real) {
    url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (
      process.env.ALLOW_LOCAL_INTEGRATION_TESTS !== "true" ||
      !url ||
      !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
    )
      throw new Error(
        "Real desktop fixtures require an explicitly enabled loopback backend.",
      );
    email = `desktop-${randomUUID()}@example.test`;
    password = `Test-only-${randomUUID()}!`;
    const db = createClient(url, key, { auth: { persistSession: false } });
    const signup = await db.auth.signUp({ email, password });
    if (!signup.data.session) throw new Error("Local fixture signup failed.");
    const org = await db.rpc("create_organization", {
      organization_name: "Synthetic Desktop Test",
    });
    if (org.error) throw new Error("Local fixture organization failed.");
    const prospect = await db.rpc("create_prospect", {
      payload: {
        organization_id: org.data,
        name: "Synthetic Desktop Prospect",
        industry: "Cleaning",
        location: "Erie PA",
      },
    });
    if (prospect.error) throw new Error("Local fixture prospect failed.");
    leadId = prospect.data;
  } else {
    mock = createServer((request, response) => {
      response.writeHead(request.url === "/auth/v1/health" ? 200 : 401, {
        "Content-Type": "application/json",
      });
      response.end(
        JSON.stringify(
          request.url === "/auth/v1/health"
            ? { name: "synthetic-health-only" }
            : { message: "Unauthorized" },
        ),
      );
    });
    await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${mock.address().port}`;
    key = `${Buffer.from("{}").toString("base64url")}.${Buffer.from('{"role":"anon"}').toString("base64url")}.synthetic-test-signature`;
    email = "desktop@example.test";
  }
  const env = { ...process.env, IRRELEVANT_DESKTOP_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  electronApp = await _electron.launch({
    executablePath,
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
    env,
    timeout: 60000,
  });
  const setup = await electronApp.firstWindow();
  const hasUpdater = await electronApp.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "Workspace")
      .submenu.items.some((item) => item.label === "Update local database…"),
  );
  if (!hasUpdater)
    throw new Error("Native local database updater menu is missing.");
  await expect(
    setup.getByRole("heading", { name: "Build your position." }),
  ).toBeVisible();
  await setup.getByLabel("Supabase URL", { exact: true }).fill(url);
  await setup
    .getByLabel("Supabase publishable / anon key", { exact: true })
    .fill(key);
  await setup
    .getByLabel("Your operator account email", { exact: true })
    .fill(email);
  const next = electronApp.waitForEvent("window");
  await setup
    .getByRole("button", { name: "Open my workspace", exact: true })
    .click();
  let window;
  try {
    window = await next;
  } catch (error) {
    console.error(
      "Desktop setup status:",
      await setup.getByRole("status").innerText(),
    );
    throw error;
  }
  await expect(
    window.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible({ timeout: 60000 });
  if (process.platform === "win32") {
    const encryption = await electronApp.evaluate(
      ({ safeStorage }) =>
        safeStorage.isEncryptionAvailable() &&
        safeStorage.decryptString(
          safeStorage.encryptString("synthetic-encryption-check"),
        ) === "synthetic-encryption-check",
    );
    if (!encryption)
      throw Error("Windows OS credential encryption is unavailable.");
  }
  if (new URL(window.url()).port === "3030")
    throw new Error("Desktop unexpectedly depended on port 3030.");
  if (real) {
    await window.getByLabel("Email address", { exact: true }).fill(email);
    await window.getByLabel("Password", { exact: true }).fill(password);
    await window
      .getByRole("button", { name: "Enter your workspace", exact: true })
      .click();
    await expect(
      window.getByRole("heading", { name: "Make the next move." }),
    ).toBeVisible();
    const automation = await electronApp.evaluate(async ({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(
        'fetch("/api/automation/tick", { method: "POST", credentials: "same-origin", cache: "no-store" }).then(async response => ({status:response.status,body:await response.json()}))',
      );
    });
    if (automation.status !== 200 || automation.body.reason !== "paused")
      throw Error(
        "Authenticated native automation tick was not safely paused.",
      );
    await window
      .getByRole("link", { name: "Agent control", exact: true })
      .click();
    await expect(
      window.getByRole("heading", { name: "Work worth approving." }),
    ).toBeVisible();
    await expect(window.locator('img[src="/brand-ir.svg"]')).toBeVisible();
    await window
      .getByRole("link", { name: "Data converter", exact: true })
      .click();
    await window.getByLabel("Conversion template").selectOption("employees");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Employees").addRows([
      ["Employee ID", "Name"],
      ["00017", "Synthetic Employee"],
    ]);
    await window.getByLabel("Spreadsheet or CSV file").setInputFiles({
      name: "desktop-test.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    await expect(
      window.getByText(/1 source rows · 1 valid · 0 need review/),
    ).toBeVisible();
    await window.goto(
      `${new URL(window.url()).origin}/dashboard/outreach/${leadId}`,
    );
    await expect(
      window.getByText("Draft status enforced", { exact: true }),
    ).toBeVisible();
    // Exercise the native updater with a current real local database. It must be a no-op.
    await electronApp.evaluate(({ dialog, Menu }) => {
      globalThis.__upgradeMessages = [];
      dialog.showMessageBox = async (_parent, options) => {
        globalThis.__upgradeMessages.push(options.message);
        return { response: options.buttons ? 1 : 0, checkboxChecked: false };
      };
      Menu.getApplicationMenu()
        .items.find((item) => item.label === "Workspace")
        .submenu.items.find((item) => item.label === "Update local database…")
        .click();
    });
    await expect
      .poll(() => electronApp.evaluate(() => globalThis.__upgradeMessages))
      .toContain("Local database is already up to date.");
    await expect(
      window.getByText("Draft status enforced", { exact: true }),
    ).toBeVisible();
  }
  console.log(
    `Desktop ${process.platform} smoke passed: setup → embedded server on automatic port → ${real ? "real local sign-in → Agent control → XLSX conversion → outreach draft → native database updater (no-op) → neon logo" : "sign-in UI (synthetic backend health only)"}.`,
  );
} finally {
  if (electronApp) await electronApp.close();
  if (mock) await new Promise((resolve) => mock.close(resolve));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
