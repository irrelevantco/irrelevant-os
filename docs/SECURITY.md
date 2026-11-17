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

CSV inputs are bounded to 512 KB, 500 rows, 40 unique columns and validated per row with Zod. Formula-like input is stored/rendered as plain text; no spreadsheet export or execution exists. Raw imported claims remain unverified. New import/review/draft tables deny direct writes and enforce RLS; security-definer RPCs explicitly validate tenant membership/owner role with fixed search paths. Approval requires a current review revision and a manually verified source-backed observation, enforced again by a lead status trigger. Review edits invalidate approval. Introductory templates make no weakness/budget claims, and the draft table cannot represent sent messages. No provider credentials or service-role keys are used. Generated local owner/GitHub credentials remain ignored and must never be committed.

## Personal desktop and preparation

The Electron shell has contextIsolation/sandbox/webSecurity enabled and nodeIntegration disabled. Only the local setup page receives a minimal validated IPC bridge. Application pages have no preload bridge, unexpected in-window navigation is blocked, permissions are denied, and external links are limited to HTTP(S). The standalone server binds only to loopback on an automatic port and exits with the app. Packaging excludes .env files and local credential artifacts.

Preparation claims and completion require an authenticated organization owner. No anonymous worker RPC, scheduler secret or application service-role bypass exists. Production operator access is exact-email allowlisted and defaults to deny. Persistent opt-out checks are independent of CRM stages. Explicit RPC privilege revocation handles hosted default anon grants; membership checks remain mandatory inside privileged API functions. See AGENT_CONTROL.md for precise limitations.
