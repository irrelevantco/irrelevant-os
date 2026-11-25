import { expect, type Page } from "@playwright/test";

export async function openWorkspaceNavigation(page: Page) {
  const trigger = page.getByRole("button", {
    name: "Open workspace navigation",
    exact: true,
  });
  if (
    (await trigger.isVisible()) &&
    !(await page
      .getByRole("dialog", { name: "Workspace menu", exact: true })
      .isVisible())
  )
    await trigger.click();
}

export async function navigateWorkspace(page: Page, label: string) {
  await openWorkspaceNavigation(page);
  await page
    .getByRole("navigation", { name: "Workspace navigation", exact: true })
    .getByRole("link", { name: label, exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Workspace menu", exact: true }),
  ).toBeHidden();
}
