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
  let url, key, email, password;
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
  try {window=await next;} catch(error) {console.error("Desktop setup status:",await setup.getByRole("status").innerText());throw error;}
  await expect(
    window.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible({ timeout: 60000 });
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
    await window
      .getByRole("link", { name: "Agent control", exact: true })
      .click();
    await expect(
      window.getByRole("heading", { name: "Work worth approving." }),
    ).toBeVisible();
  }
  console.log(
    `Desktop ${process.platform} smoke passed: setup → embedded server on automatic port → ${real ? "real local sign-in → private CRM → Agent control" : "sign-in UI (synthetic backend health only)"}.`,
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
