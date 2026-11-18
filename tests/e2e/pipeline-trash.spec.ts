import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { assertLocalTestEnvironment } from "../integration/local-guard";

test("387-lead vertical pipeline, context menu, removal and restoration", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const { url, key } = assertLocalTestEnvironment();
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const run = randomUUID().slice(0, 8);
  const email = `pipeline-${run}@example.test`,
    password = `Local-test-${randomUUID()}!`;
  const signup = await db.auth.signUp({ email, password });
  expect(signup.data.session).toBeTruthy();
  const org = (
    await db.rpc("create_organization", {
      organization_name: `Synthetic pipeline ${run}`,
    })
  ).data as string;
  const name = (i: number) =>
    `Pipeline fixture ${run} ${String(i).padStart(3, "0")}`;
  const ids: string[] = [];
  for (let start = 0; start < 387; start += 12) {
    await Promise.all(
      Array.from({ length: Math.min(12, 387 - start) }, async (_, n) => {
        const i = start + n;
        const r = await db.rpc("create_prospect", {
          payload: {
            organization_id: org,
            name: name(i),
            industry: "Synthetic services",
            location: "Test City PA",
            estimated_value_cents: 300000,
          },
        });
        expect(r.error).toBeNull();
        ids[i] = r.data;
      }),
    );
  }
  await db.from("leads").update({ status: "Qualified" }).eq("id", ids[1]);
  await db.from("lead_notes").insert({
    organization_id: org,
    lead_id: ids[0],
    body: "Synthetic note retained after removal",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/dashboard/pipeline");
  await expect(
    page.getByText("387 loaded leads · 12 cards per stage page"),
  ).toBeVisible();
  const board = page.getByRole("region", { name: "Pipeline board" });
  const discovered = board.locator('details[data-stage="0"]');
  await expect(discovered.locator("article")).toHaveCount(12);
  await page
    .getByRole("button", { name: "Next Discovered leads", exact: true })
    .click();
  await expect(
    discovered.getByText("Showing 13–24 of 386", { exact: true }),
  ).toBeVisible();
  const layout = await board.evaluate((el) => ({
    boardWidth: el.clientWidth,
    boardScroll: el.scrollWidth,
    windowWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.boardScroll).toBeLessThanOrEqual(layout.boardWidth);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.windowWidth);
  const stages = await board
    .locator("details")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(stages.every((top, i) => i === 0 || top > stages[i - 1])).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("vertical-pipeline.png"),
    fullPage: true,
  });
  await page.getByLabel("Jump to stage").selectOption("2");
  await expect(board.locator('details[data-stage="2"]')).toHaveAttribute(
    "open",
    "",
  );
  await expect(
    page.getByRole("heading", { name: name(1), exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Collapse all", exact: true }).click();
  await expect(board.locator("details[open]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Expand populated stages", exact: true })
    .click();
  await expect(board.locator("details[open]")).toHaveCount(2);
  await page.getByLabel("Search pipeline").fill(name(0));
  const card = board
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: name(0), exact: true }) });
  await expect(card).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("filtered-pipeline.png"),
    fullPage: true,
  });
  await card.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Delete lead…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete lead?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await db.from("leads").select("id").eq("id", ids[0])).data,
  ).toHaveLength(1);
  await card
    .getByRole("button", { name: `Actions for ${name(0)}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete lead…", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/pipeline\?removed=1$/);
  await page.getByLabel("Search pipeline").fill("");
  await expect(
    page.getByText("386 loaded leads · 12 cards per stage page"),
  ).toBeVisible();
  expect(
    (await db.from("leads").select("id").eq("id", ids[0])).data,
  ).toHaveLength(0);
  expect(
    (await db.from("lead_notes").select("id").eq("lead_id", ids[0])).data,
  ).toHaveLength(1);
  await page.getByRole("link", { name: "Trash", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: name(0), exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore lead", exact: true }).click();
  await expect(page.getByText("Trash is empty.")).toBeVisible();
  expect((await db.rpc("crm_summary", { org })).data.total).toBe(387);
  await page.goto(`/dashboard/leads?q=${encodeURIComponent(name(0))}`);
  const row = page.getByRole("row").filter({ hasText: name(0) });
  await row.getByRole("link").first().focus();
  await page.keyboard.press("Shift+F10");
  await page
    .getByRole("menuitem", { name: "Delete lead…", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await row.getByRole("link").first().click();
  await page
    .getByRole("button", { name: `Actions for ${name(0)}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete lead…", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/leads\?removed=1$/);
  expect((await db.rpc("crm_summary", { org })).data.total).toBe(386);
  expect(errors).toEqual([]);
});
