import { randomUUID } from "node:crypto";
import { SendEmailForm } from "@/components/acquisition/forms";
import { messageBody } from "@/lib/acquisition/contracts";
import { connection } from "@/lib/acquisition/google";
import Link from "next/link";
import { requireContext } from "@/lib/context";
import { researchLead, growthReview } from "@/lib/research-data";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { OutreachDraftForm } from "@/components/research/review-form";
import { initialOutreach, PILLARS } from "@/lib/reviews";
import { ContactEventForm } from "@/components/agents/forms";
import { missingDatabaseMigration } from "@/lib/database-failure";
import { DatabaseUpdate } from "@/components/database-update";
export const metadata = { title: "Draft preparation" };
export default async function Preparation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await researchLead(id);
  const [{ review, points }, { db, organization, role }] = await Promise.all([
    growthReview(id),
    requireContext(),
  ]);
  const result = await db
    .from("outreach_drafts")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("lead_id", id)
    .single();
  if (result.error) throw new Error("Could not load outreach draft.");
  const events = await db
    .from("contact_events")
    .select("id,kind,occurred_at,note")
    .eq("organization_id", organization.id)
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (missingDatabaseMigration(events.error)) return <DatabaseUpdate />;
  if (events.error)
    throw new Error(
      "Could not load contact history. Apply the agent migration.",
    );
  const [settings, controls] = await Promise.all([
    db
      .from("agent_settings")
      .select("*")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    db.rpc("acquisition_state", { org: organization.id }),
  ]);
  if (missingDatabaseMigration(controls.error)) return <DatabaseUpdate />;
  const google =
    role === "owner" ? await connection(db, organization.id) : null;
  let approvedBody = "";
  try {
    approvedBody = messageBody(
      result.data.email_draft,
      settings.data?.sender_name ?? "",
      settings.data?.postal_address ?? "",
    );
  } catch {}
  const sendingSettings = controls.data as {
    settings?: { sending_enabled?: boolean };
  } | null;
  const canSend = Boolean(
    google &&
    sendingSettings?.settings?.sending_enabled &&
    !settings.data?.paused &&
    review.approved_at &&
    approvedBody &&
    lead.business.email &&
    settings.data?.sender_email.toLowerCase() ===
      "contact.irrelevantcollective@gmail.com",
  );
  const draft = result.data.email_draft
    ? result.data
    : {
        ...result.data,
        ...initialOutreach(
          lead.business.name,
          lead.business.industry,
          lead.business.location,
        ),
      };
  return (
    <>
      <Link
        href="/dashboard/outreach"
        className="mb-5 inline-block text-xs text-muted-foreground underline"
      >
        ← Outreach preparation
      </Link>
      <PageHeading
        eyebrow="Outreach / Exact-message approval"
        title={lead.business.name}
        description="Prepare an introduction grounded in recorded evidence. Saved drafts and approved delivery attempts are tracked separately."
        action={<StatusBadge status={lead.status} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="min-w-0 p-5 sm:p-7">
          <div className="mb-6">
            <Badge>Draft status enforced</Badge>
          </div>
          <OutreachDraftForm draft={draft} followUp={lead.next_follow_up} />
          {role === "owner" && (
            <section className="mt-8 space-y-4 border-t border-border pt-6">
              <h2 className="text-lg">Send a separately approved email</h2>
              <p className="text-xs leading-6 text-muted-foreground">
                Save your draft above first. This approval uses the saved
                version shown below. Google sending permission, enabled
                controls, sender identity, a public recipient and an approved
                sourced review are required. Maximum five attempts per day.
                Replies and opt-outs currently need manual logging.
              </p>
              {approvedBody && lead.business.email ? (
                <SendEmailForm
                  leadId={id}
                  draftAt={result.data.updated_at}
                  requestKey={randomUUID()}
                  recipient={lead.business.email}
                  body={approvedBody}
                  enabled={canSend}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Save a draft, public contact email and sender/postal details
                  to prepare an approval.
                </p>
              )}
              <Link
                href="/dashboard/connections"
                className="inline-block text-sm text-primary underline"
              >
                Google connection and delivery history
              </Link>
            </section>
          )}
          <section className="mt-8 border-t border-border pt-6">
            <h2 className="mb-4 text-lg">Actual contact history</h2>
            <p className="mb-4 text-xs leading-6 text-muted-foreground">
              Manually record conversations that took place outside this
              application. Drafts do not count as outreach. Replies stop
              follow-up preparation; opt-outs persist on the suppression list.
            </p>
            <ContactEventForm lead={id} />
            <ul className="mt-5 space-y-4">
              {events.data.map((e) => (
                <li key={e.id} className="border-t border-border pt-3 text-xs">
                  <p>
                    {e.kind.replaceAll("_", " ")} / {e.occurred_at.slice(0, 10)}{" "}
                    / manually logged
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
                    {e.note}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </Card>
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-base">Public contact information</h2>
            <dl className="space-y-3 text-sm">
              {[
                ["Email", lead.business.email],
                ["Phone", lead.business.phone],
                ["Website", lead.business.website],
                ["Location", lead.business.location],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words">
                    {value ?? "Not recorded"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs leading-6 text-muted-foreground">
              Supplied contact information has not been independently verified.
              Confirm the correct recipient before future outreach.
            </p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base">Three-point review</h2>
              <Link
                href={`/dashboard/research/${id}`}
                className="text-xs text-primary underline"
              >
                Edit review
              </Link>
            </div>
            <p className="my-4 text-xs text-muted-foreground">
              {review.approved_at
                ? "Manually approved review version"
                : "Awaiting manual approval · version"}{" "}
              {review.revision}
            </p>
            <div className="space-y-5">
              {PILLARS.map((pillar) => {
                const p = points.find((point) => point.pillar === pillar)!;
                return (
                  <section key={p.id} className="border-t border-border pt-4">
                    <h3 className="text-sm font-medium">{pillar}</h3>
                    <Badge className="mt-2">
                      {p.verification_status} · {p.confidence} confidence
                    </Badge>
                    <p className="mt-3 whitespace-pre-wrap text-xs leading-6">
                      {p.observation ||
                        "No observation recorded. Research required."}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                      Recommendation:{" "}
                      {p.recommendation || "Not yet supported by research."}
                    </p>
                    {p.source_url && (
                      <a
                        href={p.source_url}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="mt-3 block break-all text-xs text-primary underline"
                      >
                        {p.source_url}
                      </a>
                    )}
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Last researched:{" "}
                      {p.last_researched_date ?? "Not researched"}
                    </p>
                  </section>
                );
              })}
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="text-xs text-muted-foreground">
                Suggested service offer
              </h3>
              <p className="mt-2 text-sm">
                {review.suggested_offer ||
                  "Research and scope discussion required."}
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground">
                A suggestion is not a confirmed budget or signed scope.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
