"use client";
import { useActionState } from "react";
import {
  configureAgents,
  enqueueJob,
  runAgent,
  stopAgents,
  acceptDraft,
  logContact,
  previewDiscovery,
} from "@/app/agent-actions";
import { Field, Submit } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { Database } from "@/lib/supabase/database.types";
import type { ActionState } from "@/lib/domain";
function Feedback({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite">
      {state.error && (
        <p role="alert" className="my-3 break-words text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="my-3 text-sm text-primary">
          {state.success}
        </p>
      )}
    </div>
  );
}
export function AgentSettingsForm({
  settings,
}: {
  settings: Database["public"]["Tables"]["agent_settings"]["Row"] | null;
}) {
  const [state, action] = useActionState(configureAgents, {});
  return (
    <form action={action} className="space-y-4">
      <label className="flex gap-3 text-sm">
        <input
          name="paused"
          type="checkbox"
          defaultChecked={settings?.paused ?? true}
        />
        Pause preparation agents
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Daily job limit">
          <Input
            name="daily_job_limit"
            type="number"
            min={1}
            max={25}
            defaultValue={settings?.daily_job_limit ?? 10}
          />
        </Field>
        <Field
          label="Daily Explee credit allowance"
          hint="Default 0 disables discovery. Company search may cost 0.5 credits per result. No automatic top-ups."
        >
          <Input
            name="explee_daily_credit_limit"
            type="number"
            min={0}
            max={50}
            step="0.5"
            defaultValue={settings?.explee_daily_credit_limit ?? 0}
          />
        </Field>
        <Field label="Sender name">
          <Input
            name="sender_name"
            maxLength={160}
            defaultValue={settings?.sender_name ?? ""}
          />
        </Field>
        <Field label="Sender email">
          <Input
            name="sender_email"
            type="email"
            maxLength={254}
            defaultValue={settings?.sender_email ?? ""}
          />
        </Field>
      </div>
      <Field label="Business postal address">
        <Textarea
          name="postal_address"
          maxLength={500}
          defaultValue={settings?.postal_address ?? ""}
        />
      </Field>
      <Feedback state={state} />
      <Submit>Save limits and sender</Submit>
    </form>
  );
}
export function QueueForm({
  leads,
  requestKey,
}: {
  leads: { id: string; name: string }[];
  requestKey: string;
}) {
  const [state, action] = useActionState(enqueueJob, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="request_key" value={requestKey} />
      <Field label="Preparation workflow">
        <Select name="kind">
          <option value="research_plan">Research plan</option>
          <option value="outreach_draft">Evidence-based outreach draft</option>
          <option value="follow_up">Follow-up draft</option>
        </Select>
      </Field>
      <Field label="Prospect">
        <Select name="lead" required>
          <option value="">Choose a business</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-xs leading-6 text-muted-foreground">
        Outreach needs an approved, sourced review. Follow-ups also need an
        actual outbound contact logged at least three days ago with no later
        reply. Draft creation is never logged as contact.
      </p>
      <Feedback state={state} />
      <Submit>Queue preparation</Submit>
    </form>
  );
}
export function DiscoveryForm({
  requestKey,
  configured,
}: {
  requestKey: string;
  configured: boolean;
}) {
  const [state, action] = useActionState(enqueueJob, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="request_key" value={requestKey} />
      <input type="hidden" name="kind" value="discovery" />
      <Field label="Industry">
        <Input
          name="industry"
          required
          minLength={2}
          maxLength={160}
          placeholder="Established commercial cleaning businesses"
        />
      </Field>
      <Field label="US city">
        <Input
          name="city"
          required
          minLength={2}
          maxLength={160}
          placeholder="Erie"
        />
      </Field>
      <Field label="Target candidates">
        <Input name="count" type="number" min={1} max={10} defaultValue={5} />
      </Field>
      <label className="flex gap-3 text-xs leading-6">
        <input name="credit_approval" type="checkbox" required />I approve one
        search within the configured credit allowance. Provider billing terms
        apply.
      </label>
      <p className="text-xs text-muted-foreground">
        {configured
          ? "Company-search adapter configured. Results require an import preview."
          : "Explee API key not configured. CSV Imports are available now."}
      </p>
      <Feedback state={state} />
      <Submit>Queue company discovery</Submit>
    </form>
  );
}
export function AgentControl({
  kind,
  job,
}: {
  kind: "run" | "stop" | "preview";
  job?: string;
}) {
  const [state, action] = useActionState(
    kind === "run"
      ? runAgent
      : kind === "preview"
        ? previewDiscovery
        : stopAgents,
    {},
  );
  return (
    <form action={action}>
      <input type="hidden" name="job" value={job ?? ""} />
      <Submit>
        {kind === "run"
          ? "Run next queued job"
          : kind === "preview"
            ? "Preview candidates in Imports"
            : job
              ? "Stop job"
              : "Pause and stop all jobs"}
      </Submit>
      <Feedback state={state} />
    </form>
  );
}
export function AcceptProposal({ job }: { job: string }) {
  const [state, action] = useActionState(acceptDraft, {});
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="job" value={job} />
      <label className="flex gap-3 text-xs leading-6">
        <input type="checkbox" name="confirm" required />I reviewed this
        proposal and approve replacing the current editable draft. This does not
        approve sending.
      </label>
      <Submit>Accept as editable draft</Submit>
      <Feedback state={state} />
    </form>
  );
}
export function ContactEventForm({ lead }: { lead: string }) {
  const [state, action] = useActionState(logContact, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lead" value={lead} />
      <Field label="Actual contact event">
        <Select name="kind">
          <option value="outbound_email">Email sent outside this app</option>
          <option value="outbound_call">Call made outside this app</option>
          <option value="reply">Reply received</option>
          <option value="positive_reply">Positive reply received</option>
          <option value="opt_out">Opt-out / suppress prospect</option>
        </Select>
      </Field>
      <Field label="Contact date">
        <Input type="date" name="date" required />
      </Field>
      <Field label="Contact note">
        <Textarea name="note" required maxLength={2000} />
      </Field>
      <label className="flex gap-3 text-xs leading-6">
        <input name="confirm" type="checkbox" required />
        This event actually occurred. I understand an opt-out stops preparation
        and suppresses this business.
      </label>
      <Feedback state={state} />
      <Submit>Record actual contact</Submit>
    </form>
  );
}
