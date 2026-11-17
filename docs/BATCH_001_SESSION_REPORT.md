# Batch 001 implementation and startup verification

November 17, 2026. Existing repository/history were preserved, including the original Phase 1 commit. No application reinitialization or database reset was performed. The original migration remains unchanged.

## Startup correction

The first build was only committed locally and had no Git remote. The supplied public repository `irrelevantco/irrelevant-os` was readable and empty at inspection; this explains the missing GitHub files. The inherited GitHub credential was rejected. GitHub CLI device authorization must finish before a push can be verified; a local commit does not establish remote synchronization.

Development/production default to port **3030**, and `npm run local` now preserves existing credentials, starts local services, applies pending migrations and runs the app. Windows instructions are in WINDOWS_SETUP.md. The cloud environment cannot access `C:\Users\naryr\iRRELEVANT-OS`; cloud localhost/database are distinct from Windows localhost/database. No existing Windows files were modified.

## Delivered

- Bundled user CSV at `data/imports/irrelevant_os_30_prospects.csv`.
- Owner-controlled CSV upload/bundle load, field mapping, Zod validation, persisted preview, original/mapped data, row errors, duplicate detection, explicit commit and results/history.
- Organization-scoped identity normalization and transactional idempotency, including commit-time duplicate rechecks and concurrency locks shared with manual business insertion.
- Preserved research priorities and hypotheses as unverified lead metadata; no assumptions promoted into findings or budgets.
- A/B/C research queue; three editable review pillars with observations, recommendations, source URLs, verification state, confidence, offer suggestion and research dates.
- Owner approval of a current revision plus at least one sourced verified observation required for Ready for Outreach. Database enforcement prevents status-control bypass; edits revoke approval and demote Ready to Researching.
- Persisted, editable neutral email introductions/call openers and follow-up dates, with database-enforced draft-only status. No sending or live integration.
- Additive migration, generated schema types, documentation and expanded CI.

## Actual local import

The user authorized a dedicated local iRRELEVANT CO workspace. All **30 businesses and 30 leads** were imported as Discovered. First import had **0 duplicates** and **0 invalid rows**. Replays created **0 additional leads**. Priority distribution: **15 A / 13 B / 2 C**.

There are **30 reviews / 90 blank unverified pillars / 30 draft introductions**. Research required: **30**; approval pending: **30**; Ready: **0**. No budget values were populated. All email addresses are unknown; 19 website fields and one phone field are empty. These are missing-data facts, not claims about a business's digital quality.

Generated local owner credentials are stored only in ignored `work/local-owner.json` with restricted file permissions. `work/batch-001-results.json` contains a password-free summary. No secrets were committed. The cloud import does not transfer a PostgreSQL database through Git; the included import workflow can load the same batch under the user's Windows account after source sync/startup.

## Passed verification

| Check                                                             | Result                                     |
| ----------------------------------------------------------------- | ------------------------------------------ |
| Type checking, including Next route generation                    | Passed                                     |
| ESLint, zero warnings                                             | Passed                                     |
| Vitest                                                            | 59 passed                                  |
| Original CRM RLS/integrity assertions                             | 24 passed                                  |
| Import, replay, approval and new-table RLS assertions             | 42 passed                                  |
| Playwright                                                        | 4 complete desktop/mobile workflows passed |
| Optimized production build                                        | Passed                                     |
| Both SQL migrations in an independent empty verification database | Passed                                     |
| RLS on all public CRM/import/review tables in fresh installation  | 11 of 11 enabled                           |
| Authorized 30-record batch import and replay                      | Passed; no extra records                   |

The browser tests use synthetic test organizations and records; synthetic “verified” assertions never modify the supplied-business organization. They exercise mapping, preview/error/duplicate display, commit, queue ordering, approval, draft persistence, responsive layout and approval invalidation. Original CRM workflows still pass. Only the temporary migration-test database was removed; all application organizations and data were preserved.

Limits: manual verification is a researcher attestation; no automated website investigation, provider discovery, AI score, PDF export, Gmail sending or payment workflow is claimed. The public marketing site remains the existing brand homepage. No deployment, live charge, email, call or other external communication occurred. Any GitHub source push requires successful authorization and remote SHA verification.

See PROSPECT_BATCH_001.md for import semantics and WINDOWS_SETUP.md for startup/sync commands.
