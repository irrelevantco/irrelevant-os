# iRRELEVANT OS

**Build your position.** A business-first client acquisition workspace for iRRELEVANT CO.

A Next.js App Router acquisition CRM with Supabase authentication, organization-level RLS, businesses, leads, notes, pipeline, and Prospect Batch 001 import/research. CSV preview/mapping, deduplication, editable three-point reviews, owner approval gates and draft-only outreach preparation are implemented. Sending, payments, automatic discovery/AI research and public publishing are not enabled.

## Requirements

- Node.js 22.12+ (tested on 24), npm, Docker with Compose v2 for local services.
- Roughly 2 GB free for the lightweight Phase 1 stack and application; the full Supabase CLI stack needs considerably more.
- No paid account or external credentials needed for the lightweight local setup. GitHub access is needed only to synchronize source.

## Run locally (recommended for Phase 1)

```sh
npm ci
npm run local
```

Windows checkout: see `docs/WINDOWS_SETUP.md` for non-destructive sync/startup instructions. `localhost` refers to the computer running Next.js.

Open **http://localhost:3030**, choose Workspace → Create an account, then create your organization. Passwords require at least 12 characters. Local accounts auto-confirm; local email delivery is not configured. Add your own businesses; the app never seeds dashboard figures.

`local:env` creates ignored `.env.local` and `work/stack.env` files with randomly generated **local-only** credentials. It refuses to overwrite existing files. `local:up` runs PostgreSQL 15, Supabase Auth (GoTrue), PostgREST, and a loopback-only gateway. This profile implements the Phase 1 backend; it excludes Storage, Realtime, Studio, and email delivery. It is not a production self-hosting template. Only ports 54321 (API) and 54322 (database) bind to loopback. Data persists in the `irrelevant-phase1_phase1-db` Docker volume. `local:migrate` records the migration version and safely skips it on subsequent runs.

```sh
npm run local:down  # stop without deleting your local database
npm run local:up    # resume
```

Do not regenerate local credentials against an existing volume. Back up your data first if deliberately resetting the development stack. Do not use the lightweight profile and the full CLI stack simultaneously; they share ports.

## Standard Supabase CLI or hosted development project

The normal `supabase/config.toml` and migration are included. As an alternative to the lightweight profile:

```sh
cp .env.example .env.local
npm run db:start
# Use the URL and anon/publishable key printed by the CLI in .env.local.
npm run dev
```

The CLI applies migrations on first startup. `npm run db:reset` is destructive to the **local CLI database**; do not run it against valuable data. For a dedicated hosted development Supabase project, set its URL and publishable key in `.env.local` and apply `supabase/migrations/202611170001_phase_one.sql` using the Supabase SQL editor or your normal migration process. Do not use a service-role key as the publishable key. Restart Next.js after changing environment values.

For hosted Auth, configure Site URL and the exact `/auth/callback` redirect for your origin. Enable email/password auth, email confirmations, SMTP, rate limits, and abuse protection. The callback uses PKCE; follow the Supabase PKCE email confirmation template requirements. Organization membership is checked server-side for every operation. The browser never calls Supabase directly.

## Prospect Batch 001

Open **Imports**, upload a CSV or load the included `data/imports/irrelevant_os_30_prospects.csv`, map columns, review the persisted preview, then explicitly import as organization owner. Use **Research** for the A/B/C queue and editable three-point reviews. Owner approval of a sourced, verified observation is required for Ready for Outreach. **Outreach drafts** prepares neutral introductions and call scripts without sending. See `docs/PROSPECT_BATCH_001.md` for exact behavior and local import results.

`npm run batch:import` explicitly creates/reuses a dedicated local workspace with an ignored owner login file and imports all 30 records. It is local-only and idempotent. Database contents and generated credentials are not transferred through Git.

## What works

- Sign up, sign in, refresh sessions, sign out; protected dashboard and server actions.
- Create multiple organizations, switch between memberships, rename an organization as owner.
- Atomically create a business and its lead with source URL, recorded timestamp, source notes, public contact information, social links, optional opportunity estimate, and follow-up date.
- Deduplicate by canonical domain, or case-insensitive name + location when no website is known; duplicate creation cannot leave an orphan business.
- Search businesses, filter by stage or due follow-ups, paginate results, and view the 12-stage pipeline board.
- Edit business details, change pipeline status, update estimates and follow-up dates, append lead notes.
- Organization-scoped, append-only activity logs generated by database triggers.
- Database-backed total leads, qualified-and-progressing leads, open estimated opportunity value, won count, and due follow-ups.
- Responsive interface, basic public brand homepage, installable PWA manifest/icons and online-only private workspace. No private offline cache.

Marking a lead Won records a manual CRM stage; it does not verify a signed agreement or payment. Estimates are not booked revenue, cash, or MRR. No synthetic production figures are shown. Notes show the latest 100 entries. The board shows the most recently updated 500 leads and discloses the limit; table search and metrics use the full organization dataset. Times and due dates use America/New_York.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:rls
npm run test:imports
npm run test:e2e
```

The RLS and browser tests create clearly named synthetic accounts/organizations in a **loopback-only**, explicitly enabled local database. Set `ALLOW_LOCAL_INTEGRATION_TESTS=true` in `.env.local` (generated by `local:env`). They refuse remote Supabase URLs. They never use production credentials. Fixtures remain in those test users' isolated organizations for inspection; use a fresh local development database for a clean environment. Playwright uses the existing local preview URL if `PLAYWRIGHT_BASE_URL` is set, otherwise starts the Next.js dev server. Install a compatible Chromium with `npx playwright install chromium` if no browser is installed. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when using an existing system Chromium.

Regenerate database types after schema changes: `npm run db:types` for the standard CLI stack, or `npm run local:types` for the lightweight stack. Types are checked in, so normal builds do not require a running database. Never regenerate types against production without an approved read-only workflow.

## Repository map

- `src/app/` — public homepage, auth, setup, onboarding, protected dashboard, server actions.
- `src/components/` — branded shell, forms, tables, source-owned shadcn/ui primitives.
- `src/lib/` — Zod contracts, authenticated context, server-only data layer, typed Supabase client.
- `supabase/` — production-targeted SQL migration and full CLI configuration.
- `local-stack/`, `compose.phase1.yml`, `scripts/local-*.mjs` — optional local Phase 1 services.
- `tests/unit/`, `tests/integration/`, `tests/e2e/` — validation, real API/RLS integrity, browser workflows.
- `docs/` — architecture, database, security, sales workflow, Google integration plan, roadmap.

## Production path and current limits

Vercel-compatible `npm run build` / `npm run start`; no Vercel-specific runtime or Framer dependency. Use a managed Supabase project, HTTPS, reviewed environment settings, and run the migration in staging before production. Keep `.env.local` and `work/` out of Git. The checked-in code is a Phase 1 foundation, not an audited production deployment. No deployment has been performed. The supplied GitHub remote is configured; check the latest session handoff for whether authentication and push completed.

Membership invitations/management, password recovery UI, MFA enforcement, data export/deletion tooling, database backup/restore drills, error monitoring, and production abuse controls remain hardening work. Members can edit CRM records in their own organization; only owners can rename it. There is no in-app membership mutation. Import and review approval require owner role; members may edit research and drafts. Administrators may provision memberships through reviewed database administration until invitations are built. Users must not be allowed to self-enroll into existing organizations.

The public site is only a truthful brand homepage in this phase. Services, partnerships, work, review intake, contact, privacy, and terms pages are planned; no unauthorized client materials, invented results, or testimonials are included. No claim about another creator's sales results is relied upon.

Next: permitted discovery providers and evidence-based qualification scoring. CSV imports, manual research priorities and editable reviews are now implemented; automatic scores and provider discovery remain future work. See `docs/ROADMAP.md` for acceptance criteria.
