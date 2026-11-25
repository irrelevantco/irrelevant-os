import { navigateWorkspace } from "./navigation";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { assertLocalTestEnvironment } from "../integration/local-guard";
assertLocalTestEnvironment();
test("agreed appointments update opportunity value without a page reload", async ({
  page,
  context,
}, testInfo) => {
  const run = randomUUID().slice(0, 8),
    business = `Synthetic Appointment ${run}`;
  await page.goto("/signup");
  await page
    .getByLabel("Email address")
    .fill(`appointment-${run}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill(`Test-only-${randomUUID()}!`);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/onboarding$/);
  await page
    .getByLabel("Organization name")
    .fill(`Appointment UI ${testInfo.project.name} ${run}`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.getByRole("link", { name: "Add business", exact: true }).click();
  await page.getByLabel("Business name", { exact: true }).fill(business);
  await page.getByLabel("Industry", { exact: true }).fill("Cleaning");
  await page.getByLabel("Location", { exact: true }).fill("Erie PA");
  await page.getByRole("button", { name: "Add to pipeline" }).click();
  await expect(
    page.getByRole("heading", { name: business, exact: true }),
  ).toBeVisible();
  const dashboard = await context.newPage();
  await dashboard.goto("/dashboard");
  const valueCard = dashboard
    .getByRole("heading", { name: "Open opportunity value", exact: true })
    .locator("..");
  await expect(valueCard).toContainText("$0");
  await navigateWorkspace(page, "Calls & meetings");
  await page
    .getByLabel("Appointment prospect")
    .selectOption({ label: business });
  const date = new Date(Date.now() + 7 * 86400000);
  while ([0, 6].includes(date.getUTCDay()))
    date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(14, 0, 0, 0);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  await page
    .getByLabel("Agreed start · Eastern Time")
    .fill(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`,
    );
  await page.getByLabel("Potential scope value (USD)").fill("5000");
  await page
    .getByLabel("How was this time agreed?")
    .fill(
      "Synthetic browser fixture agreement; no real business was contacted.",
    );
  await page.getByRole("checkbox", { name: /The business agreed/ }).check();
  await page
    .getByRole("button", { name: "Record agreed appointment", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Agreed appointment recorded" }),
  ).toBeVisible();
  await dashboard.bringToFront();
  await expect(valueCard).toContainText("$5,000", { timeout: 25000 });
  await expect(
    dashboard.getByText("Refreshes every 10 seconds while visible.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.bringToFront();
  await expect(
    page.getByRole("button", { name: "Add / reconcile Google Calendar" }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("appointments.png"),
    fullPage: true,
  });
  await navigateWorkspace(page, "Connections");
  await expect(
    page.getByText(
      "Not connected. No Gmail sends or Google events are active.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Allow separately approved Gmail sends", { exact: false }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /Enable hourly discovery/ }),
  ).not.toBeChecked();
  await navigateWorkspace(page, "Settings");
  await expect(
    page.getByText("Phone hosting is not connected yet.", { exact: true }),
  ).toBeVisible();
  const denied = await page.request.post("/api/automation/tick", {
    headers: { Origin: "https://untrusted.example.test" },
  });
  expect(denied.status()).toBe(403);
  await dashboard.close();
});
