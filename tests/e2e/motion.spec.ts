import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { assertLocalTestEnvironment } from "../integration/local-guard";

assertLocalTestEnvironment();

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`startup paints before hydration and releases with ${reducedMotion} motion`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion });
    let release!: () => void;
    const scripts = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, async (route) => {
      await scripts;
      await route.continue();
    });
    try {
      await page.goto("/login", { waitUntil: "commit" });
      const splash = page.locator("[data-startup-splash]");
      await expect(splash).toBeVisible();
      await expect(splash).toContainText("Build your position.");
      await expect(splash.locator("img")).toHaveAttribute(
        "src",
        "/brand-ir.svg",
      );
      expect(
        await splash.evaluate(
          (element) => getComputedStyle(element).pointerEvents,
        ),
      ).toBe("none");
      if (reducedMotion === "reduce") {
        expect(
          await splash
            .locator(".loading-rail > span")
            .evaluate((element) => getComputedStyle(element).animationName),
        ).toBe("none");
      }
      await page.screenshot({
        path: info.outputPath(`startup-${reducedMotion}.png`),
      });
      release();
      await expect(splash).toBeHidden();
      await page.getByLabel("Email address").fill("synthetic@example.test");
      await expect(page.getByLabel("Email address")).toHaveValue(
        "synthetic@example.test",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      release();
    }
  });
}

test("server-rendered sign-in remains usable without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.locator("[data-startup-splash]")).toBeHidden();
    await page.getByLabel("Email address").fill("synthetic@example.test");
    await expect(page.getByLabel("Email address")).toHaveValue(
      "synthetic@example.test",
    );
  } finally {
    await context.close();
  }
});

test("pending navigation follows real routing and the splash does not replay on tabs", async ({
  page,
}, info) => {
  const run = randomUUID().slice(0, 8);
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(`motion-${run}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill(`Local-only-${randomUUID()}!`);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/onboarding$/);
  await page.getByLabel("Organization name").fill(`Synthetic motion ${run}`);
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("[data-startup-splash]")).toBeHidden();
  let release!: () => void;
  const destination = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/dashboard\/research(?:\?|$)/, async (route) => {
    await destination;
    await route.continue();
  });
  const link = page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("link", { name: "Research", exact: true });
  try {
    await link.click();
    await expect(link.locator("[data-pending]")).toHaveAttribute(
      "data-pending",
      "true",
    );
    await expect(link.getByRole("status")).toHaveText("Opening Research…");
    await expect(page.locator("[data-startup-splash]")).toBeHidden();
    release();
    await expect(page).toHaveURL(/\/dashboard\/research$/);
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(link.locator("[data-pending]")).toHaveAttribute(
      "data-pending",
      "false",
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: info.outputPath("workspace-ready.png"),
      fullPage: true,
    });
  } finally {
    release();
  }
});
