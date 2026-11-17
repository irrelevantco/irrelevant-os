# Reviewed spreadsheet conversion

Open **Data converter** in the workspace. This is a functioning local conversion tool, not a payroll or HR system. It reads UTF-8 CSV and XLSX files, lets you choose a sheet/header row, map fields and select source date order, then previews records and errors before an explicit export approval.

## Templates

| Template | Output and boundary |
| --- | --- |
| Prospects | Canonical business columns; separate CRM preview and confirmation before creating Discovered leads |
| Employee directory | Employee ID, name, department, role, contact, hire date, status |
| Payroll summaries | Employee/period IDs, hours, rate, gross/net and currency; source values only |
| Applicants / resume index | Applicant identity, contact, role, status and resume URL; no document extraction |
| Shift schedules | Shift/employee IDs, work date, start/end times and location; no schedule optimizer |
| Production / work orders | Order/operation identity, product, quantity, unit, due date, status |
| Custom | Keep source columns, including fields outside these templates |

CSV, XLSX and JSON downloads are implemented. XLSX/JSON preserve IDs as text. CSV escapes formula-like text, but spreadsheet software may reinterpret IDs when reopening CSV. Prefer XLSX/JSON for transfers requiring leading zeros. Formulas are never evaluated: saved formula results have explicit warnings and may be stale. Mapped templates trim whitespace; Custom preserves source text. Nothing calculates payroll, taxes, deductions, currency conversions or inferred amounts.

## Data boundaries

Employee, payroll, applicant, schedule and production contents stay in browser/Electron memory. They are not posted to the application, AI providers, analytics or Supabase. Downloads go to the user's normal download location; close the page to discard the loaded file. No database or file backup is created. Do not confuse conversion with secure long-term employee record storage.

Only the **Prospects** template exposes **Preview prospects in CRM** after approval, up to 500 rows. That explicit action uploads mapped business records to the existing owner-authorized Zod/duplicate/import flow. Creating the preview does not commit records. Other templates never become CRM leads.

Limits: 5 MB file, 10 sheets, 60 columns, 2,000 data rows/sheet, 25 possible header rows. ZIP/XML preflight bounds expanded sizes and rejects macros, encrypted workbooks and XML entities. Blank/duplicate headers, missing required fields, duplicate identities, invalid URLs/email, extra data beyond headers, ambiguous dates and numeric grouping block exports. Fix the source or mapping; invalid rows are not silently discarded. Unmapped columns are listed. XLS, XLSM, password-protected files and PDF/DOCX resumes are unsupported.

## Migration service pilot

Keep the original export as the source of truth. Map a synthetic or authorized redacted sample first, reconcile source/output row counts, IDs, dates and unmapped columns, then review every warning. For financial transfers, separately reconcile period totals and obtain the responsible payroll professional's sign-off. Test the destination import in its sandbox and retain a rollback export before any cutover. This release does not connect to ADP, Kronos/UKG or any employer system and does not claim to replace them.
