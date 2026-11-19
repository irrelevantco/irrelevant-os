"use client";
import { useActionState, useState } from "react";
import {
  saveEngine,
  approveCampaign,
  pauseCampaign,
  runEngine,
  queueResearch,
  applyResearch,
  resolveDelivery,
} from "@/app/engine-actions";
import {
  DEFAULT_SETTINGS,
  TERRITORIES,
  ENGINE_CATEGORIES,
  type EngineState,
} from "@/lib/engine/contracts";
import { FREE_CATEGORIES } from "@/lib/agents/discovery-options";
import { Field, Submit } from "../forms";
import { Feedback } from "../research/import-form";
import { Input, Select, Textarea } from "../ui/input";
import { Button } from "../ui/button";
function Check({
  name,
  children,
  checked = false,
}: {
  name: string;
  children: React.ReactNode;
  checked?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 text-sm leading-6">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="mt-1.5 shrink-0 accent-primary"
      />
      <span>{children}</span>
    </label>
  );
}
export function EngineSettingsForm({
  settings,
  paidCap,
}: {
  settings: EngineState["settings"];
  paidCap: number | null;
}) {
  const values = settings ?? DEFAULT_SETTINGS;
  const [state, action] = useActionState(saveEngine, {});
  const [territories, setTerritories] = useState(
    values.territories.map((t) => `${t.city}, ${t.state}`).join("\n"),
  );
  const [provider, setProvider] = useState(values.ai_provider);
  const [models, setModels] = useState<string[]>([]),
    [modelNotice, setModelNotice] = useState("");
  return (
    <form action={action} className="space-y-5">
      <Check name="enabled" checked={values.enabled}>
        Enable the local acquisition runner, resume preparation and replace the
        old single-city discovery schedule. This does not approve automatic
        emails.
      </Check>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Active lead goal">
          <Input
            type="number"
            name="target_leads"
            min={1000}
            max={100000}
            defaultValue={values.target_leads}
            required
          />
        </Field>
        <Field label="Cumulative confirmed-send goal">
          <Input
            type="number"
            name="contact_goal"
            min={1}
            max={100000}
            defaultValue={values.contact_goal}
            required
          />
        </Field>
      </div>
      <Check name="research_enabled" checked={values.research_enabled}>
        Queue public-web research in A, then B, then C priority. Captured
        observations and model advice remain unverified proposals.
      </Check>
      <Check name="discovery_enabled" checked={values.discovery_enabled}>
        Rotate free OpenStreetMap searches across the selected territories and
        business categories until the active lead goal is reached.
      </Check>
      <Check name="auto_import" checked={values.auto_import}>
        Import completed engine discovery previews automatically as unverified
        Discovered leads, with deduplication and source provenance. Otherwise
        leave them for my import approval.
      </Check>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Daily research job allowance">
          <Input
            type="number"
            name="daily_research_limit"
            min={1}
            max={50}
            defaultValue={values.daily_research_limit}
            required
          />
        </Field>
        <Field label="Daily free discovery allowance">
          <Input
            type="number"
            name="daily_discovery_limit"
            min={1}
            max={56}
            defaultValue={values.daily_discovery_limit}
            required
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Automation starts · Eastern">
          <Select name="schedule_start_hour" defaultValue={String(values.schedule_start_hour)}>{[7,8,9,10,11,12,13,14].map(h=><option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}</Select>
        </Field>
        <Field label="Automation ends · Eastern">
          <Select name="schedule_end_hour" defaultValue={String(values.schedule_end_hour)}>{[8,9,10,11,12,13,14,15].map(h=><option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}</Select>
        </Field>
        <Field label="Check queued work">
          <Select name="cycle_minutes" defaultValue={String(values.cycle_minutes)}>{[1,5,15,30,60].map(m=><option key={m} value={m}>Every {m===1?"minute":`${m} minutes`}</option>)}</Select>
        </Field>
      </div>
      <Field
        label="Discovery territories"
        hint="One City, STATE per line; up to 50. Coverage varies, and a listing is not proof of a current business, email address or service budget."
      >
        <Textarea
          name="territories"
          value={territories}
          onChange={(e) => setTerritories(e.target.value)}
          maxLength={5000}
          className="min-h-52"
          required
        />
      </Field>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          setTerritories(
            TERRITORIES.map((t) => `${t.city}, ${t.state}`).join("\n"),
          )
        }
      >
        Load expanded PA / OH / NY territory
      </Button>
      <fieldset>
        <legend className="mb-3 text-sm">Business categories</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ENGINE_CATEGORIES.map((category) => (
            <label key={category} className="flex gap-3 text-sm">
              <input
                type="checkbox"
                name="categories"
                value={category}
                defaultChecked={values.categories.includes(category)}
                className="accent-primary"
              />
              {FREE_CATEGORIES[category]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="border-t border-border pt-5">
        <h3 className="mb-4 text-sm font-medium">Research provider</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Research assistance">
            <Select
              name="ai_provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
            >
              <option value="rules">Free public-web checks</option>
              <option value="ollama">Local Ollama recommendations</option>
              <option value="openai">OpenAI · optional paid provider</option>
            </Select>
          </Field>
          <Field
            label="Installed / configured model"
            hint="No model is downloaded automatically."
          >
            <Input
              name="ai_model"
              list="engine-models"
              defaultValue={values.ai_model}
              maxLength={100}
              placeholder="Model name; leave blank for free checks"
            />
          </Field>
        </div>
        <datalist id="engine-models">
          {models.map((model) => (
            <option key={model}>{model}</option>
          ))}
        </datalist>
        {provider === "ollama" && (
          <div className="mt-3 space-y-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={async () => {
                setModelNotice("Checking local Ollama…");
                try {
                  const response = await fetch("/api/engine/models", {
                    cache: "no-store",
                  });
                  if (!response.ok) throw Error();
                  const data = (await response.json()) as { models: string[] };
                  setModels(data.models);
                  setModelNotice(
                    data.models.length
                      ? "Installed models are available in the model field."
                      : "No local models were found. Free public-web checks remain available.",
                  );
                } catch {
                  setModelNotice(
                    "Ollama is not available on this computer. Free public-web checks still work.",
                  );
                }
              }}
            >
              Find installed Ollama models
            </Button>
            <p role="status" className="text-xs text-muted-foreground">
              {modelNotice}
            </p>
          </div>
        )}
        {provider === "openai" && (
          <div className="mt-4 space-y-3">
            <p className="text-xs leading-6 text-muted-foreground">
              OpenAI requires a server-only credential, explicit model name and
              configured token prices. No automatic paid fallback is used.{" "}
              {paidCap === null
                ? "The server cost cap is not configured, so model calls will fail closed."
                : `The configured per-call allowance is $${paidCap.toFixed(4)}; the daily research job allowance also limits calls.`}
            </p>
            <Check name="allow_paid_ai">
              I approve sending captured public website text to OpenAI within
              the displayed research allowance and configured per-call cost cap.
            </Check>
          </div>
        )}
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        The app must stay open, your PC awake, Docker available and the owner
        signed in. Work runs Monday–Friday, 7 a.m.–3 p.m. Eastern. Community
        discovery is rate-limited, has no uptime guarantee, and cannot guarantee
        1,000 listings or contactable businesses. Editing these controls pauses
        the previous email policy.
      </p>
      <Feedback state={state} />
      <Submit>Save local engine controls</Submit>
    </form>
  );
}
export function CampaignForm({
  settings,
  senderEnvelope,
  canActivate,
}: {
  settings: EngineState["settings"];
  senderEnvelope: string;
  canActivate: boolean;
}) {
  const [state, action] = useActionState(approveCampaign, {});
  return (
    <form action={action} className="space-y-5">
      <input
        type="hidden"
        name="expected_revision"
        value={settings?.campaign_revision ?? 0}
      />
      <input
        type="hidden"
        name="expected_sender_base64"
        value={senderEnvelope}
      />
      <input type="hidden" name="template_version" value="sourced-v1" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Automatic messages per rolling 24 hours">
          <Input
            name="daily_limit"
            type="number"
            min={1}
            max={500}
            defaultValue={settings?.campaign_daily_limit ?? 25}
            required
          />
        </Field>
        <Field label="Total attempts in this seven-day campaign">
          <Input
            name="total_limit"
            type="number"
            min={1}
            max={1000}
            defaultValue={settings?.campaign_total_limit ?? 100}
            required
          />
        </Field>
      </div>
      <Check name="follow_ups" checked={settings?.follow_ups}>
        Allow at most two template follow-ups, at least three days after actual
        outbound email, and stop after any genuine reply, opt-out or uncertain
        result.
      </Check>
      <Check name="auto_replies" checked={settings?.auto_replies}>
        Allow one standard acknowledgement of an authenticated positive reply in
        a tracked business conversation. Ambiguous or unauthenticated replies
        need my review.
      </Check>
      <Check name="auto_meetings" checked={settings?.auto_meetings}>
        Allow two checked 30-minute options and automatic Google invitations
        only after the same business explicitly chooses Option 1 or Option 2.
        Recheck availability; use Monday–Friday, 7 a.m.–3 p.m. Eastern. Other
        scheduling requests need my review.
      </Check>
      <p className="text-xs leading-6 text-muted-foreground">
        This authorizes the displayed sourced-v1 templates for current and
        future fully verified, owner-approved three-pillar reviews. Ordinary
        Gmail sending and replies share the account’s allowance; the bot also
        checks observed sent-message IDs. Google may restrict delivery sooner.
        Attempts with uncertain outcomes consume allowance and are never
        automatically resent. No price negotiation, agreement acceptance,
        payment or Won status is automated.
      </p>
      <label className="flex gap-3 text-sm leading-6">
        <input
          type="checkbox"
          name="confirmed"
          required
          disabled={!canActivate}
          className="mt-1.5 accent-primary"
        />
        <span>
          I reviewed the full templates, sample messages, sender and postal
          address above. I approve this bounded seven-day automatic campaign,
          including the optional follow-up, reply and invitation permissions I
          selected. My later research approvals may make leads eligible without
          another per-email checkbox.
        </span>
      </label>
      {!canActivate && (
        <p className="text-sm text-muted-foreground">
          Enable the local engine, resume agents, save sender identity, and
          connect Gmail sending plus tracked-thread reading before approval.
        </p>
      )}
      <Feedback state={state} />
      <Submit disabled={!canActivate}>
        Approve seven-day automatic campaign
      </Submit>
    </form>
  );
}
export function EngineButtons() {
  const [run, runAction] = useActionState(runEngine, {}),
    [pause, pauseAction] = useActionState(pauseCampaign, {});
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <form action={runAction}>
          <Submit>Run one engine cycle</Submit>
        </form>
        <form action={pauseAction}>
          <Submit>Pause automatic campaign</Submit>
        </form>
      </div>
      <Feedback state={run} />
      <Feedback state={pause} />
    </div>
  );
}
export function QueueResearchForm({
  leadId,
  requestKey,
}: {
  leadId: string;
  requestKey: string;
}) {
  const [state, action] = useActionState(queueResearch, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="request_key" value={requestKey} />
      <Submit>Research public website</Submit>
      <Feedback state={state} />
    </form>
  );
}
export function ApplyResearchForm({
  jobId,
  contacts = [],
}: {
  jobId: string;
  contacts?: { email: string; source_url: string }[];
}) {
  const [state, action] = useActionState(applyResearch, {});
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="job_id" value={jobId} />
      {!!contacts.length && (
        <Field
          label="Optional public contact to copy"
          hint="Choose only after checking that this address belongs to the business. Existing nonempty contacts are never overwritten."
        >
          <Select name="contact_email" defaultValue="">
            <option value="">Keep the current contact unchanged</option>
            {contacts.map((contact) => (
              <option key={contact.email} value={contact.email}>
                {contact.email}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {!!contacts.length && (
        <div className="mt-2 space-y-1">
          {contacts.map((contact) => (
            <a
              key={contact.email}
              href={contact.source_url}
              target="_blank"
              rel="noreferrer"
              className="block break-all text-xs text-primary underline"
            >
              Check the source for {contact.email}
            </a>
          ))}
        </div>
      )}
      <label className="flex gap-3 text-xs leading-6">
        <input
          type="checkbox"
          name="confirmed"
          required
          className="mt-1.5 accent-primary"
        />
        <span>
          Copy these proposals into the editable review as unverified. I still
          need to verify the sources and approve the review.
        </span>
      </label>
      <Submit>Open proposed Growth Review</Submit>
      <Feedback state={state} />
    </form>
  );
}
export function ResolveDeliveryForm({ id }: { id: string }) {
  const [state, action] = useActionState(resolveDelivery, {});
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="id" value={id} />
      <Field label="Verified Gmail message ID, or blank if not sent">
        <Input name="message_id" maxLength={200} />
      </Field>
      <Check name="confirmed">
        I manually checked Gmail for this exact recipient and message and
        confirm the outcome above. No automatic retry is authorized.
      </Check>
      <Submit>Record manual delivery check</Submit>
      <Feedback state={state} />
    </form>
  );
}
