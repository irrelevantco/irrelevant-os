"use client";
import { useActionState } from "react";
import {
  saveAutomation,
  saveMeeting,
  cancelMeeting,
  syncMeeting,
  sendApprovedEmail,
  disconnectGoogle,
  cancelGoogleMeeting,
} from "@/app/acquisition-actions";
import { Field, Submit } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { FREE_CATEGORIES, US_STATES } from "@/lib/agents/discovery-options";
import type { Acquisition } from "@/lib/acquisition/state";
import type { ActionState } from "@/lib/domain";
function Feedback({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite">
      {state.error && (
        <p role="alert" className="my-3 text-sm text-red-300">
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
export function AutomationForm({
  settings,
  googleConnected,
}: {
  settings: Acquisition["settings"];
  googleConnected: boolean;
}) {
  const [state, action] = useActionState(saveAutomation, {});
  return (
    <form action={action} className="space-y-5">
      <label className="flex gap-3 text-sm">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={settings?.enabled ?? false}
        />
        Enable hourly discovery during weekdays, 7 a.m.–3 p.m. Eastern
      </label>
      <p className="text-xs leading-6 text-muted-foreground">
        Target up to 5 new map candidates per selected category per hour. Seven
        categories means at most 56 searches / 280 candidate targets per
        workday. Coverage and duplicates can produce fewer results. Enabling
        sets the total daily job ceiling to 100 and resumes preparation; no API
        credits are purchased.
      </p>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-3 text-sm">Business fields</legend>
        {Object.entries(FREE_CATEGORIES).map(([key, label]) => (
          <label key={key} className="flex gap-3 text-sm">
            <input
              name="categories"
              value={key}
              type="checkbox"
              defaultChecked={settings?.categories.includes(key) ?? true}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Discovery city">
          <Input
            name="city"
            required
            maxLength={80}
            defaultValue={settings?.city ?? "Erie"}
          />
        </Field>
        <Field label="Discovery state">
          <Select name="state" defaultValue={settings?.state ?? "PA"}>
            {US_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="flex gap-3 text-sm">
        <input
          name="sending_enabled"
          type="checkbox"
          disabled={!googleConnected}
          defaultChecked={
            googleConnected && (settings?.sending_enabled ?? false)
          }
        />
        Allow separately approved Gmail sends (maximum 5 per day)
      </label>
      <p className="text-xs leading-6 text-muted-foreground">
        Discovery and preparation never send email. A sender name, postal
        address, approved sourced review and explicit approval of the exact
        saved message are still required. Replies and opt-outs must currently be
        logged manually; mailbox synchronization is not enabled.
      </p>
      <Feedback state={state} />
      <Submit>Save acquisition controls</Submit>
    </form>
  );
}
export function MeetingForm({
  leads,
  requestKey,
}: {
  leads: { id: string; name: string }[];
  requestKey: string;
}) {
  const [state, action] = useActionState(saveMeeting, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="request_key" value={requestKey} />
      <Field label="Appointment prospect">
        <Select name="lead_id" required>
          <option value="">Choose a business</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Appointment type">
          <Select name="kind">
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
          </Select>
        </Field>
        <Field label="Duration in minutes">
          <Input
            name="duration"
            type="number"
            min={15}
            max={120}
            defaultValue={30}
            required
          />
        </Field>
      </div>
      <Field
        label="Agreed start · Eastern Time"
        hint="Monday–Friday. The entire appointment must fit between 7 a.m. and 3 p.m. Eastern, including daylight saving time."
      >
        <Input name="local_start" type="datetime-local" required />
      </Field>
      <Field
        label="Potential scope value (USD)"
        hint="Optional manual estimate, not a confirmed budget, signed contract or revenue. Blank preserves the existing estimate."
      >
        <Input
          name="estimated_value"
          type="number"
          min={0}
          max={1000000}
          step="0.01"
        />
      </Field>
      <Field
        label="How was this time agreed?"
        hint="Record the actual call/reply and agreement. Do not treat a proposed slot as accepted."
      >
        <Textarea
          name="agreement_note"
          required
          minLength={10}
          maxLength={2000}
        />
      </Field>
      <label className="flex gap-3 text-sm">
        <input name="confirmed" type="checkbox" required />
        The business agreed to this date and time. I approve recording this
        appointment.
      </label>
      <Feedback state={state} />
      <Submit>Record agreed appointment</Submit>
    </form>
  );
}
export function CalendarForm({
  id,
  email,
  connected,
}: {
  id: string;
  email: string | null;
  connected: boolean;
}) {
  const [state, action] = useActionState(syncMeeting, {});
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expected_email" value={email ?? ""} />
      <label className="flex gap-3 text-xs leading-6">
        <input
          type="checkbox"
          name="invite_guest"
          disabled={!email || !connected}
        />
        Also invite the public contact {email ?? "(no email recorded)"}; the
        guest agreed to receive this invitation.
      </label>
      <label className="flex gap-3 text-xs leading-6">
        <input
          type="checkbox"
          name="confirmed"
          required
          disabled={!connected}
        />
        I approve adding this exact agreed appointment to the company Google
        Calendar.
      </label>
      <Feedback state={state} />
      <Submit disabled={!connected}>Add / reconcile Google Calendar</Submit>
    </form>
  );
}
export function CancelMeetingForm({ id }: { id: string }) {
  const [state, action] = useActionState(cancelMeeting, {});
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} />
      <Submit>Cancel local appointment</Submit>
    </form>
  );
}
export function SendEmailForm({
  leadId,
  draftAt,
  requestKey,
  recipient,
  body,
  enabled,
}: {
  leadId: string;
  draftAt: string;
  requestKey: string;
  recipient: string;
  body: string;
  enabled: boolean;
}) {
  const [state, action] = useActionState(sendApprovedEmail, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="recipient" value={recipient} />
      <input type="hidden" name="expected_body" value={body} />
      <input type="hidden" name="draft_updated_at" value={draftAt} />
      <input type="hidden" name="request_key" value={requestKey} />
      <p className="break-all text-sm">To: {recipient}</p>
      <p className="break-all text-xs text-muted-foreground">
        From: contact.irrelevantcollective@gmail.com
      </p>
      <Field label="Approved email subject">
        <Input
          name="subject"
          required
          maxLength={160}
          defaultValue="A brief growth review for your business"
        />
      </Field>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border border-border p-4 text-xs leading-7">
        {body}
      </pre>
      <label className="flex gap-3 text-xs leading-6">
        <input
          type="checkbox"
          name="confirmed"
          required
          disabled={!enabled}
          aria-describedby={!enabled ? "email-send-blockers" : undefined}
        />
        I reviewed the recipient, subject and full message above, including the
        sender and postal address. I approve sending this exact email now.
      </label>
      <Feedback state={state} />
      <Submit disabled={!enabled}>Approve and send this email</Submit>
    </form>
  );
}
export function DisconnectGoogleForm() {
  const [state, action] = useActionState(disconnectGoogle, {});
  return (
    <form action={action}>
      <Feedback state={state} />
      <Submit>Disconnect Google and disable sending</Submit>
    </form>
  );
}
export function CancelGoogleMeetingForm({
  id,
  connected,
}: {
  id: string;
  connected: boolean;
}) {
  const [state, action] = useActionState(cancelGoogleMeeting, {});
  return (
    <form
      action={action}
      className="mt-5 space-y-3 border-t border-border pt-4"
    >
      <input type="hidden" name="id" value={id} />
      <label className="flex gap-3 text-xs leading-6">
        <input
          type="checkbox"
          name="confirmed"
          required
          disabled={!connected}
        />
        I approve cancelling this exact Google appointment and notifying any
        invited guests.
      </label>
      <Feedback state={state} />
      <Submit disabled={!connected}>Cancel Google and local appointment</Submit>
    </form>
  );
}
