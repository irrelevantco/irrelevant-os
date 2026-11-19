export const IMPORT_FIELDS = [
  "business_name",
  "location",
  "industry",
  "public_phone",
  "website",
  "research_priority",
  "audit_hypothesis_not_verified",
  "source_type",
  "source_url",
  "source_timestamp",
  "contact_email",
  "decision_maker",
  "notes",
  "verified_digital_issue",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Partial<Record<ImportField, string>>;
