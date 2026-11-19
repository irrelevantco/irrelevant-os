import Link from "next/link";
import { CampaignForm } from "@/components/engine/forms";
import { Card } from "@/components/ui/card";
import { encodeApprovalBody, SENDER_EMAIL } from "@/lib/acquisition/contracts";
import type { EngineState } from "@/lib/engine/contracts";
export function CampaignPanel({state,sender,canActivate}: {state: EngineState;sender:{name:string;email:string;address:string};canActivate:boolean}) {
 const settings=state.settings;
 return (<Card className="min-w-0 space-y-6 p-5 sm:p-7">
            <h2 className="text-lg">
              Review automatic outreach before activation
            </h2>
            <div className="rounded border border-border p-4 text-sm leading-6">
              <p>
                Sender: <strong>{sender.name || "not configured"}</strong> ·{" "}
                {sender.email || "not configured"}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words">
                Postal address: {sender.address || "not configured"}
              </p>
              <Link
                href="/dashboard/agents"
                className="mt-3 inline-block text-primary underline"
              >
                Edit sender identity
              </Link>
            </div>
            <div className="space-y-4 text-xs leading-6 text-muted-foreground">
              <h3 className="text-sm font-medium text-foreground">
                Sourced-v1 template rules
              </h3>
              <p>
                The introduction addresses the saved business name, identifies
                the sender, and uses only the three manually verified
                observations, their source URLs, and reviewed recommendations.
                It can mention the approved suggested offer as an option for
                discussion. It asks whether a short conversation would be
                useful. It never asserts a budget, private results or a
                guaranteed improvement.
              </p>
              <details className="rounded border border-border p-4">
                <summary className="cursor-pointer text-foreground">
                  Read the full message templates
                </summary>
                <div className="mt-4 space-y-5 whitespace-pre-wrap">
                  <p>{`INTRODUCTION\nSubject: A three-point growth review / [business]\n\nHi [business] team,\n\nI’m [sender] with iRRELEVANT CO. I reviewed the public information below and put together a short growth review.\n\n[Each of the three verified pillars: observation, source URL, and possible next step.]\n\n[Optional approved offer] Scope and pricing would need a conversation.\n\nWould a short conversation about your priorities be useful?`}</p>
                  <p>{`FOLLOW-UP (maximum two, at least three days apart)\nHi [business] team,\n\nI’m following up on the three-point review I sent earlier. If this is useful, would you be open to a short conversation about your priorities? If it is not a fit, let me know and I’ll close the loop.`}</p>
                  <p>{`POSITIVE-REPLY ACKNOWLEDGEMENT\nHi [business] team,\n\nThanks for getting back to me. I’d be happy to learn more about your priorities. What day and time would suit a short call? I’m available Monday–Friday, 7 a.m.–3 p.m. Eastern Time. This does not reserve an appointment yet.`}</p>
                  <p>{`APPOINTMENT OFFER\nHi [business] team,\n\nThanks for your interest. Here are two available 30-minute options for a conversation about your priorities:\n\nOption 1: [checked date and time] Eastern Time\nOption 2: [checked date and time] Eastern Time\n\nPlease reply “Option 1” or “Option 2” to choose. I’ll check availability again and send a calendar invitation. If neither works, suggest another time and I’ll review it.`}</p>
                  <p>{`CONFIRMATION (only after Google confirms the event)\nHi [business] team,\n\nYour conversation with iRRELEVANT CO is confirmed for [agreed date and time] Eastern Time. A Google Calendar invitation has been requested.\n\nI look forward to learning about your priorities.`}</p>
                  <p>{`ALL MESSAGES END WITH\n${sender.name || "[sender name]"}\niRRELEVANT CO\n${SENDER_EMAIL}\n${sender.address || "[postal address]"}\n\nTo opt out of further contact, reply and let us know.`}</p>
                </div>
              </details>
              <p>
                A before B before C. Campaign eligibility requires all three
                pillars to have a verified observation, source, confidence and
                research date, plus the current owner’s review approval. Each
                message is checked again immediately before sending. A prior
                Gmail sent-message match puts an introduction on hold for manual
                review. No guessed emails or research hypotheses are inserted.
              </p>
              <p>
                Reply reading needs an additional Google read-only grant. The
                implementation checks changed message IDs and reads only
                CRM-tracked outbound conversations. Automated replies are
                ignored. Unclear requests, unconfirmed sender authenticity,
                conflicts, expired offers, delivery uncertainty and client
                negotiations are handed back to you.
              </p>
              <Link
                href="/dashboard/connections"
                className="text-primary underline"
              >
                Connect / renew Gmail reply permission
              </Link>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-medium">
                Current eligible message samples
              </h3>
              {state.preview.length ? (
                state.preview.map((message) => (
                  <details
                    key={message.recipient}
                    className="mb-3 rounded border border-border p-4"
                  >
                    <summary className="cursor-pointer break-words text-sm">
                      {message.business_name} · {message.recipient}
                    </summary>
                    <p className="mt-4 break-words text-xs">
                      Subject: {message.subject}
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-xs leading-6">
                      {message.body}
                    </pre>
                  </details>
                ))
              ) : (
                <p className="text-xs leading-6 text-muted-foreground">
                  No currently eligible messages. You can review the fixed
                  templates and policy now; later approved, fully verified
                  reviews may become eligible under that policy.
                </p>
              )}
            </div>
            <CampaignForm
              key={`${settings?.campaign_revision}:${settings?.campaign_until}:${canActivate}:${JSON.stringify(sender)}`}
              settings={settings}
              senderEnvelope={encodeApprovalBody(JSON.stringify(sender))}
              canActivate={canActivate}
            />
          </Card>);
}
