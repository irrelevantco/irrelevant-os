# Controlled preparation agents

`/dashboard/agents` is a real database-backed queue and proposal review screen. Default state: paused, ten jobs/day, zero Explee credits/day. The owner can resume, set 1–25 jobs/day, configure sender identity, queue work, run one job now, stop one job or pause/cancel all jobs. Members may read organization jobs and log actual contact; only owners configure, run and accept proposals.

## Implemented jobs

- **research_plan:** deterministic three-pillar checklist plus five qualification evidence criteria. Creates no audit findings, numeric qualification scores or budget assumptions.
- **outreach_draft:** uses verified, source-backed points from an owner-approved current Growth Review. Sender name/email/postal address required. Result is a separate proposal, never an immediate overwrite.
- **follow_up:** same evidence gate; latest manually logged contact must be outbound email/call at least three days old. Later replies/opt-outs cancel pending follow-ups. At most three follow-up proposals can be accepted for a lead. These are preparation caps, not sent-message counts.
- **discovery:** defaults to free OpenStreetMap through ovp.dresel.systems (North America), without an API key. Fixed US municipality/trade filters, 1–10 results, at most three requests/day/organization and a one-minute enqueue/execution cooldown. Zero Explee credits does not block this provider. Optional Explee still requires its server key, paid allowance and request confirmation. All candidates require a separate normal import preview/commit.

No LLM, Gmail, Calendar, email delivery, call placing, content publication or billing capability is implemented. Provider `rules-v1` is an honest template baseline. Nothing infers contact from a CRM status or draft creation.

## Starting without paid services

Choose **Resume free preparation**, select an existing prospect and **Research plan**, then **Queue preparation → Run next queued job**. This creates a checklist, not a completed audit. Resume preserves existing sender settings and limits. Add researched evidence to the Growth Review and manually approve it before preparing outreach. Configure sender name, email and postal address before outreach drafts. Follow-ups require a real logged outbound contact, never a draft.

Free discovery sends only city, state and a fixed trade category. It uses a bounded POST, a 25-second deadline and a 1 MB response limit and a separate 32 MB query-memory cap, with no automatic retries or paid fallback. Public-map coverage may be sparse or empty. Network failures do not affect the existing CRM/research workflow. Every result retains its map source and an unverified hypothesis; no budgets or digital weaknesses are inferred.

The [provider site](https://ovp.dresel.systems/) offers free access without registration; [terms/privacy](https://ovp.dresel.systems/impressum.html) require fair resource sharing and warn that queries/IP addresses are logged for 14 days. Send only the city/state/trade filters. [OpenStreetMap licensing](https://www.openstreetmap.org/copyright) requires attribution and may require share-alike when redistributing derived databases. These sources provide no uptime guarantee. Attribution appears in the workspace and each imported source label.

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


Version 0.2.3 replaces the initial unreachable Private.coffee endpoint. A live city/trade request against the North America endpoint returned five unverified candidates, with no import. It is a community service, not a guaranteed production backend for future resale; review capacity and terms before broader distribution.


## Version 0.3.0 extension

The new Connections screen can explicitly enable bounded hourly discovery (up to 56 searches/day across seven categories) with a total 100-job ceiling. Three manual free requests/day remain separate. Completed candidates stage an import preview automatically; no business is auto-imported or qualified. The native desktop runner needs the app open and owner signed in. Gmail sends and Calendar writes have separate exact-artifact approvals and do not run from preparation jobs. See ACQUISITION_AUTOMATION.md and GOOGLE_INTEGRATION.md; credentials and live Google activation are still required.
