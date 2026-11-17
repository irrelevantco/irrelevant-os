// One bounded public city/trade lookup during the manually requested Windows release.
// No organization, contact, employee or payroll information is sent or imported.
import { discoverOpenStreetMap } from "../src/lib/agents/openstreetmap";
import { writeFileSync } from "node:fs";
try {
  const result = await discoverOpenStreetMap({
    provider: "osm",
    category: "plumber",
    city: "Erie",
    state: "PA",
    count: 5,
  });
  const summary = {
    connected: true,
    provider: result.provider,
    candidates: result.companies.length,
    credits_charged: result.credits_charged,
    observed_at: result.observed_at,
  };
  writeFileSync(
    "work/free-discovery-check.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary));
  process.exit(0);
} catch (error) {
  const summary = {
    connected: false,
    message:
      error instanceof Error
        ? error.message
        : "Provider check did not complete.",
  };
  writeFileSync(
    "work/free-discovery-check.json",
    JSON.stringify(summary, null, 2),
  );
  console.error(JSON.stringify(summary));
  process.exit(1);
}
