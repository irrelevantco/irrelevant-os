import { CampaignPanel } from "@/components/engine/campaign-panel";
import Link from "next/link";
import { z } from "zod";
import { requireContext } from "@/lib/context";
import { engineStateSchema, THREAD_READ_SCOPE } from "@/lib/engine/contracts";
import { connection } from "@/lib/acquisition/google";
import { SENDER_EMAIL } from "@/lib/acquisition/contracts";
import { missingDatabaseMigration } from "@/lib/database-failure";
import { dateTime } from "@/lib/utils";
import { InventoryCard } from "@/components/engine/inventory";
import {
  EngineSettingsForm,
  EngineButtons,
  ApplyResearchForm,
  ResolveDeliveryForm,
} from "@/components/engine/forms";
import { EngineRefresh } from "@/components/engine/refresh";
import { DatabaseUpdate } from "@/components/database-update";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
export const metadata = { title: "Acquisition engine" };
const proposalSchema = z.object({
  public_contacts: z
    .array(z.object({ email: z.email(), source_url: z.url() }))
    .max(5)
    .default([]),
  points: z
    .array(
      z.object({
        pillar: z.string(),
        observation: z.string(),
        recommendation: z.string(),
        source_url: z.string().url(),
      }),
    )
    .length(3),
  provider: z.string(),
  model: z.string().optional(),
  usage: z
    .object({
      input_tokens: z.number().nullable().optional(),
      output_tokens: z.number().nullable().optional(),
      estimated_cost_usd: z.number().nullable().optional(),
    })
    .optional(),
});
export default async function Engine() {
  const { db, organization, role } = await requireContext();
  const [result, schedule] = await Promise.all([
    db.rpc("engine_state", { org: organization.id }),
    db.rpc("assistant_schedule", { org: organization.id }),
  ]);
  if (missingDatabaseMigration(schedule.error)) return <DatabaseUpdate />;
  if (schedule.error) throw Error("Could not load automation timing.");
  if (missingDatabaseMigration(result.error)) return <DatabaseUpdate />;
  if (result.error) throw Error("Could not load the acquisition engine.");
  const state = engineStateSchema.parse(result.data),
    settings = state.settings;
  const [senderResult, summaryResult, google] = await Promise.all([
    db
      .from("agent_settings")
      .select("sender_name,sender_email,postal_address")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    db.rpc("crm_summary", { org: organization.id }),
    role === "owner" ? connection(db, organization.id) : null,
  ]);
  const total = z.object({ total: z.number() }).parse(summaryResult.data).total;
  const sender = {
    name: senderResult.data?.sender_name ?? "",
    email: senderResult.data?.sender_email ?? "",
    address: senderResult.data?.postal_address ?? "",
  };
  const active = Boolean(
    settings?.enabled &&
    settings.campaign_until &&
    new Date(settings.campaign_until) > new Date() &&
    !state.paused,
  );
  const canActivate = Boolean(
    settings?.enabled &&
    !state.paused &&
    sender.name &&
    sender.address &&
    sender.email.toLowerCase() === SENDER_EMAIL &&
    google?.scopes.includes(THREAD_READ_SCOPE) &&
    google.scopes.includes("https://www.googleapis.com/auth/gmail.send"),
  );
  const configuredCap = Number(process.env.AI_MAX_CALL_USD),
    paidCap =
      Number.isFinite(configuredCap) && configuredCap > 0 && configuredCap <= 1
        ? configuredCap
        : null;
  return (
    <>
      <EngineRefresh />
      <PageHeading
        eyebrow="Acquisition / Local engine"
        title="A considered path to more clients."
        description="Discover businesses, research public evidence, review the three pillars, and optionally authorize a bounded automatic campaign. Goals and estimates are distinct from actual replies, agreed meetings and signed work."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "Active leads / goal",
            `${total.toLocaleString()} / ${(settings?.target_leads ?? 1000).toLocaleString()}`,
          ],
          [
            "Gmail-confirmed sends / goal",
            `${state.sent.toLocaleString()} / ${(settings?.contact_goal ?? 10000).toLocaleString()}`,
          ],
          [
            "Attempts / rolling 24 hours",
            state.attempts_today.toLocaleString(),
          ],
          ["Automatic policy", active ? "Active" : "Paused / not approved"],
        ].map(([label, value]) => (
          <Card key={label} className="min-w-0 p-5">
            <h2 className="text-xs text-muted-foreground">{label}</h2>
            <p className="mt-5 break-words text-2xl tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
      <p className="mb-6 text-xs leading-6 text-muted-foreground">
        Last local heartbeat:{" "}
        {settings?.last_tick_at ? dateTime(settings.last_tick_at) : "not run"}.{" "}
        {settings?.campaign_until
          ? `Policy expires ${dateTime(settings.campaign_until)}. `
          : ""}
        Each heartbeat may prepare one job and process at most one automatic
        message. This screen refreshes every 15 seconds while visible and no
        form is focused. The app must remain open and signed in; there is no
        always-on hosted worker.
      </p>
      {settings?.last_error && (
        <Card
          role="alert"
          className="mb-6 border-red-400/40 p-5 text-sm text-red-300"
        >
          {settings.last_error}
        </Card>
      )}
      {role === "owner" && (
        <div className="mb-7">
          <EngineButtons />
        </div>
      )}
      <InventoryCard />
      {role === "owner" && (
        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <Card className="min-w-0 p-5 sm:p-7">
            <h2 className="mb-5 text-lg">Territory, goals and research</h2>
            <EngineSettingsForm settings={settings} paidCap={paidCap} />
          </Card>
          <CampaignPanel
            state={state}
            sender={sender}
            canActivate={canActivate}
          />
        </div>
      )}
      <Card className="mt-6 min-w-0 p-5 sm:p-7">
        <h2 className="mb-4 text-lg">Research queue / latest 15</h2>
        {!state.jobs.length && (
          <p className="text-sm text-muted-foreground">
            No engine research or discovery jobs yet. Save the controls and
            queue research from a business’s Growth Review, or enable the local
            runner.
          </p>
        )}
        <div className="divide-y divide-border">
          {state.jobs.map((job) => {
            const parsed = proposalSchema.safeParse(job.result);
            return (
              <article key={job.id} className="min-w-0 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="break-words text-sm">
                    {job.business_name ?? "Territory discovery"} ·{" "}
                    {job.kind.replaceAll("_", " ")}
                  </p>
                  <span className="text-xs text-primary">{job.status}</span>
                </div>
                {job.error && (
                  <p className="mt-3 text-xs text-red-300">{job.error}</p>
                )}
                {parsed.success && (
                  <details className="mt-4 rounded border border-border p-4">
                    <summary className="cursor-pointer text-xs">
                      Review the unverified proposal · {parsed.data.provider}
                      {parsed.data.model ? ` / ${parsed.data.model}` : ""}
                    </summary>
                    <div className="mt-4 space-y-5">
                      {parsed.data.points.map((point) => (
                        <div key={point.pillar}>
                          <h3 className="text-sm">{point.pillar}</h3>
                          <p className="mt-2 text-xs leading-6">
                            {point.observation}
                          </p>
                          <p className="mt-2 text-xs leading-6 text-muted-foreground">
                            Proposed next step: {point.recommendation}
                          </p>
                          <a
                            className="mt-2 inline-block break-all text-xs text-primary underline"
                            href={point.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Check source
                          </a>
                        </div>
                      ))}
                      {parsed.data.usage && (
                        <p className="text-xs text-muted-foreground">
                          Reported tokens:{" "}
                          {parsed.data.usage.input_tokens ?? "unavailable"} in /{" "}
                          {parsed.data.usage.output_tokens ?? "unavailable"}{" "}
                          out. Provider cost estimate:{" "}
                          {parsed.data.usage.estimated_cost_usd == null
                            ? "unavailable"
                            : `$${parsed.data.usage.estimated_cost_usd.toFixed(6)}`}
                          . This is not an invoice.
                        </p>
                      )}
                      {role === "owner" && !job.approved_at && (
                        <ApplyResearchForm
                          jobId={job.id}
                          contacts={parsed.data.public_contacts}
                        />
                      )}
                    </div>
                  </details>
                )}
                {job.lead_id && (
                  <Link
                    className="mt-3 inline-block text-xs text-primary underline"
                    href={`/dashboard/research/${job.lead_id}`}
                  >
                    Open editable Growth Review →
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      </Card>
      <Card className="mt-6 min-w-0 p-5 sm:p-7">
        <h2 className="mb-4 text-lg">Tracked business replies / latest 25</h2>
        {!state.replies.length && (
          <p className="text-sm text-muted-foreground">
            No tracked replies recorded. Connect the additional Gmail read-only
            permission and activate the campaign to synchronize eligible
            conversations.
          </p>
        )}
        {state.replies.map((reply) => (
          <article key={reply.id} className="border-t border-border py-5">
            <Link
              className="text-sm text-primary underline"
              href={`/dashboard/leads/${reply.lead_id}`}
            >
              {reply.business_name}
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              Bot classification: {reply.classification} ·{" "}
              {dateTime(reply.received_at)} ·{" "}
              {reply.handled_at ? "handled / handed off" : "awaiting action"}
            </p>
            <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-6">
              {reply.body}
            </p>
            {reply.error && (
              <p className="mt-3 text-xs text-red-300">{reply.error}</p>
            )}
          </article>
        ))}
      </Card>
      <Card className="mt-6 min-w-0 p-5 sm:p-7">
        <h2 className="mb-4 text-lg">
          Automatic outbox & unresolved mail / latest 20
        </h2>
        {!state.outbox.length && (
          <p className="text-sm text-muted-foreground">
            No automatic messages prepared. Research approval alone does not
            activate an email campaign.
          </p>
        )}
        {state.outbox.map((message) => (
          <details
            key={message.id}
            className="mb-3 min-w-0 rounded border border-border p-4"
          >
            <summary className="cursor-pointer break-words text-sm">
              {message.business_name} · {message.kind} · {message.status}
            </summary>
            <p className="mt-3 break-all text-xs">To: {message.recipient}</p>
            <p className="mt-2 break-words text-xs">
              Subject: {message.subject}
            </p>
            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-xs leading-6">
              {message.body}
            </pre>
            {message.error && (
              <p className="mt-3 text-xs text-red-300">{message.error}</p>
            )}
            {message.status === "unknown" && role === "owner" && (
              <ResolveDeliveryForm id={message.id} />
            )}
          </details>
        ))}
      </Card>
      {!!state.holds.length && (
        <Card className="mt-6 p-5 sm:p-7">
          <h2 className="mb-4 text-lg">
            Prospects needing manual contact review
          </h2>
          {state.holds.map((hold) => (
            <div key={hold.id} className="border-t border-border py-4">
              <Link
                className="text-sm text-primary underline"
                href={`/dashboard/outreach/${hold.id}`}
              >
                {hold.business_name}
              </Link>
              <p className="mt-2 break-words text-xs leading-6 text-muted-foreground">
                {hold.reason} The automatic introduction is held; review Gmail
                and use the exact-message manual workflow if appropriate.
              </p>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
