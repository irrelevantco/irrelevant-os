import { describe, it, expect, vi } from "vitest";
import {
  claimedJobSchema,
  discoverySchema,
  settingsSchema,
} from "../../src/lib/agents/contracts";
import { operatorAllowed } from "../../src/lib/operator-access";
import { prepare } from "../../src/lib/agents/prepare";
import { discover, candidatesCsv } from "../../src/lib/agents/explee";
const input = {
  job: {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    lead_id: "33333333-3333-4333-8333-333333333333",
    kind: "outreach_draft",
    lease_token: "44444444-4444-4444-8444-444444444444",
    input: {},
    reserved_credits: 0,
  },
  business: {
    name: "Example Clean",
    industry: "cleaning",
    location: "Erie",
    website: null,
  },
  review: { revision: 1, suggested_offer: "Digital Foundation" },
  points: [
    {
      pillar: "Digital Presence",
      observation: "The service page links to the contact page.",
      recommendation: "Discuss a service-specific inquiry path.",
      source_url: "https://example.test/services",
      confidence: "high",
      verification_status: "verified",
    },
  ],
  settings: {
    paused: false,
    daily_job_limit: 10,
    explee_daily_credit_limit: 0,
    sender_name: "Operator",
    sender_email: "hello@example.test",
    postal_address: "123 Example Street",
  },
};
describe("preparation contracts", () => {
  it("includes only recorded verified evidence and required identity", () => {
    const job = claimedJobSchema.parse(input);
    const result = prepare(job);
    expect(result).toHaveProperty("email_draft");
    expect(JSON.stringify(result)).toContain(input.points[0].observation);
    expect(JSON.stringify(result)).toContain("123 Example Street");
    expect(JSON.stringify(result)).not.toMatch(
      /confirmed budget|conversion rate|revenue grew/i,
    );
  });
  it("rejects unverified points at the worker boundary", () => {
    expect(() =>
      claimedJobSchema.parse({
        ...input,
        points: [{ ...input.points[0], verification_status: "unverified" }],
      }),
    ).toThrow();
  });
  it("requires evidence for outreach", () => {
    expect(() =>
      prepare(claimedJobSchema.parse({ ...input, points: [] })),
    ).toThrow("Verified evidence");
  });
  it("requires sender identity", () => {
    expect(() =>
      prepare(
        claimedJobSchema.parse({
          ...input,
          settings: { ...input.settings, postal_address: "" },
        }),
      ),
    ).toThrow("Configure sender");
  });
  it("research planning creates no invented findings or score", () => {
    const result = prepare(
      claimedJobSchema.parse({
        ...input,
        job: { ...input.job, kind: "research_plan" },
        points: [],
      }),
    );
    expect(result).toHaveProperty("tasks");
    expect(JSON.stringify(result)).toContain("Research required");
    expect(result).not.toHaveProperty("email_draft");
  });
  it("caps jobs and credits", () => {
    expect(
      settingsSchema.safeParse({ ...input.settings, daily_job_limit: 26 })
        .success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({
        ...input.settings,
        explee_daily_credit_limit: 51,
      }).success,
    ).toBe(false);
  });
  it("caps discovery to ten companies", () => {
    expect(
      discoverySchema.safeParse({
        industry: "Cleaning",
        city: "Erie",
        count: 11,
      }).success,
    ).toBe(false);
  });
});
describe("Explee company search", () => {
  const query = { industry: "Commercial cleaning", city: "Erie", count: 2 };
  it("does not call a provider without credentials or reserved allowance", async () => {
    const transport = vi.fn();
    await expect(discover(query, "", 1, transport)).rejects.toThrow(
      "not configured",
    );
    await expect(discover(query, "test", 0, transport)).rejects.toThrow(
      "Insufficient",
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it("uses only fixed company search, bounded page size and no enrichment", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            companies: [
              {
                name: "Example Clean",
                url: "https://example.test",
                geo_city: "Erie",
                revenue_annual: 10000000,
              },
            ],
            meta: { credits_charged: 1, results_count: 1 },
          }),
        ),
      );
    const result = await discover(query, "test", 1, transport);
    expect(transport).toHaveBeenCalledOnce();
    const [url, request] = transport.mock.calls[0];
    expect(url).toBe("https://api.explee.com/public/api/v1/search/companies");
    expect(JSON.parse(request.body)).toEqual({
      filters: {
        definition: "Commercial cleaning",
        geo_include: ["US"],
        geo_city: ["Erie"],
        min_relevance: 0.7,
      },
      page: 1,
      page_size: 2,
    });
    expect(result.companies[0]).not.toHaveProperty("revenue_annual");
    expect(result.companies[0].audit_hypothesis_not_verified).toContain(
      "no digital weakness or budget",
    );
  });
  it("never retries ambiguous provider errors", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response("provider private payload", { status: 429 }),
      );
    await expect(discover(query, "test", 1, transport)).rejects.toThrow(
      "not automatically retried",
    );
    expect(transport).toHaveBeenCalledOnce();
  });
  it("reports unexpected credit charges for fail-closed pause", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            companies: [],
            meta: { credits_charged: 2, results_count: 0 },
          }),
        ),
      );
    expect(
      (await discover(query, "test", 1, transport)).allowance_exceeded,
    ).toBe(true);
  });
  it("quotes CSV values without executing supplied text", () => {
    const csv = candidatesCsv([
      { business_name: 'A, "B"', industry: "Cleaning", location: "Erie" },
    ]);
    expect(csv).toContain('"A, ""B"""');
  });
});

describe("hosted operator access", () => {
  it("fails closed with no production allowlist", () =>
    expect(operatorAllowed("owner@example.test", undefined, true)).toBe(false));
  it("matches exact emails without substring escalation", () => {
    expect(
      operatorAllowed("OWNER@example.test", " owner@example.test ", true),
    ).toBe(true);
    expect(
      operatorAllowed("other@example.test", "owner@example.test", true),
    ).toBe(false);
    expect(
      operatorAllowed("evilowner@example.test", "owner@example.test", true),
    ).toBe(false);
  });
  it("keeps local signup available", () =>
    expect(operatorAllowed(undefined, undefined, false)).toBe(true));
});
