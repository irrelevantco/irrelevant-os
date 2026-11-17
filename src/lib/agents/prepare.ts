import type { ClaimedJob } from "./contracts";
// Deterministic baseline: never lets an LLM turn a supplied hypothesis into a finding.
export function prepare(job: ClaimedJob) {
  const b = job.business;
  if (!b) throw new Error("Business context is missing.");
  if (job.job.kind === "research_plan")
    return {
      provider: "rules-v1",
      title: `Research plan / ${b.name}`,
      tasks: [
        {
          pillar: "Digital Presence",
          task: "Review the public website on desktop and mobile. Check service pages and the inquiry path. Record an observation, URL, date and confidence; do not submit forms.",
        },
        {
          pillar: "Social Presence",
          task: "Review permitted public social links and trust signals manually. Record source links and distinguish dated observations from assumptions. Do not access protected profiles.",
        },
        {
          pillar: "Customer Growth",
          task: "Check visible estimate, booking and contact options. Do not infer private conversion rates, budgets or customer data.",
        },
      ],
      qualification: [
        "Industry fit",
        "Potential customer value",
        "Digital improvement opportunity",
        "Evidence of operating capacity",
        "Decision-maker accessibility",
      ].map((criterion) => ({
        criterion,
        status: "Research required",
        instruction:
          "Record evidence, source, date and confidence before assigning a score.",
      })),
      warning:
        "This is a checklist, not a completed audit or verified finding. Research hypotheses are excluded.",
    };
  if (!job.points.length) throw new Error("Verified evidence is required.");
  const sender = job.settings;
  if (!sender.sender_name || !sender.sender_email || !sender.postal_address)
    throw new Error(
      "Configure sender name, email and postal address before preparing outreach.",
    );
  const evidence = job.points
    .map(
      (p) =>
        `${p.pillar}: ${p.observation}\nSource: ${p.source_url}${p.recommendation ? `\nPossible next step: ${p.recommendation}` : ""}`,
    )
    .join("\n\n");
  const follow = job.job.kind === "follow_up";
  const offer = job.review?.suggested_offer;
  return {
    provider: "rules-v1",
    subject: `${follow ? "Following up" : "A growth review"} / ${b.name}`,
    email_draft: `Hi ${b.name} team,\n\n${follow ? "I’m following up on my earlier contact. If this isn’t a priority, no problem." : `I’m ${sender.sender_name} with iRRELEVANT CO. I reviewed the public information recorded in our Growth Review for your ${b.industry} business in ${b.location}.`}\n\n${evidence}\n\n${offer ? `One option to discuss is ${offer}. Scope and pricing would need a conversation.\n\n` : ""}Would a short conversation about your priorities be useful?\n\n${sender.sender_name}\niRRELEVANT CO\n${sender.sender_email}\n${sender.postal_address}\n\nIf you’d prefer no further contact, please reply and let me know.`,
    call_script: `Hi, I’m ${sender.sender_name} with iRRELEVANT CO. Is now a reasonable time to speak with whoever handles ${b.name}’s website and inquiries? I have a short, source-backed review and would like to understand your priorities before suggesting work.`,
    evidence: job.points.map((p) => ({
      pillar: p.pillar,
      source_url: p.source_url,
      confidence: p.confidence,
    })),
    warning:
      "Draft only. Accepting copies this proposal into the editable draft; it does not authorize sending or confirm a budget.",
  };
}
