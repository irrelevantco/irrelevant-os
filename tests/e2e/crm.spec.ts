import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { assertLocalTestEnvironment } from "../integration/local-guard";
assertLocalTestEnvironment();
test("authentication, CRM, follow-ups, tenant switching and sign-out", async ({
  page,
}, testInfo) => {
  const run = randomUUID().slice(0, 8);
  const email = `e2e-${run}@example.test`;
  const password = `Local-test-${randomUUID()}!`;
  const organization = `E2E ${testInfo.project.name} ${run}`;
  const business = `Test Services ${run}`;
  const website = `https://${run}.example.test`;
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Make your move." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Organization name").fill(organization);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(
    page.getByRole("heading", { name: "Make the next move." }),
  ).toBeVisible();
  await expect(
    page.getByText("Your next opportunity starts here."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add business", exact: true }).click();
  await page.getByLabel("Business name", { exact: true }).fill(business);
  await page
    .getByLabel("Industry", { exact: true })
    .fill("Commercial cleaning");
  await page.getByLabel("Location", { exact: true }).fill("New York, NY");
  await page.getByLabel("Website", { exact: true }).fill(website);
  await page.getByLabel("Public business email").fill("hello@example.test");
  await page.getByLabel("Estimated contract value (USD)").fill("3000.25");
  await page.getByLabel("Next follow-up").fill("2000-01-01");
  await page
    .getByLabel("Source URL", { exact: true })
    .fill("https://example.test/source");
  await page
    .getByLabel("Source notes", { exact: true })
    .fill("Synthetic local browser-test fixture. No actual business claims.");
  await page.getByRole("button", { name: "Add to pipeline" }).click();
  await expect(
    page.getByRole("heading", { name: business, exact: true }),
  ).toBeVisible();
  const authCookies = (await page.context().cookies()).filter((cookie) =>
    cookie.name.startsWith("sb-"),
  );
  expect(authCookies.length).toBeGreaterThan(0);
  expect(
    authCookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax"),
  ).toBe(true);
  const leadUrl = page.url();
  await page
    .getByLabel("Add a note", { exact: true })
    .fill("Synthetic test note: research verified locally.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Synthetic test note: research verified locally." }),
  ).toBeVisible();
  await page.getByLabel("Pipeline status").selectOption("Qualified");
  await page.getByRole("button", { name: "Save lead", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Lead updated." }),
  ).toBeVisible();
  await page.getByText("Edit business information", { exact: true }).click();
  await page.getByLabel("Public business phone").fill("212-555-0100");
  await page
    .getByRole("button", { name: "Save business", exact: true })
    .click();
  await expect(page.getByText("212-555-0100", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page
      .getByRole("heading", { name: "Follow-ups due" })
      .locator("..")
      .locator("..")
      .getByText("1", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "Qualified & progressing" })
      .locator("..")
      .locator("..")
      .getByText("1", { exact: true }),
  ).toBeVisible();
  const layout = await page.evaluate(() => ({
    inner: window.innerWidth,
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    pixelRatio: window.devicePixelRatio,
  }));
  console.log(`${testInfo.project.name} viewport`, page.viewportSize(), layout);
  expect(layout.scroll).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: testInfo.outputPath("dashboard.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await page.getByLabel("Business name", { exact: true }).fill(run);
  await page
    .getByLabel("Pipeline status", { exact: true })
    .selectOption("Qualified");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(business) }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Pipeline", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: business, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await expect(page.getByText("created a lead note")).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const second = page
    .getByRole("heading", { name: "Create another organization" })
    .locator("..");
  await second.getByLabel("Organization name").fill(`E2E separate ${run}`);
  await second.getByRole("button", { name: "Create organization" }).click();
  await expect(
    page.getByText("Your next opportunity starts here."),
  ).toBeVisible();
  // Knowing another tenant's record URL does not grant access.
  await page.goto(leadUrl);
  await expect(
    page.getByRole("heading", { name: "A different direction." }),
  ).toBeVisible();
  await page
    .getByLabel("Active organization")
    .selectOption({ label: organization });
  await page.getByRole("button", { name: "Switch", exact: true }).click();
  await expect(page.getByText(business, { exact: true }).first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  // Duplicate creation must fail without leaving an extra business or lead.
  await page.goto("/dashboard/leads/new");
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Same domain, different label");
  await page.getByLabel("Industry", { exact: true }).fill("Services");
  await page.getByLabel("Location", { exact: true }).fill("New York, NY");
  await page.getByLabel("Website", { exact: true }).fill(website);
  await page.getByRole("button", { name: "Add to pipeline" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "This business already exists" }),
  ).toContainText("This business already exists");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Make the next move." }),
  ).toBeVisible();
});
