# Roadmap

Business outcome: approximately one suitable $3k–$10k project/annual engagement monthly, expanding toward $25k/year partnerships. This is an operating goal, not a revenue claim. Fit takes precedence over volume. Long-term creator rankings, fulfillment networks and investing tools are explicitly excluded.

## Phase 1 — foundation (implemented)

Next.js/TypeScript/Tailwind/shadcn UI; local and hosted Supabase configurations; email/password auth and server-protected sessions; organizations and switching; RLS; business/lead entry and editing; original source provenance; atomic duplicate-protected creation; notes; 12-stage pipeline table and board; follow-up dates/queue; true database aggregates; append-only activity; responsive branded UI and PWA installation support; docs and tests. Public website is a brand homepage only.

Production rollout is not complete: real hosting credentials, production Auth configuration, membership invitation lifecycle, password recovery UI/MFA policy, backups, monitoring and privacy/legal review remain before exposing real client data broadly.

## Phase 2 — discovery and qualification (next)

Build configurable permitted-provider contracts and capability flags; industry/geography/category/count/min-score interface; bounded jobs with rate limits and explicit source attribution. CSV fallback must validate headers, size, encoding, formulas, URLs and row-level errors, preview before committing, and use the same deduplication/integrity rules. Extend domain normalization for real-world aliases and locations.

Score industry fit, customer value, digital opportunity, operating capacity and decision-maker accessibility. Store policy version, individual scores, supporting URLs, timestamps, confidence and verified-vs-assumed claims. Acceptance: deterministic scoring tests, RLS tests, provider fixtures, retry/idempotency tests; no outbound contact or unbounded spend.

## Phase 3 — three-point Growth Review

Digital Presence, Social Presence, Customer Growth. Three sourced observations, three practical recommendations, confidence, package suggestion and short editable executive summary. Add configurable OpenAI/Ollama abstraction with structured validation and usage budgets. Generate branded PDF from a human-editable version. Acceptance: unsupported claims rejected, all claims retain sources, human approval required before separate delivery authorization. No private data or invented metrics.

## Phase 4 — Gmail and Calendar

Google OAuth scopes, encrypted tokens, sender/postal settings, suppression list, versioned drafts and exact approvals; small manual send limits, deduplication, reply tracking, positive-reply review, opt-outs, follow-up reminders and CRM activity. Calendar through separate minimum scopes. Acceptance: expired tokens/revocations/retries tested, approval cannot apply to edited content, sending is paused by default, suppression checked at send time. See GOOGLE_INTEGRATION.md.

## Phase 5 — sales and proposals

Sales preparation, call logs, proposal builder/items/scope/revision limits/payment schedules/PDF, acceptance and separate signed contract record. Seed configurable offers: Digital Foundation $1.5k–$3.5k one-time; Growth Launch $3k–$6k one-time; Founding Growth Partner $10k/year, four $2.5k quarterly payments, written 12-month agreement and limited defined deliverables; Growth Infrastructure Partner $25k/year, custom scope/schedule. Support setup fees, discounts and custom terms. Acceptance: accepted proposal, signed contract and expected payments are distinct states.

## Phase 6 — test-mode Stripe and onboarding

Stripe customers, test checkout/invoices, quarterly schedules, secure webhooks, event idempotency, subscription sync, payment ledger; onboarding after confirmed signed agreement. Acceptance: redirect cannot settle payment, repeat/out-of-order webhooks handled, no live charges enabled, annual obligations reference a signed contract.

## Phase 7 — delivery, reporting, hardening

Client workspaces, onboarding tasks, scopes, private brand assets, content deliverables/revisions/approvals, direct cost ledger, gross margin and monthly reports. Future creator assignment extension points without building a network. Report real audits, sent mail, positive replies, meetings, proposals, wins, contract value, cash, MRR, cost/margin and conversions using defined denominators and time ranges. Distinguish contract value from cash and annual installment revenue from MRR. Operational pause/stop controls, provider spend and usage, failure recovery and production monitoring.

## Public site track

Home foundation exists. Add Services, Growth Partnerships, Our Work, Request a Growth Review, Contact, Privacy and Terms when content, legal terms and intake abuse controls are ready. Review/contact intake will create database leads through a rate-limited server boundary. At Your Request Cleaning may only appear after verified, authorized assets and claims are provided. No fabricated case studies or testimonials.

## Prospect Batch 001 delivered scope

CSV upload/bundled load, mapping, Zod preview, row errors, normalized deduplication, idempotent transactional import, owner scope, preserved unverified research metadata, A/B/C research queue, editable three-point reviews, source/confidence/date fields, manual owner readiness approval and draft-only outreach preparation are implemented. This completes the CSV/manual-research slice of Phases 2/3. Configurable discovery providers, automated qualification scores, AI audit generation/PDFs and Gmail remain unimplemented. See PROSPECT_BATCH_001.md and WINDOWS_SETUP.md.
