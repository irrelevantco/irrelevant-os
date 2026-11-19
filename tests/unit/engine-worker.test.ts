import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ research: vi.fn(), enhance: vi.fn() }));
vi.mock("../../src/lib/engine/research", () => ({
  researchBusiness: mocks.research,
}));
vi.mock("../../src/lib/engine/ai", () => ({ enhanceResearch: mocks.enhance }));
import { runNext } from "../../src/lib/agents/worker";
const org = "22222222-2222-4222-8222-222222222222",
  lease = "44444444-4444-4444-8444-444444444444";
const context = {
  job: {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: org,
    lead_id: "33333333-3333-4333-8333-333333333333",
    kind: "research_audit",
    lease_token: lease,
    input: { ai_provider: "openai", ai_model: "explicit-test" },
    reserved_credits: 0,
  },
  business: {
    name: "Synthetic research",
    industry: "Cleaning",
    location: "Test Town",
    website: "https://example.org",
  },
  review: { revision: 0, suggested_offer: "" },
  points: [],
  settings: {
    paused: false,
    daily_job_limit: 25,
    explee_daily_credit_limit: 0,
    sender_name: "",
    sender_email: "",
    postal_address: "",
  },
};
function database(paused: boolean, status = "running") {
  const rpc = vi.fn(async (name: string, payload?: unknown) => ({
    data: name === "claim_agent_job" ? context : payload,
    error: null,
  }));
  return {
    rpc,
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          error: null,
          data:
            table === "agent_settings"
              ? { paused }
              : {
                  status,
                  lease_token: lease,
                  lease_until: new Date(Date.now() + 60000).toISOString(),
                },
        }),
      };
      return chain;
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.research.mockResolvedValue({ provider: "public-web-v1", points: [] });
  mocks.enhance.mockResolvedValue({ provider: "synthetic-model", points: [] });
});
describe("research cancellation before optional model spending", () => {
  it.each([
    [true, "running"],
    [false, "cancelled"],
  ])(
    "holds model requests after pause=%s / status=%s",
    async (paused, status) => {
      const db = database(paused, status);
      await runNext(db as unknown as Parameters<typeof runNext>[0], org);
      expect(mocks.research).toHaveBeenCalledOnce();
      expect(mocks.enhance).not.toHaveBeenCalled();
      expect(db.rpc).toHaveBeenLastCalledWith(
        "finish_agent_job",
        expect.objectContaining({
          failure: expect.stringContaining("no model request was made"),
        }),
      );
    },
  );
  it("allows model preparation only for the current running lease and resumed controls", async () => {
    const db = database(false);
    await runNext(db as unknown as Parameters<typeof runNext>[0], org);
    expect(mocks.enhance).toHaveBeenCalledOnce();
    expect(db.rpc).toHaveBeenLastCalledWith(
      "finish_agent_job",
      expect.objectContaining({
        output: { provider: "synthetic-model", points: [] },
      }),
    );
  });
});
