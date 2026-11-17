import { describe, it, expect, vi } from "vitest";
import {
  discoverOpenStreetMap,
  buildOverpassQuery,
  OSM_ENDPOINT,
} from "../../src/lib/agents/openstreetmap";
const query = {
  provider: "osm",
  category: "plumber",
  city: "Erie",
  state: "PA",
  count: 5,
};
describe("free OpenStreetMap discovery", () => {
  it("builds a bounded city/state query from a fixed category", () => {
    const text = buildOverpassQuery(query);
    expect(text).toContain("US-PA");
    expect(text).toContain('["craft"="plumber"]');
    expect(text).toContain("out tags 5");
    expect(() =>
      buildOverpassQuery({ ...query, city: 'Erie"];out;' }),
    ).toThrow();
    expect(() => buildOverpassQuery({ ...query, count: 11 })).toThrow();
  });
  it("uses a fixed endpoint with no credential and preserves source attribution", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          elements: [
            {
              type: "node",
              id: 123,
              tags: {
                name: "Synthetic Plumbing",
                "contact:website": "example.test",
                "contact:email": "hello@example.test",
                private_budget: "100000",
              },
            },
          ],
        }),
      ),
    );
    const result = await discoverOpenStreetMap(query, transport);
    expect(transport.mock.calls[0][0]).toBe(OSM_ENDPOINT);
    expect(transport.mock.calls[0][1].headers).not.toHaveProperty("X-API-Key");
    expect(result.credits_charged).toBe(0);
    expect(result.companies[0].source_type).toContain(
      "https://www.openstreetmap.org/node/123",
    );
    expect(result.companies[0]).not.toHaveProperty("private_budget");
    expect(result.companies[0].audit_hypothesis_not_verified).toContain(
      "no weakness or budget",
    );
  });
  it("deduplicates source IDs and excludes nameless listings", async () => {
    const record = {
      type: "way",
      id: 123,
      tags: { name: "Synthetic Business" },
    };
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          elements: [record, record, { type: "node", id: 55, tags: {} }],
        }),
      ),
    );
    expect(
      (await discoverOpenStreetMap(query, transport)).companies,
    ).toHaveLength(1);
  });
  it("returns an honest empty result without creating fictional businesses", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response('{"elements":[]}'));
    const result = await discoverOpenStreetMap(query, transport);
    expect(result.companies).toEqual([]);
    expect(result.warning).toContain("does not mean no businesses exist");
  });
  it("reports a connection failure with a usable fallback and no retries", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("fetch failed"));
    await expect(discoverOpenStreetMap(query, transport)).rejects.toThrow(
      "Nothing was imported",
    );
    expect(transport).toHaveBeenCalledOnce();
  });
  it("does not retry rate limits or accept partial server results", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response("no", { status: 429 }));
    await expect(discoverOpenStreetMap(query, transport)).rejects.toThrow(
      "not retried",
    );
    expect(transport).toHaveBeenCalledOnce();
    const partial = vi
      .fn()
      .mockResolvedValue(
        new Response('{"remark":"runtime error","elements":[]}'),
      );
    await expect(discoverOpenStreetMap(query, partial)).rejects.toThrow(
      "partial",
    );
  });
});
