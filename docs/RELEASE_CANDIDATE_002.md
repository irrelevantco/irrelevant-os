# Personal application and controlled preparation — release candidate 0.2.0

Existing repository and local data were preserved. This release adds the preparation queue, persistent opt-outs/contact logging, Explee company-search boundary, production operator allowlist, phone installation guidance and a portable Windows Electron package around the same Next.js standalone build.

## Verification

- TypeScript, zero-warning ESLint, production build and 81 unit tests passed locally.
- Real local integration checks: 24 CRM/RLS + 42 import/review + 39 preparation assertions.
- Four desktop/mobile browser flows cover authentication, CRM, tenant switching, CSV import, sourced review approval, draft editing, preparation proposal acceptance and pause controls.
- Electron Linux package: setup → embedded server on automatic loopback port → real local sign-in → private CRM → Agent control passed. This is separate from the Windows-native package check.
- Fresh temporary database: all additive migrations apply; all 15 current public tables have RLS. Only the verification database was dropped.
- The manual **Personal Windows application** GitHub workflow builds on Windows, verifies native package startup and produces a ZIP/checksum artifact. Check its run result before distributing the Windows artifact.
- Explee transport tests are mocked. No paid API request, email, call, live charge or public website deployment occurred.

## Hosted state

Supabase project `velmvulrofkmmdnaxnlk` / iRRELEVANT-OS, organization iRRELEVANT CO., was resumed on its existing free plan. Its empty July prototype tables were preserved in `irrelevant_legacy_202607`; no table or business record was deleted. Phase 1 and prospect/review migrations are applied. A follow-up migration explicitly revokes anonymous RPC execution, including grants inherited from hosted default privileges; verification found zero anonymous-executable app RPCs across the nine existing APIs.

The owner-only preparation migration is not yet applied remotely: its confirmation expired twice. The initial design with anonymous worker capabilities was rejected by automatic approval review and was removed from code. The replacement has no anonymous worker endpoint, cron route, worker credential table or service-role client. Hosted unattended processing is not enabled. Local preparation works through authenticated owner actions.

Vercel project `prj_zeskBnB30pcdHfndXwfl7kGvMjAy` / irrelevant-os, team i-rrelevant-co, is connected to the source repository. Team access was approved. The account is on Hobby; Vercel's published commercial-use rules require Pro. No upgrade or purchase is authorized. `vercel.json` disables Git auto-deployment so pushing this code does not publish it on that plan. A new tested production deployment has not been made.

## Run and credentials

Local source: `npm ci`, `npm run local:setup` (applies additive migrations), `npm run dev`, port 3030. Existing setup: `npm run local:migrate` before starting the updated app. Portable Windows: extract all files, open iRRELEVANT OS.exe, import only the existing `.env.local` connection, enter the existing operator email, sign in. Local Docker/Supabase must be running; the package does not duplicate or reset that database.

Phone: install the HTTPS hosted PWA once the hosted release is approved and verified. A local Windows account/database is distinct from hosted Supabase. Both desktop and phone must use the hosted backend/account to share records. No automatic local-to-cloud data transfer is claimed.

Optional discovery needs a server-only Explee API key and explicitly approved credit allowance. The rules provider needs no AI credentials. Gmail/Calendar OAuth, OpenAI/Ollama generation, payments, PDF reports and automatic mailbox reply sync remain future modules.

Next release steps: apply the reviewed owner-only hosted preparation migration; approve/activate suitable commercial hosting without unbounded usage; configure exact operator allowlist, production Supabase URL/key, Auth Site URL/callback and email delivery; stage and verify the production build before promoting it; let the owner create their hosted account and explicitly migrate/import their records. Do not run fixture tests against that hosted database.
