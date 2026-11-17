# Phase 1 session report

Date: November 17, 2026. Repository: `/workspace/irrelevant-os`.

## Outcome

The workspace was empty. A new local Git repository now contains a functioning Next.js App Router CRM using Supabase Auth, PostgreSQL RLS, TypeScript, Tailwind and source-owned shadcn/ui components. No Framer dependency. Nothing was pushed, deployed or published; no external messages, charges or purchases occurred.

Implemented: signup/signin/signout and session refresh; organization creation, switching and owner renaming; public business identity/contact/social/source records; atomic business + lead creation and deduplication; business editing; all 12 pipeline statuses; append-only notes; follow-up dates and due queue; searchable/filterable/paginated lead table; pipeline board; full-dataset CRM aggregates; database-generated activity; branded public homepage; responsive desktop/mobile styling; PWA manifest, icons and online-only service worker; documentation and GitHub CI.

Phase 1 explicitly excludes discovery providers/CSV, qualification scoring, AI reviews/PDFs, Gmail/Calendar, outbound approvals/sends, offers/proposals/contracts, Stripe, client delivery operations, full marketing pages and future creator/investment modules. These are documented plans, not functional placeholders.

## Verification results

| Check                                       | Result                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| `npm run local:up` on a new database volume | Passed: PostgreSQL + Supabase Auth + PostgREST + gateway      |
| `npm run local:migrate`                     | Passed from clean database                                    |
| Second `npm run local:migrate`              | Passed: recognizes already-applied migration                  |
| `npm run test:rls`                          | 24 real API/database security and integrity assertions passed |
| `npm run typecheck`                         | Passed from removed `.next` and missing generated Next types  |
| `npm run lint`                              | Passed with zero warnings                                     |
| `npm test`                                  | 36 Vitest tests passed                                        |
| `npm run build`                             | Optimized Next.js production build passed                     |
| `npm run test:e2e`                          | Both complete desktop and mobile workflows passed             |

Browser workflows cover protected-route redirects, signup, organization creation, empty states, manual lead creation, note persistence, stage updates, contact editing, real follow-up/qualification metrics, search/stage filters, board/activity, organization switching, unavailable records, duplicate rejection, logout/login and HttpOnly/SameSite cookies. They assert actual viewport width (1280 desktop, 412 mobile), avoiding a false pass caused by an expanded mobile layout viewport. Screenshots from test fixtures were inspected. Fixtures are synthetic and isolated in test accounts, never seeded into a real operator organization.

The full standard Supabase CLI image could not fit within this environment's disk capacity. The included lightweight local profile was built and verified against actual PostgreSQL, Supabase Auth and PostgREST; it uses the same application migration. Standard CLI and hosted Supabase configuration remain available but were not fully exercised here. This local profile omits Storage, Studio, Realtime and SMTP and is not a production self-hosting recipe.

The managed interactive preview relay failed to become ready. The project Playwright runner successfully tested a local server directly; no shareable preview URL is available. Actual PWA installation prompts and hosted email confirmation delivery were not interactively tested. The manifest/icons/service-worker source are included, and production compilation succeeded.

## Credentials and operation

No external credentials are needed for the verified local profile. Generated local credentials are in ignored `.env.local` and `work/stack.env`; neither is committed. Production needs a Supabase project URL/publishable key, reviewed Auth configuration/SMTP and HTTPS hosting. Google, Stripe, AI and job credentials are future-phase placeholders only.

For this existing workspace, the backend is already running: `npm run dev`, then open `http://localhost:3000`. Create your own account and organization; no test-account credentials are required. On a fresh checkout:

```sh
npm ci
npm run local:env
npm run local:up
npm run local:migrate
npm run dev
```

`npm run local:down` preserves data. See README.md for the alternative standard CLI/hosted setup, tests, limits and production prerequisites. Owner invitations, password recovery UI/MFA policy, monitoring, backup/restore validation and operational privacy controls remain hardening work before production exposure.

Next implementation: Phase 2 permitted discovery provider contracts, CSV preview/import and evidence-backed qualification with quotas, provenance and idempotency. Fit remains more important than lead volume.

## Added files

All files below are new; no existing application files were overwritten. Build outputs, dependencies, local credentials and test artifacts are ignored.

- `.env.example`
- `.github/workflows/ci.yml`
- `.gitignore`
- `.nvmrc`
- `.prettierignore`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `components.json`
- `compose.phase1.yml`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/GOOGLE_INTEGRATION.md`
- `docs/ROADMAP.md`
- `docs/SALES_WORKFLOW.md`
- `docs/SECURITY.md`
- `docs/SESSION_REPORT.md`
- `eslint.config.mjs`
- `local-stack/nginx.conf`
- `local-stack/roles.sh`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `playwright.config.ts`
- `postcss.config.mjs`
- `public/icon-192.png`
- `public/icon-512.png`
- `public/icon-maskable.png`
- `public/icon.svg`
- `public/sw.js`
- `scripts/dev.mjs`
- `scripts/local-env.mjs`
- `scripts/local-migrate.mjs`
- `scripts/local-typegen.mjs`
- `src/app/(workspace)/dashboard/activity/page.tsx`
- `src/app/(workspace)/dashboard/layout.tsx`
- `src/app/(workspace)/dashboard/leads/[id]/page.tsx`
- `src/app/(workspace)/dashboard/leads/new/page.tsx`
- `src/app/(workspace)/dashboard/leads/page.tsx`
- `src/app/(workspace)/dashboard/loading.tsx`
- `src/app/(workspace)/dashboard/not-found.tsx`
- `src/app/(workspace)/dashboard/page.tsx`
- `src/app/(workspace)/dashboard/pipeline/page.tsx`
- `src/app/(workspace)/dashboard/settings/page.tsx`
- `src/app/actions.ts`
- `src/app/auth/callback/route.ts`
- `src/app/error.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/login/page.tsx`
- `src/app/manifest.ts`
- `src/app/not-found.tsx`
- `src/app/onboarding/page.tsx`
- `src/app/page.tsx`
- `src/app/setup/page.tsx`
- `src/app/signup/page.tsx`
- `src/components/auth-shell.tsx`
- `src/components/brand.tsx`
- `src/components/forms.tsx`
- `src/components/leads-table.tsx`
- `src/components/page-heading.tsx`
- `src/components/pwa.tsx`
- `src/components/sidebar.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/lib/context.ts`
- `src/lib/data.ts`
- `src/lib/domain.ts`
- `src/lib/supabase/database.types.ts`
- `src/lib/supabase/server.ts`
- `src/lib/utils.ts`
- `src/proxy.ts`
- `supabase/config.toml`
- `supabase/migrations/202611170001_phase_one.sql`
- `tests/e2e/crm.spec.ts`
- `tests/integration/local-guard.ts`
- `tests/integration/rls.ts`
- `tests/unit/domain.test.ts`
- `tsconfig.json`
- `vitest.config.ts`
