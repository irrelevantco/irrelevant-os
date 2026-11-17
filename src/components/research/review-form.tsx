"use client";
import { useActionState } from "react";
import { approveReview, saveReview, saveDraft } from "@/app/prospect-actions";
import { PILLARS } from "@/lib/reviews";
import type { Database } from "@/lib/supabase/database.types";
import { Field, Submit } from "@/components/forms";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Feedback } from "./import-form";
type Review = Database["public"]["Tables"]["growth_reviews"]["Row"];
type Point = Database["public"]["Tables"]["growth_review_points"]["Row"];
type Draft = Database["public"]["Tables"]["outreach_drafts"]["Row"];
export function ReviewForm({
  review,
  points,
}: {
  review: Review;
  points: Point[];
}) {
  const [state, action] = useActionState(saveReview, {});
  return (
    <form action={action} className="space-y-7">
      <input type="hidden" name="lead_id" value={review.lead_id} />
      <input type="hidden" name="expected_revision" value={review.revision} />
      {PILLARS.map((pillar, i) => {
        const p = points.find((point) => point.pillar === pillar)!;
        return (
          <fieldset
            key={pillar}
            className="space-y-5 rounded-lg border border-border p-5"
          >
            <legend className="px-2 text-base font-medium">{pillar}</legend>
            <Field
              label={`${pillar} observation`}
              hint="Leave blank until researched. A hypothesis is not an observed weakness."
            >
              <Textarea
                name={`point_${i}_observation`}
                maxLength={3000}
                defaultValue={p.observation}
              />
            </Field>
            <Field label={`${pillar} recommendation`}>
              <Textarea
                name={`point_${i}_recommendation`}
                maxLength={3000}
                defaultValue={p.recommendation}
              />
            </Field>
            <Field label={`${pillar} source URL`}>
              <Input
                name={`point_${i}_source_url`}
                type="url"
                maxLength={2048}
                defaultValue={p.source_url ?? ""}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`${pillar} verification`}>
                <Select
                  name={`point_${i}_verification_status`}
                  defaultValue={p.verification_status}
                >
                  <option value="unverified">Unverified</option>
                  <option value="verified">Verified by researcher</option>
                  <option value="rejected">Rejected</option>
                </Select>
              </Field>
              <Field label={`${pillar} confidence`}>
                <Select
                  name={`point_${i}_confidence`}
                  defaultValue={p.confidence}
                >
                  {["unknown", "low", "medium", "high"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label={`${pillar} last researched`}>
                <Input
                  name={`point_${i}_last_researched_date`}
                  type="date"
                  defaultValue={p.last_researched_date ?? ""}
                />
              </Field>
            </div>
          </fieldset>
        );
      })}
      <Field
        label="Suggested offer"
        hint="An editable scope suggestion, never a confirmed budget or a promise of results."
      >
        <Input
          name="suggested_offer"
          maxLength={500}
          defaultValue={review.suggested_offer}
          list="service-offers"
        />
      </Field>
      <datalist id="service-offers">
        {[
          "Digital Foundation",
          "Growth Launch",
          "Founding Growth Partner",
          "Growth Infrastructure Partner",
          "Research required before recommending an offer",
        ].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <Feedback state={state} />
      <Submit>Save Growth Review</Submit>
      <p className="text-xs text-muted-foreground">
        Saving changes invalidates prior approval and moves a Ready lead back to
        Researching.
      </p>
    </form>
  );
}
export function ApprovalForm({
  review,
  canApprove,
}: {
  review: Review;
  canApprove: boolean;
}) {
  const [state, action] = useActionState(approveReview, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lead_id" value={review.lead_id} />
      <input type="hidden" name="expected_revision" value={review.revision} />
      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          name="confirm"
          required
          disabled={!canApprove}
          className="mt-1 accent-primary"
        />
        <span>
          I manually approve review version {review.revision} for outreach
          preparation. This does not authorize sending.
        </span>
      </label>
      <Feedback state={state} />
      {canApprove ? (
        <Submit>Approve review & mark Ready for Outreach</Submit>
      ) : (
        <p className="text-xs leading-6 text-muted-foreground">
          Save at least one verified observation with its source, confidence and
          research date before approval.
        </p>
      )}
    </form>
  );
}
export function OutreachDraftForm({
  draft,
  followUp,
}: {
  draft: Draft;
  followUp: string | null;
}) {
  const [state, action] = useActionState(saveDraft, {});
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="lead_id" value={draft.lead_id} />
      <Field
        label="Personalized email draft"
        hint="Template-based introduction. Review facts and fill sender details before any future sending workflow."
      >
        <Textarea
          name="email_draft"
          defaultValue={draft.email_draft}
          maxLength={12000}
          className="min-h-72"
        />
      </Field>
      <Field label="Call opening script">
        <Textarea
          name="call_script"
          defaultValue={draft.call_script}
          maxLength={6000}
          className="min-h-40"
        />
      </Field>
      <Field label="Follow-up date">
        <Input
          name="next_follow_up"
          type="date"
          defaultValue={followUp ?? ""}
        />
      </Field>
      <Feedback state={state} />
      <Submit>Save draft preparation</Submit>
    </form>
  );
}
