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
