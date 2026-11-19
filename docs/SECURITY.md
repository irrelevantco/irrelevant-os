# Security

## Phase 1 controls implemented

- Supabase email/password authentication with server-verified `getUser()` identity. The proxy refreshes sessions; protected pages and actions check independently.
- HttpOnly, SameSite=Lax session cookies; Secure in production. The active-organization cookie is also HttpOnly and is treated only as a preference checked against real membership.
- RLS and explicit database privileges on every tenant table. No application service-role bypass. Cross-tenant foreign keys, author checks and restricted update columns prevent tenant moves and actor rewrites.
- Zod input boundaries; SQL length/type/value constraints. React renders notes as escaped text; no raw HTML rendering.
- Safe http/https URLs only; no embedded credentials. Public links open with `noopener noreferrer`. Phase 1 does not fetch user URLs, preventing an SSRF-capable discovery boundary from being introduced accidentally.
- Parameterized Supabase queries; search escapes SQL LIKE wildcards. No client-composed SQL.
- Next server action same-origin protections and no permissive CORS. Do not loosen `allowedOrigins` broadly when deploying behind a proxy.
- CSP, clickjacking protection, MIME protection, referrer and permissions headers. CSP currently permits inline scripts/styles for Next.js hydration; nonce-based CSP can tighten this before broad public exposure.
- Authenticated workspace responses use private/no-store cache controls. No service worker cache, private browser database or localStorage CRM mirror.
- Database-generated audit records and append-only notes. No client audit-write permission.
- Local API/database ports bind to loopback; generated local passwords and JWT signing material stay in ignored, mode-0600 files. No external credentials are required to run Phase 1 locally.

## Before production exposure

Configure a dedicated managed Supabase project, HTTPS and correct callback URLs. Restrict public signup to intended operators using reviewed Auth configuration; invitations are not implemented yet. Configure SMTP, email confirmation, abuse/rate controls, password recovery UI and MFA policies appropriate for operators. The lightweight local stack auto-confirms email and is intentionally not a production template. Do not expose its API port through a public tunnel.

Review RLS/grants in staging with multiple real test identities, database backup/restore, error monitoring without PII/secrets, access reviews, account offboarding, and data retention/deletion. Grant membership using privileged reviewed administration until an owner-controlled invitation system is built. Application members cannot change membership or roles. No global super-admin UI exists.

Do not log auth headers, cookies, tokens, provider payloads or secret environment values. Keep server secrets out of `NEXT_PUBLIC_*`. The publishable Supabase key is not a service-role key. Rotate leaked secrets immediately. Privileged DB administrators remain outside RLS protection and require operational controls.

## Later-phase requirements (not implemented)

OAuth tokens: authenticated encryption (AES-256-GCM or equivalent), unique nonces, versioned key IDs, server-only access, minimal scopes, rotation/revocation and disconnect deletion. Do not add Google tokens to current session cookies, public tables or browser storage.

Outreach: approve an exact immutable draft version, require identified sender and postal address, check suppression and explicit authorization immediately before sending, enforce daily limits and unique message idempotency, synchronize opt-outs, log outcome, pause/stop checks. Draft generation never implies send authorization.

Jobs: bounded retries/backoff, explicit concurrency and provider quotas, idempotency persisted in PostgreSQL, validated event inputs, job ownership, cancellation before side effects, spend ledger and a hard budget. Ollama is trusted local infrastructure, not an arbitrary user URL.

Payments: Stripe test mode first, never store card data, verify webhook signatures on raw payloads, deduplicate event IDs, reconcile invoice/subscription states and contract schedules. Redirects cannot mark payments settled; an annual subscription cannot substitute for a signed annual agreement.

Storage: private buckets, tenant-scoped object names, Storage RLS tied to membership, signed short-lived URLs, file limits/type validation and malware scanning strategy. No bucket is provisioned in Phase 1.

Discovery: provider licensing, robots rules, rate limits, minimal permitted public data, provenance, lawful retention; no bypass of access controls or scraping protected social content.

## Reporting an issue

Stop affected automation (none runs in Phase 1), preserve minimal audit evidence, revoke exposed credentials, and contact the organization owner through an established private channel. Do not include private client data in public issues.

## Implemented import/research controls

CSV inputs are bounded to 1 MB, 2,000 rows, 40 unique columns and validated per row with Zod. Formula-like input is stored/rendered as plain text; spreadsheet exports escape formula-like CSV text and XLSX exports store literal text. Formulas are never executed. Raw imported claims remain unverified. New import/review/draft tables deny direct writes and enforce RLS; security-definer RPCs explicitly validate tenant membership/owner role with fixed search paths. Approval requires a current review revision and a manually verified source-backed observation, enforced again by a lead status trigger. Review edits invalidate approval. Introductory templates make no weakness/budget claims, and the draft table cannot represent sent messages. No service-role keys are used. Optional Explee credentials remain server-only. Generated local owner/GitHub credentials remain ignored and must never be committed.

## Personal desktop and preparation

The Electron shell has contextIsolation/sandbox/webSecurity enabled and nodeIntegration disabled. Only the local setup page receives a minimal validated IPC bridge. Application pages have no preload bridge, unexpected in-window navigation is blocked, permissions are denied, and external links are limited to HTTP(S). The standalone server binds only to loopback on an automatic port and exits with the app. Packaging excludes .env files and local credential artifacts.

Preparation claims and completion require an authenticated organization owner. No anonymous worker RPC, scheduler secret or application service-role bypass exists. Production operator access is exact-email allowlisted and defaults to deny. Persistent opt-out checks are independent of CRM stages. Explicit RPC privilege revocation handles hosted default anon grants; membership checks remain mandatory inside privileged API functions. See AGENT_CONTROL.md for precise limitations.


## Spreadsheet conversion and free discovery

See DATA_CONVERTER.md for file limits, ZIP/XML checks and the browser-only boundary. Non-prospect conversion never persists employee/payroll/applicant contents. No AI or external conversion service receives files. Prospect preview remains an authenticated owner action with a second import confirmation. Public OpenStreetMap lookup uses a fixed endpoint and validated city/trade filters, never an arbitrary URL or user-supplied query. Free discovery has database-enforced quotas independent of optional paid credits; provider failures are not retried automatically. Resume is owner-only and retains existing limits/identity.


## Approved sales capabilities (0.3.0)

Google refresh/access tokens are AES-256-GCM encrypted on the server with organization/owner/key-identifier context; private storage has no client SELECT grant. Desktop setup files are encrypted through the OS facility, with no plaintext fallback. The native runner uses the owner browser session and the authenticated same-origin tick endpoint, never service-role or anonymous execution. Public RPCs still validate owner and tenant.

Email approval captures recipient, subject, full body/footer, draft edit time and review revision. Claim rechecks suppression, pause, Google scope, edits and a five-attempt daily quota. Uncertain sends remain non-retryable and do not create actual-contact history without confirmation. Calendar writes use deterministic IDs, availability checks and separate guest-invitation consent. Browser/provider sign-in and live writes remain unverified until the owner completes Google setup. Mailbox reading/reply detection is not implemented; log opt-outs before further sends.

Post-upgrade hosted advisors report [authenticated security-definer RPC warnings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): these RPCs intentionally mediate narrowly scoped writes and check owner/member identity internally with fixed search paths. Anonymous grants are revoked. [RLS-without-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) cover the private credential store and preserved legacy tables; denial is intentional, so do not add broad read policies to clear the notice. Performance notices for older foreign-key indexes and legacy policies remain; this release is not a clean-advisor or production-security-audit claim.

## Installed Windows updates

The main process alone owns electron-updater and its packaged GitHub feed. No renderer IPC can supply an update URL or install command. Downloads require owner choice and SHA-512 verification; installation requires a separate restart choice. Automatic download/install-on-quit and downgrade are disabled. The native test uses a loopback-only synthetic feed to prove corrupted downloads are rejected and a valid installer preserves the profile, including OS-encrypted Google setup. Real releases use the fixed irrelevantco/irrelevant-os GitHub feed. This is unsigned publisher-controlled distribution; checksum integrity does not replace Authenticode publisher signing. No signing certificate or paid hosting was purchased.

Automatic release workflows accept only successful push checks for this repository's main branch, check out that exact SHA, reject superseded/duplicate releases and recheck main before publication. Fork/PR workflow results cannot enter the privileged release path. Generated version metadata changes only in the build workspace, with the source commit recorded in the artifact/release. Web deployment and database mutation are not enabled by this workflow.

Lead removal is owner-only and recoverable. Client visibility is not authorization: both server actions and database RPCs validate access; direct deletion-marker writes remain denied. Removed leads fail preparation/send/appointment eligibility, while suppression identities and audit history persist. A removal never sends a provider cancellation. In-flight or uncertain sends/calendar operations and future meetings must be resolved first. Restore preserves suppression and does not revive cancelled approvals. No hosted migration is performed by local integration or desktop repair tests.

## Optional campaign and research boundary

The optional acquisition engine is documented in [ACQUISITION_ENGINE.md](ACQUISITION_ENGINE.md); it supersedes the earlier statement that reply reading is unimplemented. Manual exact-email approval stays available. Automatic sending requires an explicit seven-day owner policy covering displayed fixed templates, identity, quotas and optional reply/invitation permissions, plus current manual verification/approval of all three review pillars. Configuration changes invalidate the policy. Checks repeat immediately before claim. No live policy is activated by installation or tests.

Gmail reading is a separate consent choice. Gmail has no thread-only scope: gmail.readonly technically grants broader access; application body reads are restricted to outbound CRM-tracked threads. Trusted Google DMARC alignment, exact contact/thread matching, quote removal and auto-response detection gate automatic reply actions. Any genuine reply stops follow-ups; opt-outs persist suppression. Unknown sends cannot automatically retry, and a manual reconciliation record is required to unblock. Shared account-volume checks are conservative but cannot prevent concurrent mail sent outside the app.

Website capture rejects private/reserved/mixed DNS answers, literal IPs, local domains, custom ports, social-platform crawling and off-site/downgrade redirects. Connections pin validated addresses, recheck redirect targets and enforce robots/time/size limits. Website/model text is untrusted data. Model recommendations never modify captured observations or verification. Optional OpenAI requires current pricing/per-call cap and explicit bounded consent; no keys reach the browser or package.
