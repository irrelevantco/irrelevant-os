import { parse } from "csv-parse/browser/esm/sync";
import { unzipSync, strFromU8 } from "fflate";
export const FILE_LIMIT = 5 * 1024 * 1024;
export type Sheet = { name: string; rows: string[][]; warnings: string[] };
export type WorkbookData = { sheets: Sheet[] };
export function guardWorkbookZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Not a supported XLSX workbook.");
  const entries = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    entries > 2000 ||
    offset === 0xffffffff
  )
    throw new Error("Split, ZIP64 or oversized workbooks are not supported.");
  let cursor = offset,
    total = 0;
  for (let i = 0; i < entries; i++) {
    if (
      cursor + 46 > bytes.length ||
      view.getUint32(cursor, true) !== 0x02014b50
    )
      throw new Error("Workbook directory is invalid.");
    const flags = view.getUint16(cursor + 8, true),
      size = view.getUint32(cursor + 24, true),
      nameLength = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true);
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    total += size;
    if (
      flags & 1 ||
      size > 8 * 1024 * 1024 ||
      total > 20 * 1024 * 1024 ||
      /vbaProject|activeX|(^|\/)\.\.(\/|$)/i.test(name)
    )
      throw new Error(
        "Encrypted, macro-enabled or oversized workbooks are not supported.",
      );
    cursor += 46 + nameLength + extra + comment;
  }
  const xml = unzipSync(bytes, {
    filter: (file) => file.name.endsWith(".xml"),
  });
  for (const [name, data] of Object.entries(xml)) {
    const text = strFromU8(data);
    if (/<!DOCTYPE|<!ENTITY/i.test(text))
      throw new Error("Workbook XML entities are not supported.");
    if (name.startsWith("xl/worksheets/")) {
      if (
        [...text.matchAll(/<row\b[^>]*\br=["'](\d+)["']/g)].some(
          (match) => Number(match[1]) > 2025,
        )
      )
        throw new Error("A worksheet row exceeds the row limit.");
      for (const match of text.matchAll(/\br=["']([A-Z]+)(\d+)["']/g)) {
        let column = 0;
        for (const char of match[1])
          column = column * 26 + char.charCodeAt(0) - 64;
        if (column > 60 || Number(match[2]) > 2025)
          throw new Error(
            "Use at most 60 columns and 2,000 data rows per sheet, with up to 25 header rows.",
          );
      }
    }
  }
}
export async function readSpreadsheet(
  name: string,
  data: ArrayBuffer,
): Promise<WorkbookData> {
  if (data.byteLength > FILE_LIMIT)
    throw new Error("Choose a file up to 5 MB.");
  if (name.toLowerCase().endsWith(".csv")) {
    const rows = parse(new TextDecoder().decode(data), {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: 600000,
    }) as string[][];
    if (rows.length > 2025 || rows.some((row) => row.length > 60))
      throw new Error("Use at most 2,000 data rows and 60 columns.");
    return { sheets: [{ name: "CSV", rows, warnings: [] }] };
  }
  if (!name.toLowerCase().endsWith(".xlsx"))
    throw new Error(
      "Choose XLSX or UTF-8 CSV. XLS, XLSM, PDF and DOCX are not supported by this converter.",
    );
  guardWorkbookZip(new Uint8Array(data));
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    data as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  if (workbook.worksheets.length > 10)
    throw new Error("Use at most 10 sheets per workbook.");
  return {
    sheets: workbook.worksheets.map((worksheet) => {
      if (worksheet.rowCount > 2025 || worksheet.columnCount > 60)
        throw new Error("A sheet exceeds the row/column limit.");
      const warnings: string[] = [];
      const rows: string[][] = [];
      for (let r = 1; r <= worksheet.rowCount; r++) {
        const row: string[] = [];
        for (let c = 1; c <= worksheet.columnCount; c++) {
          const cell = worksheet.getCell(r, c);
          let value = cell.value;
          if (
            value &&
            typeof value === "object" &&
            ("formula" in value || "sharedFormula" in value)
          ) {
            warnings.push(
              `${worksheet.name}!${cell.address}: formula not recalculated; only its saved result is used.`,
            );
            value = "result" in value ? (value.result ?? null) : null;
          }
          let text = "";
          if (value instanceof Date) text = value.toISOString();
          else if (typeof value === "object" && value) {
            if ("richText" in value)
              text = value.richText.map((part) => part.text).join("");
            else if ("text" in value) text = String(value.text);
            else
              warnings.push(
                `${worksheet.name}!${cell.address}: unsupported cell value; review the original.`,
              );
          } else if (value !== null && value !== undefined)
            text = String(value);
          if (
            typeof value === "number" &&
            Number.isInteger(value) &&
            /^0{2,20}$/.test(cell.numFmt)
          )
            text = String(value).padStart(cell.numFmt.length, "0");
          if (text.length > 10000)
            throw new Error("A cell exceeds 10,000 characters.");
          row.push(text);
        }
        rows.push(row);
      }
      return { name: worksheet.name, rows, warnings };
    }),
  };
}
export function sheetTable(sheet: Sheet, headerRow: number) {
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 25)
    throw new Error("Choose a header row from 1 to 25.");
  const headers = (sheet.rows[headerRow - 1] ?? []).map((v) => v.trim());
  while (headers.at(-1) === "") headers.pop();
  if (
    !headers.length ||
    headers.some((h) => !h || h.length > 160) ||
    new Set(headers.map((h) => h.toLowerCase())).size !== headers.length
  )
    throw new Error(
      "The selected header row needs unique, nonempty column names.",
    );
  const rows = sheet.rows
    .slice(headerRow)
    .map((row, index) => ({
      rowNumber: headerRow + index + 1,
      values: Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])),
      extraColumns: row.slice(headers.length).some((v) => v.trim()),
    }))
    .filter(
      (row) =>
        Object.values(row.values).some((value) => value.trim()) ||
        row.extraColumns,
    );
  if (rows.length > 2000) throw new Error("Use at most 2,000 data rows.");
  return { headers, rows };
}
export function csvText(
  headers: string[],
  records: Record<string, string>[],
  excelSafe = true,
) {
  const cell = (value: string) =>
    `"${(excelSafe && /^[\t\r ]*[=+@-]/.test(value) && !/^[-+]?\d+(\.\d+)?$/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  return [
    headers.map(cell).join(","),
    ...records.map((record) =>
      headers.map((header) => cell(record[header] ?? "")).join(","),
    ),
  ].join("\r\n");
}
export async function xlsxExport(
  headers: string[],
  records: Record<string, string>[],
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Converted");
  sheet.addRow(headers);
  for (const record of records)
    sheet.addRow(headers.map((header) => record[header] ?? ""));
  return workbook.xlsx.writeBuffer();
}
