import { z } from "zod";
import { discoverySchema } from "./contracts";
// Transport is injectable for contract tests. Only this fixed company-search endpoint is permitted.
const company = z.object({
  name: z.string().max(160).nullish(),
  url: z.string().nullish(),
  geo_city: z.string().nullish(),
  geo_subdivision: z.string().nullish(),
  geo: z.string().nullish(),
  emails: z.array(z.string()).nullish(),
  phones: z.array(z.string()).nullish(),
});
const responseSchema = z.object({
  success: z.boolean().optional(),
  companies: z.array(company).max(10),
  meta: z.object({
    credits_charged: z.number().nonnegative(),
    results_count: z.number().int().nonnegative(),
  }),
});
export async function discover(
  input: unknown,
  key: string,
  reservedCredits: number,
  transport: typeof fetch = fetch,
) {
  const query = discoverySchema.parse(input);
  if (!key)
    throw new Error(
      "Explee API key is not configured. CSV import remains available.",
    );
  if (reservedCredits < query.count * 0.5)
    throw new Error("Insufficient reserved Explee credits.");
  const response = await transport(
    "https://api.explee.com/public/api/v1/search/companies",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify({
        filters: {
          definition: query.industry,
          geo_include: ["US"],
          geo_city: [query.city],
          min_relevance: 0.7,
        },
        page: 1,
        page_size: query.count,
      }),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new Error(
      `Explee request failed (${response.status}); not automatically retried. Check provider billing before requesting again.`,
    );
  const text = await response.text();
  if (text.length > 500000)
    throw new Error(
      "Explee response exceeds the allowed size; inspect provider usage.",
    );
  const data = responseSchema.parse(JSON.parse(text));
  if (data.success === false)
    throw new Error("Explee rejected this search; inspect provider usage.");
  const companies = data.companies.slice(0, query.count).map((c) => ({
    business_name: c.name ?? "",
    industry: query.industry,
    location:
      [c.geo_city, c.geo_subdivision, c.geo].filter(Boolean).join(", ") ||
      query.city,
    website: c.url ?? "",
    contact_email: c.emails?.[0] ?? "",
    public_phone: c.phones?.[0] ?? "",
    source_type: "Explee company search API — provider-supplied, unverified",
    research_priority: "C",
    audit_hypothesis_not_verified:
      "Research required; no digital weakness or budget has been verified.",
  }));
  return {
    provider: "explee",
    companies,
    credits_charged: data.meta.credits_charged,
    allowance_exceeded: data.meta.credits_charged > reservedCredits,
    warning:
      "Provider-supplied candidates, not qualified leads. Verify permitted use and contacts. No performance, revenue or budget estimates were imported. Review in CSV Imports before adding leads.",
    source_url: "https://api.explee.com/public/api/docs",
    observed_at: new Date().toISOString(),
  };
}
export function candidatesCsv(companies: Record<string, string>[]) {
  const headers = [
    "business_name",
    "industry",
    "location",
    "website",
    "contact_email",
    "public_phone",
    "source_type",
    "research_priority",
    "audit_hypothesis_not_verified",
  ];
  const cell = (v: string) => `"${v.replaceAll('"', '""')}"`;
  return [
    headers.map(cell).join(","),
    ...companies.map((c) => headers.map((h) => cell(c[h] ?? "")).join(",")),
  ].join("\r\n");
}
