import { parse } from "csv-parse/sync";
import { z } from "zod";
import { emailSchema, urlSchema } from "../domain";
import { IMPORT_FIELDS, type ImportField, type Mapping } from "./fields";
export { IMPORT_FIELDS, type ImportField, type Mapping } from "./fields";
export const mappingSchema = z
  .partialRecord(z.enum(IMPORT_FIELDS), z.string().max(160))
  .refine(
    (m) =>
      ["business_name", "location", "industry"].every(
        (k) => m[k as ImportField],
      ),
    "Map business name, location and industry.",
  )
  .refine(
    (m) =>
      new Set(Object.values(m).filter(Boolean)).size ===
      Object.values(m).filter(Boolean).length,
    "Each source column can only be mapped once.",
  );
export const importRowSchema = z.object({
  business_name: z.string().trim().min(2).max(160),
  location: z.string().trim().min(2).max(160),
  industry: z.string().trim().min(2).max(100),
  public_phone: z.string().trim().max(40),
  website: urlSchema,
  contact_email: emailSchema,
  research_priority: z.enum(["", "A", "B", "C"]),
  audit_hypothesis_not_verified: z.string().trim().max(2000),
  source_type: z.string().trim().max(160),
  source_url: urlSchema.default(""),
  source_timestamp: z
    .union([z.iso.datetime({ offset: true }), z.literal("")])
    .default(""),
  decision_maker: z.string().trim().max(160),
  notes: z.string().trim().max(2000),
  verified_digital_issue: z.string().trim().max(2000),
});
export type ImportPayload = z.output<typeof importRowSchema>;
export type CsvRow = {
  row_number: number;
  raw: Record<string, string>;
  payload: ImportPayload | null;
  errors: string[];
};
export function normalizeName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
export function websiteDomain(value: string | null) {
  if (!value) return "";
  try {
    return new URL(value).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.$/, "");
  } catch {
    return "";
  }
}
export function duplicateKeys(row: {
  business_name: string;
  location: string;
  website: string | null;
}) {
  const domain = websiteDomain(row.website);
  return [
    `name:${normalizeName(row.business_name)}|${normalizeName(row.location)}`,
    ...(domain ? [`domain:${domain}`] : []),
  ];
}
export function parseCsv(text: string): {
  headers: string[];
  records: Record<string, string>[];
} {
  if (Buffer.byteLength(text, "utf8") > 1024 * 1024)
    throw new Error("CSV must be at most 1 MB.");
  const rows = parse(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    max_record_size: 24000,
  }) as string[][];
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  if (
    !headers.length ||
    headers.some((h) => !h || h === "__csv_error") ||
    new Set(headers).size !== headers.length ||
    headers.length > 40
  )
    throw new Error(
      "CSV headers must be unique, nonempty, and limited to 40 columns.",
    );
  if (rows.length > 2000 || !rows.length)
    throw new Error("Import between 1 and 2,000 rows per batch.");
  return {
    headers,
    records: rows.map((row) =>
      Object.fromEntries([
        ...headers.map((h, i) => [h, row[i] ?? ""]),
        ...(row.length !== headers.length
          ? [["__csv_error", "Column count does not match the header."]]
          : []),
      ]),
    ),
  };
}
export function previewRows(
  records: Record<string, string>[],
  mapping: Mapping,
): CsvRow[] {
  const mapped = mappingSchema.parse(mapping);
  return records.map((raw, index) => {
    const values = Object.fromEntries(
      IMPORT_FIELDS.map((field) => [
        field,
        mapped[field] ? (raw[mapped[field]!] ?? "") : "",
      ]),
    );
    const parsed = importRowSchema.safeParse(values);
    const errors = parsed.success
      ? []
      : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    if (raw.__csv_error) errors.push(raw.__csv_error);
    return {
      row_number: index + 2,
      raw,
      payload: errors.length || !parsed.success ? null : parsed.data,
      errors,
    };
  });
}
export function autoMapping(headers: string[]): Mapping {
  return Object.fromEntries(
    IMPORT_FIELDS.filter((f) => headers.includes(f)).map((f) => [f, f]),
  );
}
