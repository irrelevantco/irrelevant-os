# iRRELEVANT OS — contributor instructions

Read README.md and docs/ARCHITECTURE.md before changes. Current implementation scope is Phase 1. Preserve the Next.js App Router + TypeScript + Tailwind + source-owned shadcn/ui + Supabase architecture. Framer is not a dependency.

- Business goal: roughly one new $3k–$10k service-industry engagement monthly, eventually $25k/year partnerships. These are goals, not claimed results.
- All business records belong to an organization. RLS is mandatory; never introduce application service-role bypasses.
- Authenticate server-side with `getUser()`, validate every mutation with Zod, derive organization from a validated membership. A cookie is a preference, not authorization.
- Keep API clients/secrets on the server. App Supabase sessions use the caller's JWT and HttpOnly cookies. No secret belongs in `NEXT_PUBLIC_*`.
- Keep notes and audit logs append-only. Preserve original source provenance; use notes for corrections/evidence.
- Never fabricate metrics, client revenue, testimonials, case studies, source facts, or audit observations. Explicitly distinguish estimates, observations, assumptions, and verified facts.
- Never send outreach, create live charges, change billing, publish, deploy, or buy services without the user's explicit authorization. Later agents must require approved artifacts and bounded budgets.
- Later Google OAuth tokens require authenticated encryption at rest; Phase 1 has no Google token storage.
- Later job handlers require bounded retries, idempotency, cancellation checks and spending/rate limits.
- Keep changes accessible and responsive. Black/charcoal, off-white, restrained acid green; editorial headings and practical CRM tables.
- After meaningful changes, run typecheck, lint, unit tests and build. Run local API/RLS and Playwright checks for data/auth flows. Never run fixture-creating tests against production.
- Do not claim a planned adapter, approval flow, payment flow or static screen is complete functionality. Document partial implementation precisely.

Commands and setup are in README.md. `.env.local`, `work/`, `.next/`, and browser artifacts are intentionally untracked.
