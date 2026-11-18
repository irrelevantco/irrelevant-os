import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types";
import { candidatesCsv } from "./explee";
import { autoMapping, parseCsv, previewRows } from "../imports/csv";
export async function stageDiscovery(
  db: SupabaseClient<Database>,
  org: string,
  job: string,
  provider: "osm" | "explee",
  companies: unknown,
) {
  const candidates = z
    .array(z.record(z.string(), z.string()))
    .min(1)
    .max(10)
    .parse(companies);
  const parsed = parseCsv(candidatesCsv(candidates)),
    mapping = autoMapping(parsed.headers);
  const response = await db.rpc("preview_prospect_import", {
    org,
    batch_label:
      provider === "osm"
        ? "OpenStreetMap discovery candidates"
        : "Explee discovery candidates",
    file_name: `${provider}-${job}.csv`,
    file_fingerprint: createHash("sha256")
      .update(`${provider}-v1:${job}`)
      .digest("hex"),
    field_mapping: mapping,
    rows: previewRows(parsed.records, mapping) as unknown as Json,
  });
  if (response.error)
    throw Error(
      "Candidates were saved in job history, but their import preview could not be staged. Use Preview candidates to retry without another provider request.",
    );
  return response.data;
}
