import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { enhanceResearch, paidResearchBudget } from "../../src/lib/engine/ai";
import {
  researchReview,
  type ResearchPage,
} from "../../src/lib/engine/research";
const page: ResearchPage = {
  url: "https://example.org/",
  title: "Public company",
  description: "Services",
  excerpt: "Public service description",
  links: [],
  formCount: 0,
  noAI: false,
  noFollow: false,
  observed_at: "2026-11-18T15:00:00Z",
  content_hash: "synthetic",
};
const research = {
  provider: "public-web-v1",
  public_contacts: [],
  title: "Research",
  pages: [page],
  points: researchReview([page]),
  suggested_offer: "Discuss scope",
  warning: "Unverified",
};
afterEach(() => vi.unstubAllEnvs());
describe("optional model boundaries", () => {
  it("free research makes no model requests", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await enhanceResearch(
      research,
      { ai_provider: "rules" },
      fetcher,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.points).toEqual(research.points);
  });
  it("honors no-AI source directives", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await enhanceResearch(
      { ...research, pages: [{ ...page, noAI: true }] },
      { ai_provider: "ollama", ai_model: "installed-test" },
      fetcher,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.warning).toContain("skipped");
  });
  it("refuses paid calls without prices, caps or sufficient allowance", async () => {
    expect(() => paidResearchBudget("text", {})).toThrow(/pricing/);
    expect(() =>
      paidResearchBudget("x".repeat(10000), {
        AI_INPUT_USD_PER_MILLION: "10",
        AI_OUTPUT_USD_PER_MILLION: "10",
        AI_MAX_CALL_USD: "0.001",
      }),
    ).toThrow(/allowance/);
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      enhanceResearch(
        research,
        { ai_provider: "openai", ai_model: "explicit-test-model" },
        fetcher,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("local model advice cannot change captured observations or verification", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-not-a-real-key");
    const advice = {
      digital_recommendation: "Review the public page with the owner.",
      social_recommendation: "Manually verify current profiles.",
      growth_recommendation: "Discuss the inquiry path.",
      executive_summary: "Research only.",
      suggested_offer: "Discuss scope after verification.",
    };
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("http://127.0.0.1:11434/v1/chat/completions");
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      return new Response(
        JSON.stringify({
          id: "synthetic",
          object: "chat.completion",
          created: 1,
          model: "installed-test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: JSON.stringify(advice) },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    const result = await enhanceResearch(
      research,
      { ai_provider: "ollama", ai_model: "installed-test" },
      fetcher,
    );
    expect(result.points.map((p) => p.observation)).toEqual(
      research.points.map((p) => p.observation),
    );
    expect(
      result.points.every((p) => p.verification_status === "unverified"),
    ).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
