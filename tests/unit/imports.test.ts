import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  autoMapping,
  duplicateKeys,
  importRowSchema,
  mappingSchema,
  normalizeName,
  parseCsv,
  previewRows,
  websiteDomain,
} from "../../src/lib/imports/csv";
import {
  PILLARS,
  pointSchema,
  reviewSchema,
  initialOutreach,
} from "../../src/lib/reviews";
const csv =
  "business_name,location,industry,website,research_priority\nExample & Co,Erie PA,Cleaning,https://www.example.test/path,A";
describe("CSV parsing and mapping", () => {
  it("reads BOM, CRLF, quoted commas and quoted multiline fields", () => {
    const p = parseCsv(
      '\uFEFFname,city,sector\r\n"Example, Inc","Erie\nPA",Cleaning\r\n',
    );
    expect(p.records[0]).toEqual({
      name: "Example, Inc",
      city: "Erie\nPA",
      sector: "Cleaning",
    });
  });
  it("maps custom headers with optional columns omitted", () => {
    const p = parseCsv("name,city,sector\nExample,Erie,Cleaning");
    const rows = previewRows(p.records, {
      business_name: "name",
      location: "city",
      industry: "sector",
    });
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].payload?.website).toBeNull();
  });
  it("requires identity mappings and forbids reusing a source column", () => {
    expect(mappingSchema.safeParse({ business_name: "x" }).success).toBe(false);
    expect(
      mappingSchema.safeParse({
        business_name: "x",
        location: "x",
        industry: "y",
      }).success,
    ).toBe(false);
  });
  it("returns row-level identity and URL errors", () => {
    const p = parseCsv(csv + "\nX,Erie PA,Cleaning,javascript:alert(1),A");
    const rows = previewRows(p.records, autoMapping(p.headers));
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].row_number).toBe(3);
    expect(rows[1].errors.join(" ")).toContain("business_name");
    expect(rows[1].errors.join(" ")).toContain("website");
  });
  it("reports extra and missing column cells as row errors", () => {
    const p = parseCsv(
      "business_name,location,industry\nExample,Erie\nOther,Erie,Cleaning,Extra",
    );
    expect(
      previewRows(p.records, autoMapping(p.headers)).every(
        (r) => r.errors.length > 0,
      ),
    ).toBe(true);
  });
  it.each([
    "x,x\na,b",
    "name,,sector\na,b,c",
    "__csv_error,name\nx,y",
    "name\n",
    'name\n"unterminated',
  ])("rejects malformed CSV %s", (text) =>
    expect(() => parseCsv(text)).toThrow(),
  );
  it("enforces row and byte limits", () => {
    expect(() =>
      parseCsv("name\n" + Array(501).fill("Example").join("\n")),
    ).toThrow();
    expect(() => parseCsv("name\n" + "x".repeat(524289))).toThrow();
  });
  it("loads all 30 supplied records without converting hypotheses into findings", () => {
    const p = parseCsv(
      readFileSync("data/imports/irrelevant_os_30_prospects.csv", "utf8"),
    );
    const rows = previewRows(p.records, autoMapping(p.headers));
    expect(rows).toHaveLength(30);
    expect(
      rows.every(
        (r) => !r.errors.length && r.payload?.audit_hypothesis_not_verified,
      ),
    ).toBe(true);
    expect(rows.every((r) => !r.payload?.verified_digital_issue)).toBe(true);
    expect(rows.every((r) => r.payload?.contact_email === null)).toBe(true);
  });
  it("does not execute spreadsheet formula-like text", () => {
    const p = parseCsv(
      'business_name,location,industry,notes\nExample,Erie,Cleaning,"=HYPERLINK(""bad"")"',
    );
    expect(p.records[0].notes.startsWith("=")).toBe(true);
  });
  it("rejects unknown priority and invalid email", () => {
    const p = parseCsv(csv);
    const raw = {
      ...previewRows(p.records, autoMapping(p.headers))[0].payload,
      research_priority: "D",
      contact_email: "invalid",
    };
    expect(importRowSchema.safeParse(raw).success).toBe(false);
  });
});
describe("normalized deduplication", () => {
  it("normalizes punctuation, whitespace, case and ampersands", () =>
    expect(normalizeName(" A & B, LLC. ")).toBe(normalizeName("a and b llc")));
  it("normalizes international compatibility characters", () =>
    expect(normalizeName("ＡＢＣ")).toBe("abc"));
  it("normalizes domains across www, port, query and paths", () => {
    expect(websiteDomain("https://WWW.Example.test:443/a?b=1")).toBe(
      "example.test",
    );
    expect(websiteDomain(null)).toBe("");
  });
  it("uses name plus location while retaining distinct locations", () => {
    const keys = duplicateKeys({
      business_name: "Example & Co",
      location: "Erie, PA",
      website: null,
    });
    expect(keys).toEqual(
      duplicateKeys({
        business_name: "EXAMPLE AND CO.",
        location: "erie pa",
        website: null,
      }),
    );
    expect(keys).not.toEqual(
      duplicateKeys({
        business_name: "Example & Co",
        location: "Warren PA",
        website: null,
      }),
    );
  });
});
describe("evidence and draft boundaries", () => {
  const point = {
    pillar: "Digital Presence",
    observation: "",
    recommendation: "",
    source_url: "",
    verification_status: "unverified",
    confidence: "unknown",
    last_researched_date: "",
  };
  it("allows empty, explicitly unverified research", () =>
    expect(pointSchema.safeParse(point).success).toBe(true));
  it("rejects verified hypotheses without evidence", () =>
    expect(
      pointSchema.safeParse({
        ...point,
        verification_status: "verified",
        observation: "Maybe there is an opportunity",
      }).success,
    ).toBe(false));
  it("requires confidence and a research date for verified observations", () =>
    expect(
      pointSchema.safeParse({
        ...point,
        verification_status: "verified",
        observation: "Synthetic test observation",
        source_url: "https://example.test/evidence",
      }).success,
    ).toBe(false));
  it("requires three distinct pillars", () =>
    expect(
      reviewSchema.safeParse({
        lead_id: "550e8400-e29b-41d4-a716-446655440000",
        expected_revision: 1,
        suggested_offer: "",
        points: PILLARS.map(() => point),
      }).success,
    ).toBe(false));
  it("generates an introduction without unsupported weakness or budget claims", () => {
    const draft = initialOutreach("Example Co", "Cleaning", "Erie PA");
    expect(draft.email_draft).toContain("Example Co");
    expect(draft.email_draft).not.toMatch(
      /\$|underperform|poor|broken|guarantee/i,
    );
  });
});
