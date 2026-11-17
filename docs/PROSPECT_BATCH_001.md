# Prospect Batch 001 — import, research and preparation

Input: `data/imports/irrelevant_os_30_prospects.csv`, supplied by the user. It contains 30 prospect records: 15 priority A, 13 B, and 2 C. All emails are empty, 19 websites are empty and one phone is empty. A missing value is unknown, not evidence that a business has no website or cannot be contacted.

## Implemented workflow

1. Sign in and select the intended organization. Only an organization owner can preview and commit imports; members can read results and record research.
2. Open Imports. Upload a UTF-8 CSV or choose **Load Prospect Batch 001**. Loading reads headers and rows; it does not create businesses or leads.
3. Map columns. Business name, location and industry are required. Optional columns may be omitted. A source column cannot be reused for multiple destination fields.
4. Preview mapped rows. Zod validates each row; malformed cells retain logical CSV row numbers and errors. Preview is persisted separately from CRM records. The preview marks duplicate identities within the file and against the current organization.
5. Explicitly confirm the preview, then import. The database rechecks duplicates at commit, creates each business and lead atomically, and retains row-level failures. New leads are always Discovered, with unknown contract value. CSV status/issue text cannot approve research or advance a lead.
6. Use the research queue: A before B before C, then unprioritized records. These letters are supplied research priorities, not calculated qualification scores. No provider discovery or automatic qualification scoring runs.
7. Edit the Three-Point Growth Review under Digital Presence, Social Presence and Customer Growth. Each pillar supports an observation, recommendation, source URL, verification state, confidence and last-researched date. The suggested service offer is an overall editable scope suggestion.
8. A verified observation needs nonempty observation text, an HTTP(S) source, explicit confidence and a research date. Verification is a researcher's manual attestation; the software does not independently verify website claims. An organization owner must explicitly approve the current review version before the lead can be Ready for Outreach.
9. Review changes invalidate approval. A Ready lead returns to Researching. Stale edits or approvals are rejected by revision checks. The pipeline status control cannot bypass this database gate.
10. Outreach preparation includes the supplied public contact details, full review, suggested offer, editable introductory email draft, call opening script and follow-up date. Initial drafts are neutral templates personalized with business identity/industry/location, not AI research. All drafts are persisted with a database-enforced `draft` status. No send, mailbox, phone or calendar action exists.

## Unverified data boundary

`research_priority` and `audit_hypothesis_not_verified` are preserved on the lead. Original rows and mapped payloads remain in the import record. Source labels, notes, decision-maker text and any supplied `verified_digital_issue` text are retained as explicitly unverified metadata. An input column name containing “verified” is not proof. No CSV hypothesis is copied into an observed finding. New review observations, evidence URLs and research dates start empty/unverified. No confirmed budgets, digital weaknesses or performance metrics are claimed.

The original source label is preserved, while the business's canonical source type is `csv`. Because the file does not supply actual citation URLs, `source_url` remains empty; a source label or listed company website is not invented into a citation. Import time is recorded separately from research time.

## Deduplication and idempotency

Identity rules are scoped to the organization: same canonical website domain, **or** same normalized business name + location. Names/locations use Unicode compatibility normalization, lower case, punctuation/whitespace removal and `&` → `and`. Domains ignore scheme/path/query/port and strip `www.` and a trailing dot. Different locations with no matching domain remain separate. A shared domain is treated as one business, matching the existing CRM model; multi-location franchises may need future explicit identity rules.

A SHA-256 fingerprint of CSV text plus sorted field mapping identifies a batch per organization. The same file/mapping returns the original preview or completed result. Repeated/concurrent commits are serialized with a shared organization lock and do not create additional entities or overwrite research. A different file with the same businesses records duplicates and retains original data. A trigger extends the identity guard to manual CRM insertion/edits so a concurrent manual add cannot race the importer.

A completed batch's imported count is historical, not “new records created by this retry.” Replaying it preserves that count and creates zero new leads. The dashboard counts persistently imported rows and skipped duplicates. It uses associated distinct leads for research/contact readiness metrics.

## Results in the authorized local iRRELEVANT CO workspace

- Imported: **30** businesses and **30** leads.
- Duplicates skipped on first import: **0**; invalid rows: **0**.
- All leads: **Discovered**; estimated contract value: **unknown**.
- Research priority: **15 A / 13 B / 2 C**.
- Reviews: **30**, with **90** blank, unverified pillars.
- Outreach drafts: **30**, all draft-only.
- Missing contact information: **30**, defined as missing either email or phone (all 30 lack email, one lacks phone).
- Leads needing research: **30**; reviews awaiting approval: **30**; Ready for Outreach: **0**.
- Re-import replay: **0 additional records**.

This is the cloud workspace's local development database. It is not the user's Windows database, and PostgreSQL contents do not transfer through Git. Local login credentials are saved in ignored `work/local-owner.json`; they are never committed or printed in logs. `work/batch-001-results.json` contains the local organization/batch IDs and summary without passwords.

## Operation and verification

Apply the additive migration using `npm run local:migrate`; existing organizations, CRM data and memberships are preserved. The migration initializes review/draft workspaces for existing leads. Any legacy Ready status lacking the new evidence/approval gate is moved to Researching. No old migration is rewritten.

For the explicitly requested dedicated local workspace/import, run `npm run batch:import`. It reuses the protected local login file and is restricted to a loopback backend. It refuses to replace missing/broken owner credentials and never uses a service-role key. In other environments, use the authenticated Imports screen under your own organization.

Checks: `npm test`, `npm run test:rls`, `npm run test:imports`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run build`. Integration tests create synthetic fixtures in explicitly named test organizations and are blocked against remote backends. The original supplied-business workspace is not used for synthetic verified observations.

Limit: 512 KB, 500 rows, 40 unique columns per file. Logical row errors and invalid records are retained. Syntax errors that prevent parsing the file are reported before preview. No spreadsheet formulas or raw HTML are executed; no CSV export is implemented. No automated research, PDF generation, qualification score, email sending or live integration is claimed.
