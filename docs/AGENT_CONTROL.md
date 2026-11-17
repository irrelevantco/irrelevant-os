# Controlled preparation agents

`/dashboard/agents` is a real database-backed queue and proposal review screen. Default state: paused, ten jobs/day, zero Explee credits/day. The owner can resume, set 1–25 jobs/day, configure sender identity, queue work, run one job now, stop one job or pause/cancel all jobs. Members may read organization jobs and log actual contact; only owners configure, run and accept proposals.

## Implemented jobs

- **research_plan:** deterministic three-pillar checklist plus five qualification evidence criteria. Creates no audit findings, numeric qualification scores or budget assumptions.
- **outreach_draft:** uses verified, source-backed points from an owner-approved current Growth Review. Sender name/email/postal address required. Result is a separate proposal, never an immediate overwrite.
- **follow_up:** same evidence gate; latest manually logged contact must be outbound email/call at least three days old. Later replies/opt-outs cancel pending follow-ups. At most three follow-up proposals can be accepted for a lead. These are preparation caps, not sent-message counts.
- **discovery:** optional bounded Explee company search. Owner must configure credits and confirm a request. Key missing/zero allowance blocks it. Candidates require a separate normal import preview/commit.

No LLM, Gmail, Calendar, email delivery, call placing, content publication or billing capability is implemented. Provider `rules-v1` is an honest template baseline. Nothing infers contact from a CRM status or draft creation.

## Reliability and authorization

Jobs persist in PostgreSQL. Enqueue keys are unique per organization, concurrent claims serialize using a tenant advisory lock, and leases last two minutes. Pure preparation jobs retry after 30 seconds × attempt, at most three attempts. Expired leases can be reclaimed with a new token; stale completions are rejected. Discovery gets no automatic retry. Enqueue and execution both check pause, current daily limits and provider allowance. Credit reservations for failed requests remain counted for the day.

The daily limit bounds distinct jobs started and jobs enqueued, using Eastern Time. Pure retries may execute up to three attempts per job. The queue is not an email-sending rate limiter because there is no sender.

Proposals do not modify existing drafts until explicit owner acceptance. Acceptance locks and checks the research revision, draft edit timestamp, business edit timestamp and latest contact event. Human edits make stale proposals fail. Accepted content remains constrained to draft status. Opt-out suppression persists separately from pipeline stage, including the recorded lead/email/domain identity. Changing a CRM stage cannot clear suppression. Contact events are append-only and explicitly marked manually logged; they are not claimed as Gmail-synced replies.

Every table has RLS and explicit grants. Direct mutation of job state, approvals, settings and suppression is denied. Narrow RPCs check owners/members with an authenticated owner JWT. All private helpers revoke public execution and use a fixed empty search_path. There is no application service-role client.

## Scheduled processing

Unattended scheduled processing is not enabled. No anonymous worker RPC, cron endpoint, stored worker credential or service-role key is provisioned. Every claim and completion requires an authenticated organization owner. Use **Run next queued job** while signed in; durable state, leases and retry delays survive page reloads, but an eligible retry needs another owner-triggered execution.

A hosted scheduler can be added later through a reviewed authenticated job system. This release does not claim that queued jobs run when the application is closed. A stop invalidates pending/in-flight results; an already-started external API request may still finish and be charged.

## Checks

`npm run test:agents` uses a real, explicitly enabled loopback Auth/PostgREST database, with synthetic isolated tenants. It covers RLS, owner permissions, default pause, concurrent idempotency, anonymous denial, leases, bounded retries, evidence gating, stale edits, actual-contact requirements, reply cancellation, opt-outs, credit reservations, ambiguous provider failures and unexpected-charge pause. It makes no paid requests or communications.
