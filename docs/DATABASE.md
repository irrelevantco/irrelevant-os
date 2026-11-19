# Database

Migration: `supabase/migrations/202611170001_phase_one.sql`. Typed client schema: `src/lib/supabase/database.types.ts`. PostgreSQL 15+; use Supabase-managed Auth schema in hosted environments.

| Table                | Purpose                                                          | Access                                                    |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| organizations        | Tenant identity/name                                             | Members read; owner renames; creation through RPC         |
| organization_members | User → org role, owner/member                                    | Members read own org; no client writes                    |
| businesses           | Public business contact data and original provenance             | Org members read/insert; limited contact/identity updates |
| leads                | One acquisition opportunity per business per org                 | Org members read/insert; status/value/follow-up updates   |
| lead_notes           | Append-only context                                              | Org members read and append as themselves                 |
| audit_events         | Database-generated changes with actor/entity/time/changed fields | Org members read; no client insert/update/delete          |

Every table has RLS enabled. Membership helpers are security definer only to avoid policy recursion, with fixed search paths and revoked public execution. Foreign keys `(organization_id, business_id)` and `(organization_id, lead_id)` prevent cross-tenant references. Indexes support membership lookups, pipeline stages, due follow-ups, notes and activity.

Business source fields: `source_type`, `source_url`, `source_notes`, `source_observed_at`. Phase 1 UI always records manual entry. Source time is time of entry, not proof of observation or verification. Record new evidence and corrections in notes; future discovery will use append-only per-field evidence records. No private data collection or automated enrichment runs.

Deduplication uses a generated lower-case domain key, removing `www.`, or normalized name + location when no website is set. It is organization-scoped and backed by a unique constraint. It prevents ordinary manual duplicate entry but is not an entity-resolution system for multi-location franchises, aliases, or redirect domains. Qualification and CSV ingestion must extend normalization intentionally.

`create_prospect(jsonb)` creates business + lead in a single invoker-rights transaction. Duplicate inserts and invalid leads roll back together. Dollar inputs become integer cents; null means unknown, zero is an explicit estimate. Values are constrained to $0–$1m for this phase. No decimal money columns or payment records exist yet.

Pipeline enum: Discovered, Researching, Qualified, Ready for Outreach, Contacted, Replied, Meeting Scheduled, Audit Delivered, Proposal Sent, Won, Lost, Suppressed. These are manually maintained labels, not evidence of side effects. No email suppression list exists until Phase 4; no emails can be sent in Phase 1.

`crm_summary(org)` is a stable invoker-rights SQL aggregate. It includes the full visible dataset. Qualified-and-progressing includes Qualified through Won, excluding Discovered, Researching, Lost and Suppressed. Open value sums nullable manual estimates excluding Won/Lost/Suppressed. Follow-ups due include today/overdue open leads in America/New_York. Won is a manual count, not recognized revenue. No cash collected/MRR/payment metrics are fabricated.

Audit triggers append entity, actor, action, timestamp and changed column names, avoiding a second full copy of contact PII. Audit rows and notes cannot be edited or deleted by application roles. Privileged database administrators can still modify data; production retention and tamper-resistant log export require additional hardening.

## Migrations and verification

Standard CLI: `npm run db:start`, `npm run db:types`. Lightweight: `npm run local:env`, `npm run local:up`, `npm run local:migrate`, `npm run local:types`. Do not apply local bootstrap roles/functions to a hosted Supabase project. The local migration is transactional and versioned; production migration history should be managed by Supabase CLI/CI.

`npm run test:rls` exercises real Auth JWTs against PostgREST and PostgreSQL. It covers tenant reads/writes, composite foreign keys, author spoofing, membership escalation, anonymous access, append-only records, duplicate handling, rollback and metric isolation. Local fixture accounts remain separate from your own organization. Add migration-specific integration tests whenever RLS or roles change.

## Planned tables

Evidence, discovery jobs, qualification versions, audits/approvals, encrypted Google connections, email drafts/approvals/sends/threads, suppression entries, reminders, offers, proposals/items/schedules, signed contract records, Stripe event ledger/payments, clients/projects/assets/deliverables/costs and provider usage. Each will require tenant RLS, explicit grants, lifecycle constraints and idempotency appropriate to its side effects. They are not present in Phase 1.

## Migration 202611170002 — prospect batch and research

Additive migration preserves existing CRM/organization records. New RLS tables: import_batches, import_rows, growth_reviews, growth_review_points and outreach_drafts. Leads gain research_priority, audit_hypothesis_not_verified and explicitly unverified research_metadata. Imports and manual inserts share a tenant-level advisory lock and normalized identity guard. Import rows retain mapped data, original data, error/status and associated lead. Preview/commit RPCs require owner role and serialize replays. Review save RPCs require membership and expected revision; approval requires ownership and sourced verified evidence. Editing revokes approval and demotes Ready leads. Direct approval/result/status forgery is forbidden. Outreach status is constrained to draft. See PROSPECT_BATCH_001.md for definitions and batch results.

## Preparation extension

Migration `20261117175427_agent_control.sql` adds agent_settings, contact_events, suppression_entries and agent_jobs, all with RLS. Mutations require scoped authenticated owner/member RPCs. There is no anonymous worker API. `20261117203425_explicit_rpc_privileges.sql` explicitly removes anon/PUBLIC execute grants that hosted default privileges may add. See AGENT_CONTROL.md for leases, caps, contact truth and stale-proposal rules.


## Free discovery and explicit resume (0.2.2)

`20261117221021_free_discovery_and_resume.sql` adds no tables or business data. Owner-only `resume_preparation` inserts defaults if missing or clears only `paused`. Member-scoped `preparation_capabilities` detects missing upgrades. `enqueue_agent_job` and `claim_agent_job` distinguish free OSM jobs from paid Explee jobs, enforcing three daily free requests and one-minute cooldowns with the existing tenant advisory lock. All RPCs explicitly revoke PUBLIC/anon execution and enforce identity inside the function. Existing settings, records, RLS and audit triggers remain in force. Apply using `npm run local:migrate` or the desktop local updater, never a reset. Spreadsheet conversion adds no HR/payroll tables; only explicitly reviewed prospects enter the CRM.


## Acquisition automation (0.3.0)

`20261117231231_acquisition_automation.sql` adds organization-scoped `acquisition_settings`, `sales_meetings` and `email_deliveries`, with member-read RLS and no direct mutation grants. It adds a non-exposed encrypted `private.google_connections` store bound to owner and encryption-key identifier. Narrow owner-checked RPCs configure limits, enqueue one category/hour, record agreed appointments, approve/claim/finish exact sends and reconcile Calendar state. Private credentials are never part of acquisition-state/dashboard responses. All new public RPCs explicitly revoke PUBLIC/anon execution. There are 18 RLS-protected public application tables plus the locked private credential store.

The update raises the maximum explicit daily job setting to 100 without purchasing or increasing paid credits, and allows contact source `gmail` only for confirmed delivery workflow records. Manual contact logging remains separately labelled. The additive updater preserves existing records; no account or prospect seed occurs.

The existing hosted Phase 1 + Batch schema was upgraded using `docs/deployment/HOSTED_ACQUISITION_UPGRADE.sql`. The bundle includes missing preparation/free-discovery/acquisition changes and reasserts explicit function privileges after creating those functions. Read-back verification found 18 public tables, all with RLS, private credential RLS enabled, no direct authenticated credential SELECT, no anonymous worker/credential execution, and zero organizations, businesses, jobs or deliveries. Local data and accounts were not transferred. Apply the bundle only to that older schema; current/fresh installations use individual versioned migrations instead.

### Recoverable lead removal

Migration `20261118153305_lead_trash.sql` adds nullable deletion markers and partial active/trash indexes without modifying existing leads. The organization owner uses `change_lead_trash(org, lead, restore, expected_updated_at)`; `list_lead_trash(org, page)` returns 25 removed identities at a time. Private functions recheck `auth.uid()` and database ownership, use an empty search path, and deny anonymous execution. Active queries use RLS to exclude Trash; historical import counts and retained notes/audit/contact/suppression records are not erased. This feature is not a personal-data purge or permanent business deletion.

## Acquisition engine migration

`20261118191851_acquisition_engine.sql` is additive and does not reset existing records. New RLS tables: engine_settings, engine_coverage, engine_mail_threads, engine_mail_cursors, engine_replies, engine_offers and engine_outbox. All direct writes are denied to application roles; owner-scoped engine_control operations serialize with the existing agent advisory lock. Public pipeline_page and inventory_summary retain caller RLS. The engine uses existing agent_jobs, email_deliveries, contact_events, growth reviews and sales_meetings rather than parallel CRM identities.

CSV preview capacity becomes 2,000 rows, with commit-time identity checks and original source_url/source_observed_at preservation. Domain and normalized name/location lookup indexes support larger batches. Current evidence/sender/policy revisions are checked again at delivery claim. Existing manual messages retain their five/day workflow while all attempts share a 500 rolling-24-hour fixed-sender ceiling. Migration tests use disposable databases and retain prior-row values; no user Windows database is accessed by cloud tests.

`20261119021025_research_dispatch_limits.sql` adds the research dispatch guard without editing the previously published engine migration. Actual starts, including carried-over queued work, consume the current daily research allowance. Claim also checks the current enabled provider/model configuration. A separate worker check after public-page capture prevents starting model requests after pause, cancellation or lease expiry.
