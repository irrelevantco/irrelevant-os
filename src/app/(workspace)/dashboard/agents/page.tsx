import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireContext } from "@/lib/context";
import { assistantQuerySchema } from "@/lib/assistant";
import { engineStateSchema, THREAD_READ_SCOPE } from "@/lib/engine/contracts";
import { connection } from "@/lib/acquisition/google";
import { SENDER_EMAIL } from "@/lib/acquisition/contracts";
import { researchLead, growthReview } from "@/lib/research-data";
import { missingDatabaseMigration } from "@/lib/database-failure";
import { AssistantWindow } from "@/components/assistant/window";
import { PageHeading } from "@/components/page-heading";
import { DatabaseUpdate } from "@/components/database-update";
import {
  AgentControl,
  AgentSettingsForm,
  QueueForm,
  AcceptProposal,
} from "@/components/agents/forms";
import { DiscoveryChoices } from "@/components/assistant/discovery";
import {
  EngineSettingsForm,
  EngineButtons,
  QueueResearchForm,
  ApplyResearchForm,
} from "@/components/engine/forms";
import { CampaignPanel } from "@/components/engine/campaign-panel";
import { ReviewForm, ApprovalForm } from "@/components/research/review-form";
import { CsvImportForm } from "@/components/research/import-form";
import { MeetingForm } from "@/components/acquisition/forms";
import { Button } from "@/components/ui/button";
import { dateTime } from "@/lib/utils";
export const metadata = { title: "iR Agent" };
export default async function Agent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = assistantQuerySchema.parse(await searchParams);
  const { db, organization, role } = await requireContext();
  let jobQuery = db
    .from("agent_jobs")
    .select("*")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (query.lead && ["research", "email"].includes(query.task))
    jobQuery = jobQuery.eq("lead_id", query.lead);
  const [settings, jobs, leads, engine, capability, total, google] =
    await Promise.all([
      db
        .from("agent_settings")
        .select("*")
        .eq("organization_id", organization.id)
        .maybeSingle(),
      jobQuery,
      db
        .from("leads")
        .select("id,status,business:businesses!inner(name)", { count: "exact" })
        .eq("organization_id", organization.id)
        .not("status", "in", "(Won,Lost,Suppressed)")
        .order("research_priority")
        .order("id")
        .range((query.page - 1) * 50, query.page * 50 - 1),
      db.rpc("engine_state", { org: organization.id }),
      db.rpc("assistant_schedule", { org: organization.id }),
      db.rpc("crm_summary", { org: organization.id }),
      role === "owner" ? connection(db, organization.id) : null,
    ]);
  if (
    [
      settings.error,
      jobs.error,
      leads.error,
      engine.error,
      capability.error,
    ].some(missingDatabaseMigration)
  )
    return <DatabaseUpdate />;
  if (
    settings.error ||
    jobs.error ||
    leads.error ||
    engine.error ||
    capability.error ||
    total.error
  )
    throw Error(
      "The assistant could not load your workspace. Check the database connection.",
    );
  const state = engineStateSchema.parse(engine.data),
    owner = role === "owner";
  const selected = query.lead ? await researchLead(query.lead) : null;
  const selectedReview =
    selected && query.task === "research"
      ? await growthReview(selected.id)
      : null;
  const list = (leads.data ?? []).map((l) => ({
    id: l.id,
    name: l.business.name,
  }));
  const sender = {
    name: settings.data?.sender_name ?? "",
    email: settings.data?.sender_email ?? "",
    address: settings.data?.postal_address ?? "",
  };
  const canActivate = Boolean(
    owner &&
    state.settings?.enabled &&
    !state.paused &&
    sender.name &&
    sender.address &&
    sender.email.toLowerCase() === SENDER_EMAIL &&
    google?.scopes.includes(THREAD_READ_SCOPE) &&
    google.scopes.includes("https://www.googleapis.com/auth/gmail.send"),
  );
  const paid = Number(process.env.AI_MAX_CALL_USD),
    paidCap = Number.isFinite(paid) && paid > 0 && paid <= 1 ? paid : null;
  const choose = (
    <div className="space-y-3">
      <form
        method="get"
        action="/dashboard/agents"
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="task" value={query.task} />
        <input type="hidden" name="page" value={query.page} />
        <label className="grid min-w-0 flex-1 gap-2 text-sm">
          Choose a business
          <select
            name="lead"
            defaultValue={query.lead ?? ""}
            required
            className="min-w-0 rounded-lg border border-border bg-card p-3 text-base"
          >
            <option value="">Choose from this page</option>
            {selected && !list.some((l) => l.id === selected.id) && (
              <option value={selected.id}>{selected.business.name}</option>
            )}
            {list.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Choose business</Button>
      </form>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          Page {query.page} · {(leads.count ?? 0).toLocaleString()} open
          businesses
        </span>
        {query.page > 1 && (
          <Link
            className="underline"
            href={`/dashboard/agents?task=${query.task}&page=${query.page - 1}`}
          >
            Previous 50
          </Link>
        )}
        {query.page * 50 < (leads.count ?? 0) && (
          <Link
            className="underline"
            href={`/dashboard/agents?task=${query.task}&page=${query.page + 1}`}
          >
            Next 50
          </Link>
        )}
      </div>
    </div>
  );
  return (
    <>
      <PageHeading
        eyebrow="Your workspace / Guided operations"
        title="Choose the work. Keep control."
        description="A choice-based assistant for the workflows already in your workspace. Built-in guidance uses rules, with no chat-model usage fee."
      />
      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <p>
          {Number((total.data as { total: number }).total).toLocaleString()}{" "}
          active leads
        </p>
        <p>{state.paused ? "Agents paused" : "Preparation enabled"}</p>
        <p>
          Campaign:{" "}
          {state.settings?.campaign_until &&
          new Date(state.settings.campaign_until) > new Date() &&
          !state.paused
            ? "Approved policy"
            : "Not active"}
        </p>
      </div>
      <AssistantWindow task={query.task} lead={query.lead}>
        {!owner && (
          <p className="text-sm text-muted-foreground">
            The workspace owner runs agents and approves external actions. You
            can review your organization’s records.
          </p>
        )}
        {query.task === "home" && (
          <div className="space-y-5">
            <p className="text-sm leading-7 text-muted-foreground">
              Start with a list, research the evidence, then prepare outreach.
              An app update does not add businesses automatically: import your
              prospect CSV to increase the live count.
            </p>
            <div className="flex flex-wrap gap-3">
              {owner && settings.data?.paused !== false && (
                <AgentControl kind="resume" />
              )}
              {owner && <AgentControl kind="run" />}
              <Button asChild variant="outline">
                <Link href="/dashboard/agents?task=imports">
                  Import my prospects
                </Link>
              </Button>
            </div>
            <p className="text-xs leading-6 text-muted-foreground">
              Selected tasks open below. Review sources and exact messages
              before approval. Optional provider/model costs are shown in their
              settings; the guide itself makes no model calls.
            </p>
          </div>
        )}
        {query.task === "discover" && owner && (
          <div className="space-y-6">
            <DiscoveryChoices requestKey={randomUUID()} />
            <AgentControl kind="run" />
            <p className="text-xs text-muted-foreground">
              Completed searches appear in Work & approvals and Imports for
              review.
            </p>
          </div>
        )}
        {(query.task === "research" || query.task === "email") && (
          <div className="space-y-6">
            {choose}
            {selected && (
              <>
                <h3 className="text-lg">{selected.business.name}</h3>
                {owner && (
                  <QueueForm
                    requestKey={randomUUID()}
                    leads={[{ id: selected.id, name: selected.business.name }]}
                    defaultLead={selected.id}
                    defaultKind={
                      query.task === "email"
                        ? "outreach_draft"
                        : "research_plan"
                    }
                  />
                )}{" "}
                {owner && query.task === "research" && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Public-web review requires the enabled local engine.
                      Choose Automation & timing to enable it, then queue a
                      review. Its observations remain unverified.
                    </p>
                    <QueueResearchForm
                      leadId={selected.id}
                      requestKey={randomUUID()}
                    />
                  </>
                )}
                {owner && <AgentControl kind="run" />}
                {query.task === "email" &&
                  jobs.data
                    ?.filter(
                      (j) =>
                        j.status === "succeeded" &&
                        !j.approved_at &&
                        j.result &&
                        typeof j.result === "object" &&
                        !Array.isArray(j.result) &&
                        typeof j.result.email_draft === "string",
                    )
                    .map((j) => (
                      <div
                        key={j.id}
                        className="rounded border border-border p-4"
                      >
                        <h4 className="text-sm">
                          Proposed email · needs your review
                        </h4>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">
                          {(j.result as { email_draft: string }).email_draft}
                        </p>
                        {owner && <AcceptProposal job={j.id} />}
                      </div>
                    ))}
                {query.task === "email" && (
                  <Button asChild>
                    <Link href={`/dashboard/outreach/${selected.id}`}>
                      Review full email and sending approval
                    </Link>
                  </Button>
                )}
                {selectedReview && (
                  <>
                    <ReviewForm
                      review={selectedReview.review}
                      points={selectedReview.points}
                    />
                    {owner && (
                      <ApprovalForm
                        review={selectedReview.review}
                        canApprove={selectedReview.points.some(
                          (p) =>
                            p.verification_status === "verified" &&
                            !!p.source_url &&
                            !!p.observation.trim(),
                        )}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
        {query.task === "automation" && owner && (
          <div className="space-y-6">
            <p className="text-sm leading-7 text-muted-foreground">
              Choose a weekday window and check frequency, then select discovery
              and/or research. Saving these controls pauses the previous email
              policy. Automatic emails need the separate campaign approval step.
              Processing requires an open, signed-in Windows app or web
              workspace; a sleeping free host or closed Safari does not run an
              always-on worker.
            </p>
            <EngineSettingsForm settings={state.settings} paidCap={paidCap} />
            <EngineButtons />
          </div>
        )}
        {query.task === "campaign" && owner && (
          <CampaignPanel
            state={state}
            sender={sender}
            canActivate={canActivate}
          />
        )}
        {query.task === "meetings" && (
          <div className="space-y-6">
            <h3 className="text-base">Latest recorded replies</h3>
            {!state.replies.length && (
              <p className="text-sm text-muted-foreground">
                No tracked replies recorded. Connect Gmail reply permission and
                activate a policy to synchronize conversations.
              </p>
            )}
            {state.replies.slice(0, 5).map((r) => (
              <div key={r.id} className="border-b border-border pb-4">
                <p className="text-sm">
                  {r.business_name} · {r.classification}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {r.body}
                </p>
              </div>
            ))}
            {owner && (
              <>
                <h3 className="text-base">Record an actual agreed time</h3>
                {choose}
                <MeetingForm
                  requestKey={randomUUID()}
                  leads={
                    selected
                      ? [{ id: selected.id, name: selected.business.name }]
                      : list
                  }
                />
              </>
            )}
            <Link
              className="text-sm text-primary underline"
              href="/dashboard/schedule"
            >
              Review appointments and Google Calendar outcomes
            </Link>
          </div>
        )}
        {query.task === "imports" && (
          <div className="space-y-6">
            {owner && <CsvImportForm />}
            <div className="flex flex-wrap gap-5 text-sm text-primary underline">
              <Link href="/dashboard/converter">
                Convert XLSX, CSV or other spreadsheet templates
              </Link>
              <Link href="/dashboard/imports">Review import results</Link>
              <a href="/api/engine/inventory">Download the real count report</a>
            </div>
            <p className="text-xs leading-6 text-muted-foreground">
              CSV preview supports up to 2,000 rows / 1 MB. Confirmation imports
              Discovered prospects and skips duplicates. Employee/payroll
              conversion does not create a payroll processing system.
            </p>
          </div>
        )}
        {query.task === "identity" && owner && (
          <div className="space-y-6">
            <AgentSettingsForm settings={settings.data} />
            <Link
              className="text-sm text-primary underline"
              href="/dashboard/connections"
            >
              Connect or renew Google permissions
            </Link>
          </div>
        )}
        {query.task === "pause" && owner && <AgentControl kind="stop" />}
        {query.task === "activity" && (
          <div className="space-y-5">
            {owner && <AgentControl kind="run" />}
            {!jobs.data?.length && (
              <p className="text-sm text-muted-foreground">
                No jobs recorded yet.
              </p>
            )}
            {jobs.data?.map((j) => (
              <article
                key={j.id}
                className="rounded-lg border border-border p-4"
              >
                <p className="text-sm">
                  {j.kind.replaceAll("_", " ")} · {j.status}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {dateTime(j.created_at)}
                </p>
                {j.error && (
                  <p role="alert" className="mt-3 text-sm text-red-300">
                    {j.error}
                  </p>
                )}
                {j.result && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-primary">
                      Review recorded output
                    </summary>
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">
                      {JSON.stringify(j.result, null, 2)}
                    </pre>
                  </details>
                )}
                {owner &&
                  j.kind === "research_audit" &&
                  j.status === "succeeded" &&
                  !j.approved_at && <ApplyResearchForm jobId={j.id} />}{" "}
                {j.lead_id && (
                  <Link
                    className="mt-3 inline-block text-sm text-primary underline"
                    href={`/dashboard/outreach/${j.lead_id}`}
                  >
                    Review prospect and saved email
                  </Link>
                )}
              </article>
            ))}
            <Link
              className="text-sm text-primary underline"
              href="/dashboard/agents/advanced"
            >
              Full job proposals and advanced controls
            </Link>
          </div>
        )}
      </AssistantWindow>
      <div className="mt-5 flex flex-wrap gap-5 text-xs text-muted-foreground underline">
        <Link href="/dashboard/agents/advanced">
          Advanced preparation controls
        </Link>
        <Link href="/dashboard/engine">Full engine diagnostics</Link>
        <Link href="/dashboard/connections">Connections</Link>
      </div>
    </>
  );
}
