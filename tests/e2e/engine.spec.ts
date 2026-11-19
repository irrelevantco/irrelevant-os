import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { assertLocalTestEnvironment } from "../integration/local-guard";

test("engine controls, inactive campaign and private inventory report", async ({
  page,
}, info) => {
  const { url, key } = assertLocalTestEnvironment();
  const db = createClient(url, key, { auth: { persistSession: false } });
  const run = randomUUID().slice(0, 8),
    email = `engine-ui-${run}@example.test`,
    password = `Test-only-${randomUUID()}!`;
  expect((await db.auth.signUp({ email, password })).data.session).toBeTruthy();
  expect(
    (
      await db.rpc("create_organization", {
        organization_name: `Synthetic engine UI ${run}`,
      })
    ).error,
  ).toBeNull();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/dashboard/engine");
  await expect(
    page.getByRole("heading", { name: "A considered path to more clients." }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Active lead goal", { exact: true }),
  ).toHaveValue("1000");
  await expect(page.getByLabel("Discovery territories")).toContainText(
    "Angola, NY",
  );
  await expect(page.getByLabel("Research assistance")).toHaveValue("rules");
  await expect(
    page.getByRole("button", {
      name: "Approve seven-day automatic campaign",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Save local engine controls", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Engine controls saved" }),
  ).toBeVisible();
  await expect(
    page.getByText("Paused / not approved", { exact: true }),
  ).toBeVisible();
  const report = await page.request.get("/api/engine/inventory");
  expect(report.ok()).toBeTruthy();
  expect(report.headers()["cache-control"]).toContain("no-store");
  const data = await report.json();
  expect(data.account).toBe(email);
  expect(data.inventory.active_leads).toBe(0);
  expect(JSON.stringify(data)).not.toMatch(
    /"(?:access_token|refresh_token|publishable_key|password|client_secret|ciphertext)"\s*:/,
  );
  expect(
    await page
      .locator("body")
      .evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath("engine.png"),
    fullPage: true,
  });
  await db.auth.signOut();
});
