import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { assertLocalTestEnvironment } from "../integration/local-guard";
assertLocalTestEnvironment();
test("guided choices expose real controls and retain selected timing", async ({
  page,
}, info) => {
  const run = randomUUID().slice(0, 8);
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(`assistant-${run}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill(`Local-only-${randomUUID()}!`);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/onboarding$/);
  await page.getByLabel("Organization name").fill(`Synthetic assistant ${run}`);
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await page.goto("/dashboard/agents");
  const agent = page.getByRole("region", { name: "iR guided assistant" });
  await expect(agent).toBeVisible();
  await expect(agent.getByRole("textbox")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Find businesses", exact: true })
    .click();
  await expect(page.getByLabel("Choose an area")).toBeVisible();
  await page
    .getByRole("button", { name: "Automation & timing", exact: true })
    .click();
  await page.getByLabel("Automation starts · Eastern").selectOption("9");
  await page.getByLabel("Automation ends · Eastern").selectOption("13");
  await page.getByLabel("Check queued work").selectOption("15");
  await page
    .getByRole("button", { name: "Save local engine controls", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Engine controls saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await page
    .getByRole("button", { name: "Automation & timing", exact: true })
    .click();
  await expect(page.getByLabel("Check queued work")).toHaveValue("15");
  await expect(page.getByLabel("Automation starts · Eastern")).toHaveValue("9");
  await page
    .getByRole("button", { name: "Approve an email campaign", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Approve seven-day automatic campaign",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Import or convert files", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Review import results", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("guided-assistant.png"),
    fullPage: true,
  });
});
