import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  Globe,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { requireContext } from "@/lib/context";
import type { Lead } from "@/lib/data";
import { dateTime } from "@/lib/utils";
import { BusinessForm, LeadForm, NoteForm } from "@/components/forms";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LeadItem, LeadMenuButton } from "@/components/lead-actions";
export const metadata = { title: "Lead details" };
export default async function LeadDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { db, organization, user, role } = await requireContext();
  const [result, notesResult] = await Promise.all([
    db
      .from("leads")
      .select("*, business:businesses!inner(*)")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    db
      .from("lead_notes")
      .select("*")
      .eq("lead_id", id)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (result.error || notesResult.error)
    throw new Error("Could not load this lead.");
  if (!result.data) notFound();
  const lead = result.data as Lead;
  const b = lead.business;
  const notes = notesResult.data ?? [];
  return (
    <>
      <div className="mb-5 flex gap-5 text-xs text-primary">
        <Link className="underline" href={`/dashboard/research/${id}`}>
          Growth Review
        </Link>
        <Link className="underline" href={`/dashboard/outreach/${id}`}>
          Outreach preparation
        </Link>
      </div>
      <Link
        href="/dashboard/leads"
        className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        All leads
      </Link>
      <PageHeading
        eyebrow={`${b.industry} / ${b.location}`}
        title={b.name}
        description={`Added ${dateTime(lead.created_at)} · Source: ${b.source_type}`}
        action={
          <LeadItem
            lead={{ id: lead.id, name: b.name, updatedAt: lead.updated_at }}
            canDelete={role === "owner"}
            returnTo="/dashboard/leads"
            className="flex items-center gap-2"
          >
            <StatusBadge status={lead.status} />
            <LeadMenuButton />
          </LeadItem>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-6">
            <h2 className="mb-5 text-base font-medium">Business at a glance</h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              {[
                [Globe, "Website", b.website],
                [Mail, "Public email", b.email],
                [Phone, "Public phone", b.phone],
                [MapPin, "Location", b.location],
              ].map(([Icon, label, value]) => {
                const I = Icon as typeof Globe;
                const v = value as string | null;
                return (
                  <div key={label as string} className="flex items-start gap-3">
                    <I
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">
                        {label as string}
                      </dt>
                      <dd className="mt-1 break-words">
                        {v ? (
                          label === "Website" ? (
                            <a
                              href={v}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline"
                            >
                              {v}
                              <ArrowUpRight className="ml-1 inline size-3" />
                            </a>
                          ) : (
                            v
                          )
                        ) : (
                          "Not recorded"
                        )}
                      </dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          </Card>
          <Card className="p-6">
            <h2 className="mb-2 text-base font-medium">
              Research & conversation
            </h2>
            <p className="mb-6 text-xs leading-5 text-muted-foreground">
              Record evidence, decisions, and useful next steps. Notes are
              append-only; add a correction when needed.
            </p>
            <NoteForm leadId={lead.id} />
            <div className="mt-7 space-y-4">
              {notes.length ? (
                notes.map((n) => (
                  <article
                    key={n.id}
                    className="rounded-md border border-border bg-background/40 p-4"
                  >
                    <p className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock3 className="size-3" />
                      {dateTime(n.created_at)} ·{" "}
                      {n.created_by === user.id
                        ? "You"
                        : `Member ${n.created_by.slice(0, 8)}`}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">
                      {n.body}
                    </p>
                  </article>
                ))
              ) : (
                <p className="py-3 text-xs text-muted-foreground">
                  No notes yet. The context you add here helps the next
                  conversation.
                </p>
              )}
              {notes.length === 100 && (
                <p className="text-xs text-muted-foreground">
                  Showing the latest 100 notes.
                </p>
              )}
            </div>
          </Card>
          <Card className="p-6">
            <details>
              <summary className="cursor-pointer text-base font-medium">
                Edit business information
              </summary>
              <div className="pt-6">
                <BusinessForm business={b} />
              </div>
            </details>
          </Card>
        </div>
        <aside className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-5 text-base font-medium">Next move</h2>
            <LeadForm lead={lead} />
            <p className="mt-5 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground">
              Pipeline updates record your progress. They do not send outreach,
              deliver an audit, or verify a contract or payment.
            </p>
          </Card>
          <Card className="p-6">
            <p className="eyebrow mb-4 text-muted-foreground">
              Source provenance
            </p>
            <p className="text-xs leading-6 text-muted-foreground">
              Recorded manually on {dateTime(b.source_observed_at)}. Treat
              unverified details as observations until checked.
            </p>
            {b.source_url && (
              <a
                href={b.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex break-all text-xs text-primary underline"
              >
                View original source ↗
              </a>
            )}
            {b.source_notes && (
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6">
                {b.source_notes}
              </p>
            )}
            <p className="mt-5 text-[10px] leading-5 text-muted-foreground">
              Original provenance is retained when contact details change.
              Record new evidence in a dated note.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
