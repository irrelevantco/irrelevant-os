import { z } from "zod";
type Kind = "text" | "email" | "url" | "date" | "time" | "number";
export type Column = {
  key: string;
  required?: boolean;
  kind?: Kind;
  aliases?: string[];
};
const fields = (keys: string[]) =>
  keys.map((key) => ({
    key,
    kind: (key.includes("email")
      ? "email"
      : key.includes("date") || key.includes("period")
        ? "date"
        : key.endsWith("_url")
          ? "url"
          : "text") as Kind,
  }));
export const PROFILES = {
  prospects: {
    label: "Prospects → CRM import",
    required: ["business_name", "location", "industry"],
    unique: ["business_name", "location"],
    columns: fields([
      "business_name",
      "location",
      "industry",
      "public_phone",
      "website",
      "contact_email",
      "research_priority",
      "audit_hypothesis_not_verified",
      "source_type",
    ]),
  },
  employees: {
    label: "Employee directory",
    required: ["employee_id", "full_name"],
    unique: ["employee_id"],
    columns: fields([
      "employee_id",
      "full_name",
      "department",
      "job_title",
      "email",
      "phone",
      "hire_date",
      "status",
    ]),
  },
  payroll: {
    label: "Payroll summaries — conversion only",
    required: ["employee_id", "pay_period_end"],
    unique: ["employee_id", "pay_period_end"],
    columns: [
      ...fields(["employee_id", "pay_period_start", "pay_period_end"]),
      ...["hours", "hourly_rate", "gross_pay", "net_pay"].map((key) => ({
        key,
        kind: "number" as Kind,
      })),
      ...fields(["currency"]),
    ],
  },
  applicants: {
    label: "Applicants / resume index",
    required: ["applicant_id", "full_name"],
    unique: ["applicant_id"],
    columns: fields([
      "applicant_id",
      "full_name",
      "email",
      "phone",
      "applied_date",
      "role",
      "resume_url",
      "status",
    ]),
  },
  schedules: {
    label: "Shift schedules",
    required: [
      "shift_id",
      "employee_id",
      "work_date",
      "start_time",
      "end_time",
    ],
    unique: ["shift_id"],
    columns: [
      ...fields(["shift_id", "employee_id", "work_date"]),
      { key: "start_time", kind: "time" as Kind },
      { key: "end_time", kind: "time" as Kind },
      ...fields(["location", "department"]),
    ],
  },
  production: {
    label: "Production / work orders",
    required: ["work_order_id", "operation"],
    unique: ["work_order_id", "operation"],
    columns: [
      ...fields(["work_order_id", "operation", "product"]),
      { key: "quantity", kind: "number" as Kind },
      ...fields(["unit", "due_date", "status"]),
    ],
  },
  custom: {
    label: "Custom — preserve source columns",
    required: [],
    unique: [],
    columns: [] as Column[],
  },
} as const;
export type Profile = keyof typeof PROFILES;
export const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const ALIASES: Record<string, string[]> = {
  business_name: ["company", "business", "companyname"],
  location: ["city", "businesslocation"],
  industry: ["sector", "category"],
  contact_email: ["email", "publicemail"],
  public_phone: ["phone", "telephone"],
  employee_id: [
    "employeenumber",
    "employeeno",
    "associateid",
    "personnumber",
    "workerid",
    "file number",
    "badgeid",
  ],
  full_name: ["name", "employeename", "applicantname"],
  department: ["dept", "departmentname"],
  job_title: ["title", "position"],
  pay_period_end: ["periodend", "payperiodending"],
  pay_period_start: ["periodstart"],
  gross_pay: ["gross", "grosswages"],
  net_pay: ["net", "takehomepay"],
  hours: ["regularhours", "totalhours"],
  hourly_rate: ["rate", "payrate"],
  work_date: ["date", "shiftdate"],
  work_order_id: ["workorder", "jobid", "productionorder"],
  operation: ["step", "process"],
  quantity: ["qty"],
  resume_url: ["resumelink", "resume"],
  applicant_id: ["candidateid"],
  start_time: ["start", "shiftstart"],
  end_time: ["end", "shiftend"],
};
export function defaultMapping(profile: Profile, headers: string[]) {
  const columns =
    profile === "custom"
      ? headers.map((key) => ({ key }))
      : PROFILES[profile].columns;
  const used = new Set<string>();
  return Object.fromEntries(
    columns.map((column) => {
      const aliases = [
        column.key,
        ...(Object.hasOwn(ALIASES, column.key) ? ALIASES[column.key] : []),
      ].map(normalizeHeader);
      const header = headers.find(
        (h) => !used.has(h) && aliases.includes(normalizeHeader(h)),
      );
      if (header) used.add(header);
      return [column.key, header ?? ""];
    }),
  );
}
function isoDate(value: string, format: string) {
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) value = value.slice(0, 10);
  if (format !== "ISO" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (!match) throw Error("Use the selected source date format.");
    value = `${match[3]}-${(format === "MDY" ? match[1] : match[2]).padStart(2, "0")}-${(format === "MDY" ? match[2] : match[1]).padStart(2, "0")}`;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw Error("Invalid or ambiguous date.");
  return value;
}
export function convertRows(
  profile: Profile,
  headers: string[],
  rows: {
    rowNumber: number;
    values: Record<string, string>;
    extraColumns: boolean;
  }[],
  mapping: Record<string, string>,
  dateFormat: string,
) {
  const spec = PROFILES[profile];
  const columns: readonly Column[] =
    profile === "custom" ? headers.map((key) => ({ key })) : spec.columns;
  const results: {
    rowNumber: number;
    record: Record<string, string>;
    errors: string[];
  }[] = [];
  const seen = new Set<string>();
  const selected = Object.values(mapping).filter(Boolean);
  const mappingErrors: string[] = [];
  if (new Set(selected).size !== selected.length)
    mappingErrors.push("Each source column may only be mapped once.");
  for (const required of spec.required)
    if (!mapping[required]) mappingErrors.push(`Map ${required}.`);
  for (const source of selected)
    if (!headers.includes(source))
      mappingErrors.push("A mapped source column is missing.");
  for (const row of rows) {
    const record: Record<string, string> = Object.create(null);
    const errors = [...mappingErrors];
    if (row.extraColumns)
      errors.push("This row has values beyond the selected headers.");
    for (const column of columns) {
      const original = row.values[mapping[column.key]] ?? "";
      let value = profile === "custom" ? original : original.trim();
      try {
        if (!value && (spec.required as readonly string[]).includes(column.key))
          throw Error("Required value is missing.");
        if (value && column.kind === "email") z.email().parse(value);
        if (value && (column.kind === "url" || column.key === "website")) {
          const url = new URL(value);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw Error("Use a public HTTP(S) URL.");
        }
        if (value && column.kind === "date") value = isoDate(value, dateFormat);
        if (value && column.kind === "time") {
          if (/^1899-12-\d{2}T/.test(value)) value = value.slice(11, 19);
          if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value))
            throw Error("Use a 24-hour time.");
        }
        if (value && column.kind === "number") {
          if (
            value.includes(",") &&
            !/^-?\$?\d{1,3}(,\d{3})+(\.\d{1,6})?$/.test(value)
          )
            throw Error(
              "Ambiguous number grouping; use a period decimal and comma thousands.",
            );
          value = value.replace("$", "").replaceAll(",", "");
          if (
            !/^-?\d+(\.\d{1,6})?$/.test(value) ||
            !Number.isFinite(Number(value))
          )
            throw Error(
              "Use a numeric value; no formulas or inferred amounts.",
            );
        }
        if (
          profile === "prospects" &&
          column.key === "research_priority" &&
          value &&
          !["A", "B", "C"].includes(value)
        )
          throw Error("Use A, B or C.");
      } catch (error) {
        errors.push(
          `${column.key}: ${error instanceof Error && !(error instanceof z.ZodError) ? error.message : "Invalid value."}`,
        );
      }
      record[column.key] = value;
    }
    const key = (spec.unique as readonly string[])
      .map((key) => record[key]?.normalize("NFKC").toLowerCase())
      .join("|");
    if (spec.unique.length && key.replaceAll("|", "")) {
      if (seen.has(key))
        errors.push(
          "Duplicate record identity in this file; review instead of merging automatically.",
        );
      seen.add(key);
    }
    results.push({ rowNumber: row.rowNumber, record, errors });
  }
  return {
    columns: columns.map((column) => column.key),
    rows: results,
    unmapped: headers.filter((header) => !selected.includes(header)),
    mappingErrors,
  };
}
