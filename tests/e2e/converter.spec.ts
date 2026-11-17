import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { assertLocalTestEnvironment } from "../integration/local-guard";
assertLocalTestEnvironment();
test("XLSX conversion stays local; reviewed prospects use the real CRM import", async ({
  page,
}, testInfo) => {
  const run = randomUUID().slice(0, 8);
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(`converter-${run}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill(`Test-only-${randomUUID()}!`);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page
    .getByLabel("Organization name")
    .fill(`Converter ${testInfo.project.name} ${run}`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.getByRole("link", { name: "Data converter", exact: true }).click();
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.getByLabel("Conversion template").selectOption("employees");
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Instructions").addRow(["Synthetic workbook"]);
  const employees = book.addWorksheet("Employees");
  employees.addRow(["Synthetic fixture, not actual employee information"]);
  employees.addRow(["Employee ID", "Name", "Hire date", "Computed"]);
  employees.addRow([
    "00017",
    "Synthetic Person",
    "04/05/2026",
    { formula: "1+2", result: 3 },
  ]);
  employees.addRow(["00018", "Synthetic Other", "04/06/2026", ""]);
  await page.getByLabel("Spreadsheet or CSV file").setInputFiles({
    name: "employees.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
  });
  await page.getByLabel("Source sheet").selectOption("1");
  await page.getByLabel("Header row", { exact: true }).fill("2");
  await expect(
    page.getByText(/2 source rows · 0 valid · 2 need review/),
  ).toBeVisible();
  await page.getByLabel("Source date format").selectOption("MDY");
  await expect(
    page.getByText(/2 source rows · 2 valid · 0 need review/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download XLSX", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Preview prospects in CRM" }),
  ).toHaveCount(0);
  await page.getByText("Formula / cell warnings", { exact: false }).click();
  await expect(
    page.getByText(/formula not recalculated; only its saved result/),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /I reviewed the mapping/ }).check();
  const jsonPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  const jsonDownload = await jsonPromise;
  const json = JSON.parse(await readFile((await jsonDownload.path())!, "utf8"));
  expect(json.records[0].employee_id).toBe("00017");
  expect(json.records[0].hire_date).toBe("2026-04-05");
  const xlsxPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download XLSX", exact: true })
    .click();
  const downloaded = await xlsxPromise;
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.load(
    (await readFile((await downloaded.path())!)) as unknown as Parameters<
      typeof exported.xlsx.load
    >[0],
  );
  expect(exported.worksheets[0].getCell("A2").value).toBe("00017");
  expect(posts).toEqual([]);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: testInfo.outputPath("converter.png"),
    fullPage: true,
  });
  await page.getByLabel("Conversion template").selectOption("prospects");
  const prospects = new ExcelJS.Workbook();
  const sheet = prospects.addWorksheet("Prospects");
  sheet.addRow(["Company", "City", "Sector", "Website"]);
  sheet.addRow([
    `Synthetic XLSX ${run}`,
    "Erie PA",
    "Plumbing",
    `https://${run}.example.test`,
  ]);
  await page.getByLabel("Spreadsheet or CSV file").setInputFiles({
    name: "prospects.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await prospects.xlsx.writeBuffer()),
  });
  await expect(
    page.getByText(/1 source rows · 1 valid · 0 need review/),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /I reviewed the mapping/ }).check();
  await page
    .getByRole("button", { name: "Preview prospects in CRM", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/imports\/[\w-]+$/);
  await expect(page.getByText("1 valid", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /I reviewed the rows/ }).check();
  await page
    .getByRole("button", { name: "Import valid prospects", exact: true })
    .click();
  await expect(page.getByText("1 imported", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await expect(
    page
      .getByRole("link", { name: new RegExp(`Synthetic XLSX ${run}`) })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp(`Synthetic XLSX ${run}`) })
    .first()
    .click();
  await expect(page.getByLabel("Pipeline status", { exact: true })).toHaveValue(
    "Discovered",
  );
});
