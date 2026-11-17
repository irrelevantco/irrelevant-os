"use client";
import { useActionState, useState } from "react";
import { loadCsv, previewImport, commitImport } from "@/app/prospect-actions";
import { IMPORT_FIELDS, type Mapping } from "@/lib/imports/fields";
import { Field, Submit } from "@/components/forms";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/domain";
export function Feedback({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite">
      {state.error && (
        <p
          role="alert"
          className="my-3 rounded border border-red-400/30 p-3 text-sm text-red-300"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="my-3 rounded border border-primary/30 p-3 text-sm text-primary"
        >
          {state.success}
        </p>
      )}
    </div>
  );
}
export function CsvImportForm() {
  const [state, action, pending] = useActionState(loadCsv, {});
  return (
    <div>
      <form action={action} className="space-y-4">
        <Field
          label="CSV file"
          hint="UTF-8 CSV, up to 512 KB and 500 rows. Column mapping and a saved preview come next."
        >
          <Input name="file" type="file" accept=".csv,text/csv" />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="source" value="upload" disabled={pending}>
            Read uploaded CSV
          </Button>
          <Button
            type="submit"
            name="source"
            value="batch001"
            variant="outline"
            disabled={pending}
          >
            Load Prospect Batch 001
          </Button>
        </div>
      </form>
      <Feedback state={state} />
      {state.text && state.headers && (
        <MappingForm
          key={state.filename + state.text}
          text={state.text}
          filename={state.filename!}
          headers={state.headers}
          initialMapping={state.mapping!}
          rowCount={state.rowCount!}
        />
      )}
    </div>
  );
}
function MappingForm({
  text,
  filename,
  headers,
  initialMapping,
  rowCount,
}: {
  text: string;
  filename: string;
  headers: string[];
  initialMapping: Mapping;
  rowCount: number;
}) {
  const [mapping, setMapping] = useState<Mapping>(initialMapping);
  const [state, action] = useActionState(previewImport, {});
  return (
    <form
      action={action}
      className="mt-8 space-y-5 border-t border-border pt-7"
    >
      <h3 className="text-lg">Map your columns</h3>
      <p className="text-sm text-muted-foreground">
        {rowCount} rows read from {filename}. No business records have been
        imported.
      </p>
      <input type="hidden" name="csv_text" value={text} />
      <input type="hidden" name="filename" value={filename} />
      <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
      <Field label="Batch name">
        <Input
          name="label"
          required
          maxLength={160}
          defaultValue="Prospect Batch 001"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {IMPORT_FIELDS.map((field) => (
          <Field key={field} label={`Map ${field}`}>
            <Select
              value={mapping[field] ?? ""}
              onChange={(e) =>
                setMapping({ ...mapping, [field]: e.target.value })
              }
            >
              <option value="">Do not map</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        Business name, industry and location are required. Source labels,
        decision-maker details, notes and any supplied issue claims remain
        unverified. CSV status values cannot mark a lead ready or approve a
        review.
      </p>
      <Feedback state={state} />
      <Submit>Preview mapped rows</Submit>
    </form>
  );
}
export function CommitImportForm({ batch }: { batch: string }) {
  const [state, action] = useActionState(commitImport, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="batch" value={batch} />
      <label className="flex items-start gap-3 text-sm">
        <input
          name="confirm"
          type="checkbox"
          required
          className="mt-1 accent-primary"
        />
        <span>
          I reviewed the rows. Import valid new records as Discovered; skip
          duplicates and retain row errors.
        </span>
      </label>
      <Feedback state={state} />
      <Submit>Import valid prospects</Submit>
    </form>
  );
}
