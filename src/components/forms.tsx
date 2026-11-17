"use client";
import { cloneElement, useActionState, useId, type ReactElement } from "react";
import { useFormStatus } from "react-dom";
import { ArrowUpRight, LoaderCircle, Plus } from "lucide-react";
import {
  addNote,
  createOrganization,
  createProspect,
  renameOrganization,
  signIn,
  signUp,
  updateBusiness,
  updateLead,
} from "@/app/actions";
import { STATUSES, type ActionState } from "@/lib/domain";
import type { Business, Lead } from "@/lib/data";
import { Button } from "./ui/button";
import { Input, Select, Textarea } from "./ui/input";
export function Submit({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending ? <LoaderCircle className="animate-spin" /> : null}
      {pending ? "Saving…" : children}
    </Button>
  );
}
function Feedback({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite">
      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-red-400/25 bg-red-400/5 p-3 text-sm text-red-300"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="rounded-md border border-primary/25 bg-primary/5 p-3 text-sm text-primary"
        >
          {state.success}
        </p>
      )}
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactElement;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const control = cloneElement(
    children as ReactElement<{ id?: string; "aria-describedby"?: string }>,
    { id, "aria-describedby": hint ? hintId : undefined },
  );
  return (
    <div className="grid gap-2 text-sm">
      <label htmlFor={id} className="font-medium text-foreground/85">
        {label}
      </label>
      {control}
      {hint && (
        <p
          id={hintId}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action] = useActionState(
    mode === "login" ? signIn : signUp,
    {},
  );
  return (
    <form action={action} className="space-y-5">
      <Field label="Email address">
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          maxLength={254}
        />
      </Field>
      <Field
        label="Password"
        hint={
          mode === "signup"
            ? "At least 12 characters. Use a unique password."
            : undefined
        }
      >
        <Input
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={mode === "signup" ? 12 : 1}
          maxLength={128}
        />
      </Field>
      <Feedback state={state} />
      <Submit className="w-full">
        {mode === "login" ? "Enter your workspace" : "Create account"}
        <ArrowUpRight />
      </Submit>
    </form>
  );
}
export function OrganizationForm({ name }: { name?: string }) {
  const [state, action] = useActionState(
    name ? renameOrganization : createOrganization,
    {},
  );
  return (
    <form action={action} className="space-y-4">
      <Field label="Organization name">
        <Input
          name="name"
          placeholder="iRRELEVANT CO"
          defaultValue={name}
          required
          minLength={2}
          maxLength={100}
        />
      </Field>
      <Feedback state={state} />
      <Submit>
        {name ? "Save organization" : "Create organization"}
        <ArrowUpRight />
      </Submit>
    </form>
  );
}
function BusinessFields({ business }: { business?: Business }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Business name">
          <Input
            name="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={business?.name}
            placeholder="Business name"
          />
        </Field>
      </div>
      <Field label="Industry">
        <Input
          name="industry"
          required
          minLength={2}
          maxLength={100}
          defaultValue={business?.industry}
          placeholder="e.g. Commercial cleaning"
        />
      </Field>
      <Field label="Location">
        <Input
          name="location"
          required
          minLength={2}
          maxLength={160}
          defaultValue={business?.location}
          placeholder="City, state"
        />
      </Field>
      <Field label="Website">
        <Input
          name="website"
          type="url"
          maxLength={2048}
          defaultValue={business?.website ?? ""}
          placeholder="https://"
        />
      </Field>
      <Field label="Contact page">
        <Input
          name="contact_page"
          type="url"
          maxLength={2048}
          defaultValue={business?.contact_page ?? ""}
          placeholder="https://…/contact"
        />
      </Field>
      <Field label="Public business email">
        <Input
          name="email"
          type="email"
          maxLength={254}
          defaultValue={business?.email ?? ""}
          placeholder="hello@company.com"
        />
      </Field>
      <Field label="Public business phone">
        <Input
          name="phone"
          type="tel"
          maxLength={40}
          defaultValue={business?.phone ?? ""}
          placeholder="Business phone"
        />
      </Field>
      <div className="sm:col-span-2">
        <Field
          label="Public social URLs"
          hint="One full URL per line, up to 10. Only record permitted public information."
        >
          <Textarea
            name="social_urls"
            maxLength={20000}
            defaultValue={
              Array.isArray(business?.social_urls)
                ? business.social_urls.join("\n")
                : ""
            }
            placeholder="https://…"
          />
        </Field>
      </div>
    </div>
  );
}
export function ProspectForm() {
  const [state, action] = useActionState(createProspect, {});
  return (
    <form action={action} className="space-y-8">
      <BusinessFields />
      <div className="border-t border-border pt-7">
        <h2 className="mb-5 text-lg font-medium">Source & opportunity</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="Source URL"
              hint="Record where you found the business. The time of entry is saved automatically."
            >
              <Input
                name="source_url"
                type="url"
                maxLength={2048}
                placeholder="https://"
              />
            </Field>
          </div>
          <Field
            label="Estimated contract value (USD)"
            hint="Your estimate, not booked revenue."
          >
            <Input
              name="estimated_value_cents"
              inputMode="decimal"
              placeholder="e.g. 3000"
            />
          </Field>
          <Field label="Next follow-up">
            <Input name="next_follow_up" type="date" />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Source notes"
              hint="Separate what you observed from what you assume. No private customer data."
            >
              <Textarea
                name="source_notes"
                maxLength={2000}
                placeholder="Where did this opportunity come from?"
              />
            </Field>
          </div>
        </div>
      </div>
      <Feedback state={state} />
      <Submit>
        <Plus />
        Add to pipeline
      </Submit>
    </form>
  );
}
export function LeadForm({ lead }: { lead: Lead }) {
  const [state, action] = useActionState(updateLead, {});
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={lead.id} />
      <Field label="Pipeline status">
        <Select name="status" defaultValue={lead.status}>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </Field>
      <Field label="Estimated contract value (USD)">
        <Input
          name="estimated_value_cents"
          inputMode="decimal"
          defaultValue={
            lead.estimated_value_cents === null
              ? ""
              : lead.estimated_value_cents / 100
          }
        />
      </Field>
      <Field label="Next follow-up">
        <Input
          name="next_follow_up"
          type="date"
          defaultValue={lead.next_follow_up ?? ""}
        />
      </Field>
      <Feedback state={state} />
      <Submit>Save lead</Submit>
    </form>
  );
}
export function BusinessForm({ business }: { business: Business }) {
  const [state, action] = useActionState(updateBusiness, {});
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={business.id} />
      <BusinessFields business={business} />
      <Feedback state={state} />
      <Submit>Save business</Submit>
    </form>
  );
}
export function NoteForm({ leadId }: { leadId: string }) {
  const [state, action] = useActionState(addNote, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lead_id" value={leadId} />
      <Field label="Add a note">
        <Textarea
          name="body"
          required
          maxLength={5000}
          placeholder="Research, call notes, or the next useful action…"
        />
      </Field>
      <Feedback state={state} />
      <Submit>Add note</Submit>
    </form>
  );
}
