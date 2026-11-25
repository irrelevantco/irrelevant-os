import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { assertLocalTestEnvironment } from "../integration/local-guard";
import { navigateWorkspace, openWorkspaceNavigation } from "./navigation";
assertLocalTestEnvironment();

test("CUT-style sidebar fits split windows and the phone menu preserves the current form", async ({
  page,
}, info) => {
  const run = randomUUID().slice(0, 8);
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(`layout-${run}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill(`Synthetic-only-${run}!`);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/onboarding$/);
  await page.getByLabel("Organization name").fill(`Synthetic layout ${run}`);
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const size of [
    { width: 960, height: 960 },
    { width: 800, height: 600 },
    { width: 768, height: 720 },
  ]) {
    await page.setViewportSize(size);
    const sidebar = page.getByRole("complementary", {
      name: "Workspace sidebar",
    });
    await expect(sidebar).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Open workspace navigation",
        exact: true,
      }),
    ).toBeHidden();
    const links = sidebar
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("link");
    await expect(links).toHaveCount(13);
    const first = await links.nth(0).boundingBox(),
      second = await links.nth(1).boundingBox();
    expect(second!.x).toBe(first!.x);
    expect(second!.y).toBeGreaterThan(first!.y);
    expect(
      (await page.locator("main#main").boundingBox())!.x,
    ).toBeGreaterThanOrEqual(216);
    if (size.width === 960)
      await page.screenshot({
        path: info.outputPath("cut-style-split-window.png"),
        fullPage: true,
        animations: "disabled",
      });
    await links.last().scrollIntoViewIfNeeded();
    await expect(links.last()).toBeInViewport();
    await expect(
      sidebar.getByText("Private workspace", { exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole("button", {
    name: "Open workspace navigation",
    exact: true,
  });
  const menu = page.getByRole("dialog", {
    name: "Workspace menu",
    exact: true,
  });
  await expect(trigger).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Workspace navigation" }),
  ).toHaveCount(0);
  await openWorkspaceNavigation(page);
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("button", {
      name: "Close workspace navigation",
      exact: true,
    }),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath("cut-style-phone-menu.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await openWorkspaceNavigation(page);
  await page.mouse.click(385, 120);
  await expect(menu).toBeHidden();
  await navigateWorkspace(page, "Settings");
  await expect(page).toHaveURL(/\/dashboard\/settings$/);
  await openWorkspaceNavigation(page);
  await menu
    .getByRole("searchbox", { name: "Search businesses", exact: true })
    .fill(`no-match-${run}`);
  await menu
    .getByRole("button", { name: "Run business search", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/leads\\?q=no-match-${run}$`),
  );
  await expect(menu).toBeHidden();
  await page.getByRole("link", { name: "New business", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/leads\/new$/);
  await page
    .getByLabel("Business name", { exact: true })
    .fill(`Unsaved synthetic ${run}`);
  await openWorkspaceNavigation(page);
  await menu
    .getByRole("button", { name: "Close workspace navigation", exact: true })
    .click();
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue(
    `Unsaved synthetic ${run}`,
  );
  await openWorkspaceNavigation(page);
  await page.setViewportSize({ width: 960, height: 720 });
  await expect(menu).toBeHidden();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
