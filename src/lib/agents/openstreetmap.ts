import { z } from "zod";
import { FREE_CATEGORIES, freeDiscoverySchema } from "./discovery-options";
export const OSM_ENDPOINT = "https://ovp.dresel.systems/api-na/interpreter";
const responseSchema = z.object({
  remark: z.string().optional(),
  elements: z
    .array(
      z.object({
        type: z.enum(["node", "way", "relation"]),
        id: z.number().int().positive().safe(),
        tags: z.record(z.string(), z.string()).default({}),
      }),
    )
    .max(50),
});
export function buildOverpassQuery(input: unknown, scanCount?: number) {
  const query = freeDiscoverySchema.parse(input);
  const key = ["cafe", "restaurant"].includes(query.category)
    ? "amenity"
    : ["bakery", "hairdresser", "beauty"].includes(query.category)
      ? "shop"
      : "craft";
  const escaped = query.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = `^((City|Town|Village|Borough|Township) of )?${escaped}( Township| Borough)?$`;
  return `[out:json][timeout:20][maxsize:33554432];\narea["ISO3166-2"=${JSON.stringify(`US-${query.state}`)}]->.state;\nrel(area.state)["boundary"="administrative"]["admin_level"~"^[789]$"]["name"~${JSON.stringify(names)},i];\nmap_to_area->.city;\nnwr(area.city)[${JSON.stringify(key)}=${JSON.stringify(query.category)}]["name"];\nout tags ${scanCount ?? query.count};`;
}
function publicWebsite(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    if (
      /(^|\.)(facebook\.com|instagram\.com|linkedin\.com|linktr\.ee|booksy\.com|vagaro\.com|fresha\.com)$/.test(
        url.hostname,
      )
    )
      return "";
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.href.length <= 2048
      ? url.href
      : "";
  } catch {
    return "";
  }
}
async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("OpenStreetMap returned an empty response.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1048576) {
        await reader.cancel();
        throw new Error("OpenStreetMap response exceeded the allowed size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function discoverOpenStreetMap(
  input: unknown,
  transport: typeof fetch = fetch,
  seenSources: readonly string[] = [],
) {
  const query = freeDiscoverySchema.parse(input);
  const response = await transport(OSM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "iRRELEVANT-OS/0.3.1 (+https://github.com/irrelevantco/irrelevant-os)",
    },
    body: new URLSearchParams({
      data: buildOverpassQuery(query, seenSources.length ? 50 : query.count),
    }).toString(),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  }).catch(() => {
    throw new Error(
      "OpenStreetMap could not be reached within the request deadline. Nothing was imported. Try later, use CSV Imports, or prepare research for your existing prospects; no API key is required for preparation.",
    );
  });
  if (!response.ok)
    throw new Error(
      `OpenStreetMap search is unavailable (${response.status}). It was not retried. Your existing prospects and CSV Imports are still available.`,
    );
  const result = responseSchema.parse(await boundedJson(response));
  if (result.remark)
    throw new Error(
      "OpenStreetMap could not complete this search. No partial results were imported; try later or use CSV.",
    );
  const seen = new Set<string>();
  const previous = new Set(seenSources);
  const companies = result.elements
    .filter((element) => {
      const key = `${element.type}/${element.id}`;
      if (
        seen.has(key) ||
        previous.has(`https://www.openstreetmap.org/${key}`) ||
        !element.tags.name?.trim()
      )
        return false;
      seen.add(key);
      return true;
    })
    .slice(0, query.count)
    .map((element) => {
      const t = element.tags;
      const source = `https://www.openstreetmap.org/${element.type}/${element.id}`;
      const email = t["contact:email"] ?? t.email ?? "";
      const phone = t["contact:phone"] ?? t.phone ?? "";
      return {
        business_name: t.name,
        industry: FREE_CATEGORIES[query.category],
        location: `${query.city}, ${query.state}`,
        website: publicWebsite(t["contact:website"] ?? t.website),
        contact_email: z.email().max(254).safeParse(email).success ? email : "",
        public_phone: phone.length <= 40 ? phone : "",
        source_type: `OpenStreetMap contributors; ODbL 1.0; ${source}`,
        source_url: source,
        source_timestamp: new Date().toISOString(),
        notes: publicWebsite(t["contact:website"] ?? t.website)
          ? ""
          : `Listed website / profile, not independently verified: ${(t["contact:website"] ?? t.website ?? "").slice(0, 1500)}`,
        research_priority: "C",
        audit_hypothesis_not_verified:
          "Public map listing only. Verify the business, contacts, service fit and digital presence; no weakness or budget is confirmed.",
      };
    });
  return {
    provider: "osm",
    companies,
    credits_charged: 0,
    allowance_exceeded: false,
    source_url: "https://www.openstreetmap.org/copyright",
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    observed_at: new Date().toISOString(),
    warning: companies.length
      ? "Public map listings are unverified candidates. Check current operation and public business contacts, then preview the import. Coverage varies; no audit finding, budget or decision-maker access is confirmed."
      : "No new matching mapped businesses were returned for this municipality and trade. Coverage is incomplete; this does not mean no businesses exist. Use your current prospect list, CSV import or a manual public-source search.",
  };
}
