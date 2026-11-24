import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { assertLocalTestEnvironment } from "../integration/local-guard";
assertLocalTestEnvironment();
test("CSV preview, mapping, import, research approval and draft preparation", async ({
  page,
}, testInfo) => {
  const run = randomUUID().slice(0, 8);
  const name = `Synthetic Services ${run}`;
  await page.goto("/signup");
  await expect(
    page.getByRole("heading", { name: "Make your move." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(`import-ui-${run}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill(`Test-only-${randomUUID()}!`);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page
    .getByLabel("Organization name")
    .fill(`Import UI ${testInfo.project.name} ${run}`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(
    page.getByRole("heading", { name: "Make the next move." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Imports", exact: true }).click();
  const csv = `Company,City,Sector,URL,Phone,Priority,Hypothesis,Email\n${name},Erie PA,Cleaning,https://${run}.example.test,814-555-0100,A,Unverified synthetic research question,public@${run}.example.test\n${name.toUpperCase()},erie pa,Cleaning,https://www.${run}.example.test/path,,A,Duplicate synthetic row,public@${run}.example.test\nX,Erie PA,Cleaning,javascript:alert(1),,B,Invalid synthetic row,\nSynthetic Other ${run},Warren PA,HVAC,,814-555-0101,C,Another unverified question,`;
  await page.getByLabel("CSV file").setInputFiles({
    name: "synthetic-batch.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Read uploaded CSV" }).click();
  await expect(
    page.getByRole("heading", { name: "Map your columns" }),
  ).toBeVisible();
  for (const [field, column] of Object.entries({
    business_name: "Company",
    location: "City",
    industry: "Sector",
    website: "URL",
    public_phone: "Phone",
    contact_email: "Email",
    research_priority: "Priority",
    audit_hypothesis_not_verified: "Hypothesis",
  }))
    await page.getByLabel(`Map ${field}`, { exact: true }).selectOption(column);
  await page.getByRole("button", { name: "Preview mapped rows" }).click();
  await expect(page).toHaveURL(/\/dashboard\/imports\/[\w-]+$/);
  await expect(page.getByText("2 valid", { exact: true })).toBeVisible();
  await expect(page.getByText("1 duplicate", { exact: true })).toBeVisible();
  await expect(page.getByText("1 invalid", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /I reviewed the rows/ }).check();
  await page.getByRole("button", { name: "Import valid prospects" }).click();
  await expect(
    page.getByRole("heading", { name: "Import results", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2 imported", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("2 imported", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Research these prospects" }).click();
  const first = page.getByRole("article").first();
  await expect(first).toContainText(name);
  await expect(first).toContainText("Priority A");
  await first.getByRole("link", { name: "Growth Review", exact: true }).click();
  await expect(
    page.getByText("Supplied hypothesis · unverified", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Digital Presence observation", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", {
      name: "Approve review & mark Ready for Outreach",
    }),
  ).toHaveCount(0);
  await page
    .getByLabel("Digital Presence observation", { exact: true })
    .fill("Synthetic browser test observation; not a real business finding.");
  await page
    .getByLabel("Digital Presence recommendation", { exact: true })
    .fill("Synthetic recommendation for test validation.");
  await page
    .getByLabel("Digital Presence source URL", { exact: true })
    .fill("https://example.test/synthetic-evidence");
  await page
    .getByLabel("Digital Presence verification", { exact: true })
    .selectOption("verified");
  await page
    .getByLabel("Digital Presence confidence", { exact: true })
    .selectOption("medium");
  await page
    .getByLabel("Digital Presence last researched", { exact: true })
    .fill("2026-11-17");
  await page
    .getByLabel("Suggested offer", { exact: true })
    .fill("Scope discussion; budget unknown");
  await page
    .getByRole("button", { name: "Save Growth Review", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Review saved." }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I manually approve review version/ })
    .check();
  await page
    .getByRole("button", {
      name: "Approve review & mark Ready for Outreach",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Review approved and lead marked Ready" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Prepare outreach draft" }).click();
  await expect(
    page.getByLabel("Personalized email draft", { exact: true }),
  ).toHaveValue(new RegExp(name));
  await expect(
    page.getByText("Draft status enforced", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Personalized email draft", { exact: true })
    .fill(`Synthetic draft for ${name}. Never sent.`);
  await page
    .getByLabel("Call opening script", { exact: true })
    .fill("Synthetic call preparation. No call placed.");
  await page.getByLabel("Follow-up date", { exact: true }).fill("2026-12-01");
  await page.getByRole("button", { name: "Save draft preparation" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Preparation saved as draft" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Personalized email draft", { exact: true }),
  ).toHaveValue(`Synthetic draft for ${name}. Never sent.`);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole("link", { name: "iR Agent", exact: true }).click();
  await page
    .getByRole("link", { name: "Advanced preparation controls", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Work worth approving." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume free preparation", exact: true })
    .click();
  await expect(
    page.getByText("Preparation enabled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Pause preparation agents", { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Discovery source")).toHaveValue("osm");
  await expect(page.getByLabel("Daily Explee credit allowance")).toHaveValue(
    "0",
  );
  await page
    .getByLabel("Sender name", { exact: true })
    .fill("Synthetic Operator");
  await page
    .getByLabel("Sender email", { exact: true })
    .fill("hello@example.test");
  await page
    .getByLabel("Business postal address", { exact: true })
    .fill("123 Synthetic Test Street");
  await page
    .getByRole("button", { name: "Save limits and sender", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Limits saved." }),
  ).toBeVisible();
  await page
    .getByLabel("Preparation workflow", { exact: true })
    .selectOption("outreach_draft");
  await page
    .getByLabel("Prospect", { exact: true })
    .selectOption({ label: name });
  await page
    .getByRole("button", { name: "Queue preparation", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Job queued." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Run next queued job", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Preparation processed." }),
  ).toBeVisible();
  await expect(
    page.getByText("Draft only. Accepting copies", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: /I reviewed this proposal/ })
    .check();
  await page
    .getByRole("button", { name: "Accept as editable draft", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Proposal copied" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize()!.width);
  await page
    .getByRole("button", { name: "Pause and stop all jobs", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Agents paused" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open prospect preparation", exact: true })
    .click();
  await expect(
    page.getByLabel("Personalized email draft", { exact: true }),
  ).toHaveValue(/Synthetic browser test observation/);
  await expect(
    page.getByLabel("Personalized email draft", { exact: true }),
  ).toHaveValue(/123 Synthetic Test Street/);
  const blockers = page.locator("#email-send-blockers");
  await expect(
    blockers.getByRole("heading", { name: "Why email approval is locked" }),
  ).toBeVisible();
  await expect(blockers).toContainText(
    "Google is not connected for this CRM account and workspace",
  );
  await expect(blockers).toContainText("Agents are paused");
  await expect(blockers).toContainText(
    "The saved sender email must be contact.irrelevantcollective@gmail.com",
  );
  await expect(
    blockers.getByRole("link", { name: "Connect Google", exact: true }),
  ).toHaveAttribute("href", "/dashboard/connections");
  const approval = page.getByRole("checkbox", {
    name: /I reviewed the recipient, subject and full message/,
  });
  await expect(approval).toBeDisabled();
  await expect(page.locator('input[name="expected_body_base64"]')).toHaveValue(
    /^[A-Za-z0-9+/]+={0,2}$/,
  );
  await expect(page.locator('input[name="expected_body"]')).toHaveCount(0);
  await expect(approval).toHaveAttribute(
    "aria-describedby",
    "email-send-blockers",
  );
  await expect(
    page.getByRole("button", {
      name: "Approve and send this email",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Edit review", exact: true }).click();
  await page
    .getByLabel("Digital Presence recommendation", { exact: true })
    .fill("Updated synthetic recommendation.");
  await page.getByRole("button", { name: "Save Growth Review" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Review saved." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Business & CRM notes" }).click();
  await expect(page.getByLabel("Pipeline status", { exact: true })).toHaveValue(
    "Researching",
  );
});

test("large previews count and paginate beyond the hosted 1000-row response limit", async ({
  page,
}) => {
  const { url, key } = assertLocalTestEnvironment();
  const db = createClient(url, key, { auth: { persistSession: false } });
  const id = randomUUID().slice(0, 8),
    email = `large-preview-${id}@example.test`,
    password = `Local-test-${randomUUID()}!`;
  expect((await db.auth.signUp({ email, password })).data.session).toBeTruthy();
  const org = (
    await db.rpc("create_organization", {
      organization_name: `Synthetic large preview ${id}`,
    })
  ).data!;
  const rows = Array.from({ length: 1205 }, (_, i) => ({
    row_number: i + 2,
    raw: { name: `Preview fixture ${id} ${i}` },
    payload: {
      business_name: `Preview fixture ${id} ${i}`,
      industry: "Synthetic services",
      location: "Test City PA",
      research_priority: "C",
      audit_hypothesis_not_verified: "Research required",
    },
    errors: [],
  }));
  const batch = await db.rpc("preview_prospect_import", {
    org,
    batch_label: "Synthetic large preview",
    file_name: "synthetic.csv",
    file_fingerprint: id.repeat(8),
    field_mapping: {},
    rows,
  });
  expect(batch.error).toBeNull();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/dashboard/imports/${batch.data}`);
  await expect(page.getByText("1205 valid", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Import preview pages" }),
  ).toContainText("Showing 1–100 of 1205 rows");
  await page.getByRole("link", { name: "Next preview rows" }).click();
  await expect(
    page.getByRole("navigation", { name: "Import preview pages" }),
  ).toContainText("Showing 101–200 of 1205 rows");
  await page.goto(`/dashboard/imports/${batch.data}?page=13`);
  await expect(
    page.getByRole("navigation", { name: "Import preview pages" }),
  ).toContainText("Showing 1201–1205 of 1205 rows");
  await expect(
    page.getByText(`Preview fixture ${id} 1204`, { exact: true }),
  ).toBeVisible();
  expect((await db.rpc("crm_summary", { org })).data.total).toBe(0);
});
