"use client";
import { useActionState, useMemo, useState } from "react";
import {
  FILE_LIMIT,
  readSpreadsheet,
  sheetTable,
  csvText,
  xlsxExport,
  type WorkbookData,
} from "@/lib/converter/spreadsheet";
import {
  PROFILES,
  defaultMapping,
  convertRows,
  type Profile,
} from "@/lib/converter/profiles";
import { previewImport } from "@/app/prospect-actions";
import { Field, Submit } from "@/components/forms";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ConverterWorkspace() {
  const [book, setBook] = useState<WorkbookData | null>(null),
    [filename, setFilename] = useState(""),
    [profile, setProfile] = useState<Profile>("prospects"),
    [sheetIndex, setSheetIndex] = useState(0),
    [headerRow, setHeaderRow] = useState(1),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [dateFormat, setDateFormat] = useState("ISO"),
    [approved, setApproved] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [state, importAction] = useActionState(previewImport, {});
  const table = useMemo(() => {
    if (!book) return null;
    try {
      return {
        data: sheetTable(book.sheets[sheetIndex], headerRow),
        error: "",
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Could not read selected headers.",
      };
    }
  }, [book, sheetIndex, headerRow]);
  const conversion = useMemo(
    () =>
      table?.data
        ? convertRows(
            profile,
            table.data.headers,
            table.data.rows,
            mapping,
            dateFormat,
          )
        : null,
    [table, profile, mapping, dateFormat],
  );
  const valid = conversion?.rows.filter((row) => !row.errors.length) ?? [];
  const invalid = (conversion?.rows.length ?? 0) - valid.length;
  const columns =
    profile === "custom"
      ? (table?.data?.headers ?? [])
      : PROFILES[profile].columns.map((column) => column.key);
  function choose(
    newProfile: Profile,
    index: number,
    header: number,
    currentBook = book,
  ) {
    setProfile(newProfile);
    setSheetIndex(index);
    setHeaderRow(header);
    setApproved(false);
    setError("");
    try {
      if (currentBook)
        setMapping(
          defaultMapping(
            newProfile,
            sheetTable(currentBook.sheets[index], header).headers,
          ),
        );
    } catch {
      setMapping({});
    }
  }
  async function load(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setApproved(false);
    try {
      if (file.size > FILE_LIMIT) throw Error("Choose a file up to 5 MB.");
      const next = await readSpreadsheet(file.name, await file.arrayBuffer());
      if (!next.sheets.length)
        throw Error("The workbook has no readable worksheets.");
      setBook(next);
      setFilename(file.name);
      choose(profile, 0, 1, next);
    } catch (error) {
      setBook(null);
      setError(
        error instanceof Error ? error.message : "Could not parse this file.",
      );
    } finally {
      setBusy(false);
    }
  }
  const canExport = Boolean(
    approved && valid.length && !invalid && !conversion?.mappingErrors.length,
  );
  const records = valid.map((row) => row.record);
  const csv = conversion ? csvText(conversion.columns, records) : "";
  async function exportFile(kind: "csv" | "xlsx" | "json") {
    if (!canExport || !conversion) return;
    setBusy(true);
    try {
      if (kind === "csv")
        download(`converted-${profile}.csv`, csv, "text/csv;charset=utf-8");
      if (kind === "json")
        download(
          `converted-${profile}.json`,
          JSON.stringify(
            {
              profile,
              source_file: filename,
              source_sheet: book?.sheets[sheetIndex].name,
              columns: conversion.columns,
              records,
            },
            null,
            2,
          ),
          "application/json",
        );
      if (kind === "xlsx") {
        const buffer = await xlsxExport(conversion.columns, records);
        download(
          `converted-${profile}.xlsx`,
          new Uint8Array(buffer),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Export did not finish.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-7">
        <p className="mb-5 text-sm leading-7 text-muted-foreground">
          Files are converted in this app window. Employee, payroll, applicant,
          schedule and production contents are not uploaded or saved to the CRM.
          Only the separate, explicitly approved prospect-import action sends
          mapped business records to your organization.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Conversion template">
            <Select
              value={profile}
              onChange={(event) =>
                choose(event.target.value as Profile, sheetIndex, headerRow)
              }
            >
              {Object.entries(PROFILES).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Spreadsheet or CSV file"
            hint="XLSX/CSV, up to 5 MB; 10 sheets, 60 columns, 2,000 rows per sheet. No password-protected or macro workbooks."
          >
            <Input
              type="file"
              accept=".xlsx,.csv"
              onChange={(event) => load(event.target.files?.[0])}
              disabled={busy}
            />
          </Field>
        </div>
        {busy && (
          <p role="status" className="mt-4 text-sm">
            Processing this file…
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        )}
        {book && (
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <Field label="Source sheet">
              <Select
                value={sheetIndex}
                onChange={(event) =>
                  choose(profile, Number(event.target.value), headerRow)
                }
              >
                {book.sheets.map((sheet, index) => (
                  <option key={index} value={index}>
                    {sheet.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Header row">
              <Input
                type="number"
                min={1}
                max={25}
                value={headerRow}
                onChange={(event) =>
                  choose(profile, sheetIndex, Number(event.target.value))
                }
              />
            </Field>
            <Field label="Source date format">
              <Select
                value={dateFormat}
                onChange={(event) => {
                  setDateFormat(event.target.value);
                  setApproved(false);
                }}
              >
                <option value="ISO">YYYY-MM-DD</option>
                <option value="MDY">MM/DD/YYYY</option>
                <option value="DMY">DD/MM/YYYY</option>
              </Select>
            </Field>
          </div>
        )}
        {table?.error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {table.error}
          </p>
        )}
        {profile === "payroll" && (
          <p className="mt-5 text-xs leading-6 text-muted-foreground">
            Payroll summary conversion only: no tax calculations, deductions,
            filings, payments or pay-run approval. Earnings line items may need
            the Custom template. Reconcile totals against the original export
            before transferring systems.
          </p>
        )}
        {profile === "applicants" && (
          <p className="mt-5 text-xs leading-6 text-muted-foreground">
            Converts applicant spreadsheets and resume links. PDF/DOCX resume
            extraction and candidate ranking are not implemented.
          </p>
        )}
      </Card>
      {table?.data && conversion && (
        <>
          <Card className="p-5 sm:p-7">
            <h2 className="text-lg">Map and reconcile</h2>
            <p className="my-4 text-sm text-muted-foreground">
              {conversion.rows.length} source rows · {valid.length} valid ·{" "}
              {invalid} need review. No duplicate is merged automatically.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {columns.map((key) => (
                <Field key={key} label={`Map ${key}`}>
                  <Select
                    value={mapping[key] ?? ""}
                    onChange={(event) => {
                      setMapping({ ...mapping, [key]: event.target.value });
                      setApproved(false);
                    }}
                  >
                    <option value="">Do not map</option>
                    {table.data!.headers.map((header) => (
                      <option key={header}>{header}</option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <p className="mt-5 break-words text-xs leading-6 text-muted-foreground">
              Unmapped source columns ({conversion.unmapped.length}):{" "}
              {conversion.unmapped.join(", ") || "none"}. These stay in your
              original file and are excluded from this export. Custom conversion
              can retain every source column.
            </p>
            {conversion.mappingErrors.map((message) => (
              <p
                key={message}
                role="alert"
                className="mt-2 text-sm text-red-300"
              >
                {message}
              </p>
            ))}
          </Card>
          <Card className="min-w-0 p-5 sm:p-7">
            <h2 className="mb-4 text-lg">Preview / first 20 rows</h2>
            <div className="relative max-h-96 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">Source row</th>
                    {conversion.columns.map((header) => (
                      <th className="p-2" key={header}>
                        {header}
                      </th>
                    ))}
                    <th className="p-2">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {conversion.rows.slice(0, 20).map((row) => (
                    <tr key={row.rowNumber} className="border-t border-border">
                      <td className="p-2">{row.rowNumber}</td>
                      {conversion.columns.map((key) => (
                        <td className="max-w-48 break-words p-2" key={key}>
                          {row.record[key]}
                        </td>
                      ))}
                      <td className="min-w-48 p-2 text-muted-foreground">
                        {row.errors.join(" ") || "Valid"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invalid > 0 && (
              <details className="mt-5">
                <summary>All row errors ({invalid})</summary>
                <ul className="mt-3 space-y-2 text-xs">
                  {conversion.rows
                    .filter((row) => row.errors.length)
                    .map((row) => (
                      <li key={row.rowNumber}>
                        Row {row.rowNumber}: {row.errors.join(" ")}
                      </li>
                    ))}
                </ul>
              </details>
            )}
            {Boolean(book?.sheets[sheetIndex].warnings.length) && (
              <details className="mt-5">
                <summary>
                  Formula / cell warnings (
                  {book!.sheets[sheetIndex].warnings.length})
                </summary>
                <ul className="mt-3 space-y-2 text-xs">
                  {book!.sheets[sheetIndex].warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            <label className="mt-6 flex gap-3 text-sm leading-7">
              <input
                type="checkbox"
                checked={approved}
                onChange={(event) => setApproved(event.target.checked)}
              />
              I reviewed the mapping, row counts, unmapped fields and any
              formula warnings. I approve exporting this conversion.
            </label>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Formula results are not recalculated. IDs remain text in
              XLSX/JSON; Excel may reinterpret IDs when opening CSV. CSV exports
              escape formula-like text. No amounts are calculated or inferred.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {(["csv", "xlsx", "json"] as const).map((kind) => (
                <Button
                  key={kind}
                  disabled={!canExport || busy}
                  onClick={() => exportFile(kind)}
                >
                  Download {kind.toUpperCase()}
                </Button>
              ))}
            </div>
            {profile === "prospects" && canExport && records.length <= 500 && (
              <form
                action={importAction}
                className="mt-6 space-y-3 border-t border-border pt-5"
              >
                <input
                  type="hidden"
                  name="csv_text"
                  value={csvText(conversion.columns, records, false)}
                />
                <input
                  type="hidden"
                  name="filename"
                  value={`converted-${filename}.csv`}
                />
                <input
                  type="hidden"
                  name="label"
                  value={`Converted prospects: ${filename}`.slice(0, 160)}
                />
                <input
                  type="hidden"
                  name="mapping"
                  value={JSON.stringify(
                    Object.fromEntries(
                      conversion.columns.map((key) => [key, key]),
                    ),
                  )}
                />
                <p className="text-xs leading-6 text-muted-foreground">
                  This next action uploads mapped prospects to a saved CRM
                  preview. Normal organization permissions, Zod validation,
                  deduplication and a separate import confirmation still apply.
                  No employee or payroll records are imported as leads.
                </p>
                <Submit>Preview prospects in CRM</Submit>
                {state.error && (
                  <p role="alert" className="text-sm text-red-300">
                    {state.error}
                  </p>
                )}
              </form>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
