import Link from "next/link";
import { requireContext } from "@/lib/context";
import { researchLead, growthReview } from "@/lib/research-data";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewForm, ApprovalForm } from "@/components/research/review-form";
import { dateTime } from "@/lib/utils";
export const metadata = { title: "Three-Point Growth Review" };
export default async function Review({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await researchLead(id);
  const [{ review, points }, { role }] = await Promise.all([
    growthReview(id),
    requireContext(),
  ]);
  const canApprove = points.some(
    (p) =>
      p.verification_status === "verified" &&
      p.source_url &&
      p.observation.trim(),
  );
  return (
    <>
      <Link
        href="/dashboard/research"
        className="mb-5 inline-block text-xs text-muted-foreground underline"
      >
        ← Research queue
      </Link>
      <PageHeading
        eyebrow="Three-Point Growth Review"
        title={lead.business.name}
        description="Record what you actually observed, cite the source, and separate uncertainty from evidence."
        action={
          <Button asChild variant="outline">
            <Link href={`/dashboard/outreach/${id}`}>
              Prepare outreach draft
            </Link>
          </Button>
        }
      />
      {lead.audit_hypothesis_not_verified && (
        <Card className="mb-6 border-primary/25 p-5">
          <Badge>Supplied hypothesis · unverified</Badge>
          <p className="mt-4 text-sm">{lead.audit_hypothesis_not_verified}</p>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            A research prompt from the CSV. It is not a verified observation, a
            confirmed weakness, or evidence of budget. Research it independently
            before making any claim.
          </p>
        </Card>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="min-w-0 p-5 sm:p-7">
          <ReviewForm review={review} points={points} />
        </Card>
        <aside className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-base">Human approval</h2>
            {review.approved_at && (
              <p className="mb-5 text-xs leading-6 text-primary">
                Version {review.revision} approved{" "}
                {dateTime(review.approved_at)}. Editing the review invalidates
                this approval.
              </p>
            )}
            {role === "owner" ? (
              <ApprovalForm review={review} canApprove={canApprove} />
            ) : (
              <p className="text-sm text-muted-foreground">
                An organization owner must approve this review after research.
              </p>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-sm">Research standard</h2>
            <p className="text-xs leading-6 text-muted-foreground">
              Verification records a researcher’s manual attestation; the
              software does not independently validate website claims. One
              verified, sourced observation is the minimum readiness gate. Full
              review quality remains a human responsibility.
            </p>
            <Link
              href={`/dashboard/leads/${id}`}
              className="mt-4 block text-xs text-primary underline"
            >
              Business & CRM notes →
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
