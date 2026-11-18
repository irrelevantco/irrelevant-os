# Optional free phone preview

Render offers a free Node web service that can run this existing Next.js app. It sleeps after 15 idle minutes, may take about a minute to wake, and has usage limits. Render advises against production use. With no payment method, exceeding included bandwidth/build allowances suspends services/builds instead of charging overages. Do not add a paid plan or payment method if you want that behavior. External Supabase usage has separate limits.

Source: https://render.com/docs/free . Blueprint fields: https://render.com/docs/blueprint-spec . This is a personal preview option, not an always-on production promise.

The checked-in `render.yaml` creates only one explicitly free web service if you choose to launch it. It creates no database, disk, paid worker or scheduler, and disables automatic Git deployments. No Render service has been created from this repository yet.

## When you want to try it

1. Create/sign into Render, choose **New → Blueprint**, and connect `irrelevantco/irrelevant-os`. Review that the service compute plan is **Free** and automatic deployments are off before creating it.
2. Set `SUPABASE_URL` to your hosted project's HTTPS URL and `SUPABASE_PUBLISHABLE_KEY` to its publishable/anon key. Never use a service-role key. Set `OPERATOR_EMAIL_ALLOWLIST` to the exact email you will sign in with.
3. Set `APP_URL` to the assigned HTTPS `.onrender.com` address. Configure the same Supabase Auth Site URL and allow the exact `/auth/callback` redirect. Use an owner account for that hosted backend and confirm its email as required.
4. Confirm all reviewed CRM, import, preparation, acquisition and explicit-RPC-privilege migrations are present in hosted Supabase. The existing iRRELEVANT project was upgraded and read-back verified during this release; a new project still needs all migrations. Do not run fixture tests there.
5. Manually deploy. Verify sign-in, organization access, a manually created lead, sign-out, and phone layout before relying on it. A homepage health check alone does not prove the CRM works.
6. Open that HTTPS address on your phone. Safari: Share → Add to Home Screen. Chrome: Install app / Add to Home screen.

Your hosted database is separate from your Windows local database. Both devices share records only when they use the same hosted backend/account. Do not overwrite local research with a fresh CSV reimport. Export/migrate your existing work deliberately; automatic local-to-cloud transfer is not implemented.


## Current setup status

No hosted phone URL is available yet. A Render connector was found and offered, but its account connection is not confirmed. Connecting it authorizes the agent to create the explicitly Free service from this existing repository; merely connecting Vercel/Supabase does not connect Render. The hosted schema upgrade succeeded with 18 public RLS tables, no organizations/businesses and no active automation. It did not copy Windows data or create a hosted login. Google Cloud sign-in was not completed, so an OAuth project/client was not created either. Do not interpret the Add to Home Screen instructions as proof that hosting already exists.

Version 0.3.0 shows a specific unconfigured phone-hosting message for local installations. Once hosting is actually deployed, use the actual HTTPS origin and hosted account. A new hosted database does not copy local accounts, notes or research. Complete and verify the cloud schema/account/data transition before switching a valuable local workspace. Free hosting and an always-on hourly worker are separate concerns; see ACQUISITION_AUTOMATION.md.
