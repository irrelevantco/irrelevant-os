import { describe, expect, it } from "vitest";
import { pipelineGroups, stagePage } from "../../src/lib/pipeline";
import { leadTrashSchema } from "../../src/lib/lead-trash";

describe("large pipeline navigation", () => {
  const leads = Array.from({ length: 387 }, (_, id) => ({
    id,
    status: "Discovered" as const,
    business: {
      name: `Business ${id}`,
      industry: id === 386 ? "Bakery" : "Services",
      location: "Warren PA",
    },
  }));
  it("groups all 387 leads without losing the last page", () => {
    const groups = pipelineGroups(leads, "");
    expect(groups).toHaveLength(12);
    expect(groups[0].leads).toHaveLength(387);
    expect(stagePage(groups[0].leads, 33).items.map((l) => l.id)).toEqual([
      384, 385, 386,
    ]);
    expect(stagePage(groups[0].leads, 1).items).toHaveLength(12);
  });
  it("searches name, industry and location, ignoring case and surrounding space", () => {
    expect(pipelineGroups(leads, " BAKERY ")[0].leads.map((l) => l.id)).toEqual(
      [386],
    );
    expect(pipelineGroups(leads, "Business 386")[0].leads).toHaveLength(1);
    expect(pipelineGroups(leads, "warren")[0].leads).toHaveLength(387);
    expect(
      pipelineGroups(leads, "missing").every((g) => g.leads.length === 0),
    ).toBe(true);
  });
  it("clamps pagination after removal or filtering and handles empty stages", () => {
    expect(stagePage(leads.slice(0, 384), 33).page).toBe(32);
    expect(stagePage(leads.slice(0, 1), 33).items).toHaveLength(1);
    expect(stagePage([], 99)).toEqual({
      page: 1,
      pages: 1,
      start: 0,
      items: [],
    });
  });
});
describe("lead removal requests", () => {
  const request = {
    id: "12345678-1234-4234-8234-123456789abc",
    expected_updated_at: "2026-11-18T15:00:00+00:00",
    confirmed: "yes",
    return_to: "/dashboard/pipeline",
  };
  it("requires explicit confirmation and a current revision", () => {
    expect(leadTrashSchema.safeParse(request).success).toBe(true);
    expect(
      leadTrashSchema.safeParse({ ...request, confirmed: undefined }).success,
    ).toBe(false);
    expect(
      leadTrashSchema.safeParse({ ...request, expected_updated_at: "old" })
        .success,
    ).toBe(false);
  });
  it("rejects forged IDs and external redirects", () => {
    expect(leadTrashSchema.safeParse({ ...request, id: "all" }).success).toBe(
      false,
    );
    expect(
      leadTrashSchema.safeParse({
        ...request,
        return_to: "https://example.test",
      }).success,
    ).toBe(false);
  });
});
