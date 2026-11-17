import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { zipSync, strToU8 } from "fflate";
import {
  readSpreadsheet,
  sheetTable,
  csvText,
  xlsxExport,
  guardWorkbookZip,
} from "../../src/lib/converter/spreadsheet";
import { convertRows, defaultMapping } from "../../src/lib/converter/profiles";
const bytes = (value: unknown) => {
  const array = value as Uint8Array;
  return array.buffer.slice(
    array.byteOffset,
    array.byteOffset + array.byteLength,
  ) as ArrayBuffer;
};
describe("spreadsheet conversion", () => {
  it("selects sheets and preserves text IDs and real source row numbers", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Employees");
    sheet.addRow(["Employee ID", "Name", "Hire date"]);
    sheet.addRow([
      "00017",
      "Synthetic Person",
      new Date("2026-11-17T00:00:00Z"),
    ]);
    sheet.addRow([]);
    sheet.addRow(["00018", "Synthetic Other", "2026-11-18"]);
    book.addWorksheet("Schedule");
    const result = await readSpreadsheet(
      "test.xlsx",
      bytes(await book.xlsx.writeBuffer()),
    );
    expect(result.sheets).toHaveLength(2);
    const table = sheetTable(result.sheets[0], 1);
    expect(table.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
    expect(table.rows[0].values["Employee ID"]).toBe("00017");
  });
  it("flags formulas and uses saved results without evaluating", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Data");
    sheet.addRow(["Amount"]);
    sheet.getCell("A2").value = { formula: "1+2", result: 3 };
    const result = await readSpreadsheet(
      "test.xlsx",
      bytes(await book.xlsx.writeBuffer()),
    );
    expect(result.sheets[0].rows[1][0]).toBe("3");
    expect(result.sheets[0].warnings[0]).toContain("not recalculated");
  });
  it("keeps formula-like text as text in XLSX export", async () => {
    const output = await xlsxExport(
      ["employee_id", "name"],
      [{ employee_id: "00017", name: "=1+1" }],
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(output);
    expect(book.worksheets[0].getCell("A2").value).toBe("00017");
    expect(book.worksheets[0].getCell("B2").type).toBe(
      ExcelJS.ValueType.String,
    );
  });
  it("escapes CSV formula-like values without changing legitimate negative amounts", () => {
    const text = csvText(["name", "net"], [{ name: "=1+1", net: "-123.40" }]);
    expect(text).toContain('"\'=1+1"');
    expect(text).toContain('"-123.40"');
  });
  it("rejects macro workbooks and excessive worksheet indices before loading", () => {
    const malicious = zipSync({ "xl/vbaProject.bin": new Uint8Array([1, 2]) });
    expect(() => guardWorkbookZip(malicious)).toThrow("macro");
    const large = zipSync({
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><row r="999999"/></worksheet>',
      ),
    });
    expect(() => guardWorkbookZip(large)).toThrow("row limit");
  });
  it("rejects duplicate or empty headers", () =>
    expect(() =>
      sheetTable(
        {
          name: "Data",
          rows: [
            ["ID", "ID"],
            ["1", "2"],
          ],
          warnings: [],
        },
        1,
      ),
    ).toThrow("unique"));
  it("does not reinterpret ambiguous date or decimal formats", () => {
    const table = sheetTable(
      {
        name: "CSV",
        rows: [
          ["Employee ID", "Pay period end", "Gross"],
          ["00017", "04/05/2026", "1,23"],
        ],
        warnings: [],
      },
      1,
    );
    const result = convertRows(
      "payroll",
      table.headers,
      table.rows,
      defaultMapping("payroll", table.headers),
      "ISO",
    );
    expect(result.rows[0].errors.some((error) => error.includes("date"))).toBe(
      true,
    );
    expect(
      result.rows[0].errors.some((error) => error.includes("grouping")),
    ).toBe(true);
  });
  it("uses the selected date order and flags duplicate employee identities", () => {
    const sheet = {
      name: "CSV",
      rows: [
        ["Employee ID", "Name", "Hire date"],
        ["00017", "A", "04/05/2026"],
        ["00017", "B", "04/06/2026"],
      ],
      warnings: [],
    };
    const table = sheetTable(sheet, 1);
    const result = convertRows(
      "employees",
      table.headers,
      table.rows,
      defaultMapping("employees", table.headers),
      "MDY",
    );
    expect(result.rows[0].record.hire_date).toBe("2026-04-05");
    expect(result.rows[1].errors.join(" ")).toContain("Duplicate");
  });
  it("custom conversion preserves all source columns", () => {
    const table = sheetTable(
      {
        name: "CSV",
        rows: [
          ["Legacy field", "Other", "__proto__"],
          ["00017", " Original ", "retained"],
        ],
        warnings: [],
      },
      1,
    );
    const result = convertRows(
      "custom",
      table.headers,
      table.rows,
      defaultMapping("custom", table.headers),
      "ISO",
    );
    expect(result.unmapped).toEqual([]);
    expect(result.rows[0].record).toEqual({
      "Legacy field": "00017",
      Other: " Original ",
      ["__proto__"]: "retained",
    });
  });
});
