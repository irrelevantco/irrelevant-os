import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireContext } from "@/lib/context";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AgentSettingsForm,
  QueueForm,
  DiscoveryForm,
  AgentControl,
  AcceptProposal,
} from "@/components/agents/forms";
import { z } from "zod";
export const metadata = { title: "Agent control" };
const proposal = z.object({ email_draft: z.string(), call_script: z.string() });
export default async function Agents() {
  const { db, organization, role } = await requireContext();
  const [settings, jobs, leads, suppressed] = await Promise.all([
    db
      .from("agent_settings")
      .select("*")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    db
      .from("agent_jobs")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("leads")
      .select("id,business:businesses!inner(name)")
      .eq("organization_id", organization.id)
      .not("status", "in", "(Won,Lost,Suppressed)")
      .order("research_priority")
      .limit(500),
    db
      .from("suppression_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id),
  ]);
  if (settings.error || jobs.error || leads.error || suppressed.error)
    throw new Error("Could not load agent control. Apply the agent migration.");
  const owner = role === "owner";
  const list = jobs.data ?? [];
  return (
    <>
      <PageHeading
        eyebrow="Operations / Controlled preparation"
        title="Work worth approving."
        description="Research plans, evidence-based introductions, follow-up drafts and optional provider discovery. Nothing sends email, publishes content or changes billing."
        action={
          <Badge>
            {settings.data?.paused === false
              ? "Preparation enabled"
              : "Agents paused"}
          </Badge>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Queued / latest 50</p>
          <p className="editorial mt-2 text-3xl">
            {list.filter((j) => j.status === "queued").length}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">
            Draft approvals / latest 50
          </p>
          <p className="editorial mt-2 text-3xl">
            {
              list.filter(
                (j) =>
                  j.status === "succeeded" &&
                  !j.approved_at &&
                  ["outreach_draft", "follow_up"].includes(j.kind),
              ).length
            }
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">
            Suppressed businesses / all records
          </p>
          <p className="editorial mt-2 text-3xl">{suppressed.count ?? 0}</p>
        </Card>
      </div>
      {owner && (
        <>
          <div className="mb-6 flex flex-wrap gap-4">
            <AgentControl kind="run" />
            <AgentControl kind="stop" />
          </div>
          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <Card className="min-w-0 p-5 sm:p-7">
              <h2 className="mb-5 text-lg">Preparation queue</h2>
              <QueueForm
                requestKey={randomUUID()}
                leads={(leads.data ?? []).map((l) => ({
                  id: l.id,
                  name: l.business.name,
                }))}
              />
            </Card>
            <Card className="min-w-0 p-5 sm:p-7">
              <h2 className="mb-5 text-lg">Find fitting businesses</h2>
              <DiscoveryForm
                requestKey={randomUUID()}
                configured={Boolean(process.env.EXPLEE_API_KEY)}
              />
            </Card>
            <Card className="min-w-0 p-5 sm:p-7 xl:col-span-2">
              <h2 className="mb-5 text-lg">Limits and identity</h2>
              <AgentSettingsForm settings={settings.data} />
              <p className="mt-4 text-xs leading-6 text-muted-foreground">
                The built-in preparation provider uses deterministic rules and
                recorded evidence, with no model fees. Jobs run only through an
                authenticated owner session. Unattended scheduled processing is
                not enabled. Explee calls are not automatically retried,
                including timeouts. Allowances reserve the documented credit
                cost; unexpected charges pause further work.
              </p>
            </Card>
          </div>
        </>
      )}
      <h2 className="mb-5 text-lg">Job history and proposals</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Latest 50 jobs. Provider charges below are credits reported by the
        provider, not a USD estimate. Failed searches may have been charged;
        reserved credits remain consumed for the day.
      </p>
      <div className="space-y-5">
        {!list.length && (
          <Card className="p-6 text-sm text-muted-foreground">
            No jobs yet. Configure limits and queue a research plan to begin.
          </Card>
        )}
        {list.map((j) => {
          const draft = proposal.safeParse(j.result);
          return (
            <Card key={j.id} className="min-w-0 p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base">{j.kind.replaceAll("_", " ")}</h3>
                <Badge>
                  {j.status}
                  {j.approved_at ? " / accepted as draft" : ""}
                </Badge>
              </div>
              <p className="mt-2 break-all text-[11px] text-muted-foreground">
                {j.id} · attempts {j.attempts}/3 · reserved {j.reserved_credits}{" "}
                credits · charged {j.charged_credits ?? "not reported"}
              </p>
              {j.lead_id && (
                <Link
                  href={`/dashboard/outreach/${j.lead_id}`}
                  className="mt-3 inline-block text-xs text-primary underline"
                >
                  Open prospect preparation
                </Link>
              )}
              {j.approved_at && (
                <p role="status" className="mt-4 text-sm text-primary">
                  Proposal copied into the editable draft. No sending was
                  authorized.
                </p>
              )}
              {j.error && (
                <p className="mt-4 text-sm text-red-300">{j.error}</p>
              )}
              {j.result && (
                <details
                  className="mt-5"
                  open={j.status === "succeeded" && !j.approved_at}
                >
                  <summary className="cursor-pointer text-sm text-primary">
                    Review output
                  </summary>
                  {draft.success ? (
                    <div className="mt-4 space-y-5">
                      <p className="whitespace-pre-wrap break-words text-sm leading-7">
                        {draft.data.email_draft}
                      </p>
                      <p className="whitespace-pre-wrap break-words border-t border-border pt-4 text-sm leading-7">
                        {draft.data.call_script}
                      </p>
                    </div>
                  ) : (
                    <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">
                      {JSON.stringify(j.result, null, 2)}
                    </pre>
                  )}
                </details>
              )}
              {owner &&
                draft.success &&
                j.status === "succeeded" &&
                !j.approved_at && <AcceptProposal job={j.id} />}
              <div className="mt-4">
                {owner &&
                  j.kind === "discovery" &&
                  j.status === "succeeded" && (
                    <AgentControl kind="preview" job={j.id} />
                  )}
                {owner && ["queued", "running"].includes(j.status) && (
                  <AgentControl kind="stop" job={j.id} />
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
