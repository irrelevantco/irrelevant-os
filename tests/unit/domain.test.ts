import { describe, expect, it } from "vitest";
import {
  authSchema,
  businessSchema,
  followUpSchema,
  leadUpdateSchema,
  noteSchema,
  prospectSchema,
  STATUSES,
  urlSchema,
  valueSchema,
} from "../../src/lib/domain";
const valid = {
  name: "Example Services",
  industry: "Cleaning",
  location: "New York, NY",
  website: "https://example.test",
  email: "",
  phone: "",
  contact_page: "",
  social_urls: "",
  source_url: "",
  source_notes: "",
  estimated_value_cents: "",
  next_follow_up: "",
};
describe("business input boundaries", () => {
  it("normalizes public URLs and keeps unknown data empty", () => {
    const p = prospectSchema.parse(valid);
    expect(p.website).toBe("https://example.test/");
    expect(p.email).toBeNull();
    expect(p.estimated_value_cents).toBeNull();
    expect(p.social_urls).toEqual([]);
  });
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,hello",
    "https://user:secret@example.test",
    "not a URL",
  ])("rejects unsafe URL %s", (value) =>
    expect(urlSchema.safeParse(value).success).toBe(false),
  );
  it("bounds source notes and social links", () => {
    expect(
      prospectSchema.safeParse({ ...valid, source_notes: "x".repeat(2001) })
        .success,
    ).toBe(false);
    expect(
      businessSchema.safeParse({
        ...valid,
        social_urls: Array(11).fill("https://example.test").join("\n"),
      }).success,
    ).toBe(false);
  });
  it("rejects missing business identity and private-looking invalid email", () => {
    expect(
      prospectSchema.safeParse({ ...valid, name: " ", email: "abc" }).success,
    ).toBe(false);
  });
});
describe("pipeline and money", () => {
  it.each(STATUSES)("accepts the defined stage %s", (status) =>
    expect(
      leadUpdateSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        status,
        estimated_value_cents: "3000.25",
        next_follow_up: "",
      }).estimated_value_cents,
    ).toBe(300025),
  );
  it.each(["-1", "Infinity", "NaN", "1e5", "0.001", "1,000", "1000001"])(
    "rejects invalid estimate %s",
    (value) => expect(valueSchema.safeParse(value).success).toBe(false),
  );
  it("distinguishes unset from zero", () => {
    expect(valueSchema.parse("")).toBeNull();
    expect(valueSchema.parse("0")).toBe(0);
  });
  it.each(["2026-02-30", "2026-13-01", "2026-1-1", "not a date"])(
    "rejects impossible date %s",
    (value) => expect(followUpSchema.safeParse(value).success).toBe(false),
  );
  it("accepts a leap day", () =>
    expect(followUpSchema.parse("2028-02-29")).toBe("2028-02-29"));
  it("rejects arbitrary status values", () =>
    expect(
      leadUpdateSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "Automatically sent",
        estimated_value_cents: "",
        next_follow_up: "",
      }).success,
    ).toBe(false));
});
describe("account and notes", () => {
  it("requires strong password length and a valid email", () => {
    expect(
      authSchema.safeParse({ email: "me@example.test", password: "short" })
        .success,
    ).toBe(false);
    expect(
      authSchema.safeParse({
        email: "me@example.test",
        password: "Long-enough-4832!",
      }).success,
    ).toBe(true);
  });
  it("rejects blank notes and forged lead IDs", () =>
    expect(
      noteSchema.safeParse({ lead_id: "not-a-uuid", body: " " }).success,
    ).toBe(false));
});
