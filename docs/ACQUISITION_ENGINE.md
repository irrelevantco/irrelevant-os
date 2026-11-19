# Local acquisition engine

This personal Windows update adds a free public-web research adapter, regional discovery, complete pipeline pagination and an optional bounded automatic campaign. It does not activate a campaign or contact anyone on installation. It does not negotiate prices, accept agreements, mark clients Won or process payments.

## Install without losing your workspace

1. Keep Docker running. In the installed Setup edition, choose **Workspace → Check for app updates…**, download, then install/restart.
2. Choose **Workspace → Update local database…** once, confirm the additive updates, then reload. Existing accounts, organizations, leads, notes and encrypted Google connection records are retained. Never reset your database or regenerate credentials to upgrade.
3. Open **Acquisition engine**. On Overview, **Your lead inventory → Download count report** reports the current account, organization, backend host, full active/Trash counts and the latest import summaries. It contains no credentials or email bodies.

The previously reported 387 → 311 Overview discrepancy cannot be diagnosed from a different computer's database. The former 500-card pipeline limit did not affect the Overview total. Check workspace/account/backend, Trash and committed import results before attempting recovery. An installer/source update does not copy another PC's database. This release does not claim that 76 records were recovered.

## Grow the inventory

The pipeline now queries the full organization with server pagination, 12 cards per stage page and full-dataset search. There is no 500/1,000 loaded-card cutoff. CSV import accepts up to 2,000 records / 1 MB with preview, mapping, row validation, organization ownership, commit-time deduplication and idempotent re-imports. Source URL and collection timestamp are preserved. Existing XLSX conversion can produce a prospect CSV; other workforce templates remain conversion tools, not payroll processing.

The regional preset covers NW Pennsylvania, NE Ohio and western New York, including Erie, Franklin, Bradford, Conneaut, Ashtabula, Akron, Jamestown, Angola, Dunkirk and Fredonia. The 13 categories cover service trades, food businesses, bakeries, cafes, salons and beauty businesses. Territories remain editable (up to 50).

In **Acquisition engine → Local controls**, enable the runner, select territories/categories and save. Free OpenStreetMap searches rotate through the coverage matrix until the active lead goal is reached. Each eligible category/hour targets up to five candidates; the default daily discovery allowance is 24 (maximum 56). A search scans at most 50 listings, so sparse data and exhausted sources can yield fewer or zero candidates. Municipality boundaries include county subdivisions (admin levels 7/8/9) and formal City/Town/Village names, correcting missed western NY results. Discovery has no guaranteed volume, uptime or email completeness.

Successful searches normally create import previews. **Import completed engine discovery previews automatically** is a separate owner opt-in; imported records always start Discovered and unverified. Existing source IDs and normalized name/location or first-party domains prevent duplicates. Social/booking URLs remain notes rather than shared-domain business identities. The legacy single-city schedule is disabled when engine controls replace it.

OpenStreetMap is community-maintained data, not proof of current operations, a contact's consent, a verified weakness or an available budget. Keep source attribution and ODbL obligations. The community endpoint is documented in [ACQUISITION_AUTOMATION.md](ACQUISITION_AUTOMATION.md). No Explee account is needed; no paid discovery fallback is used.

## Research, then verify

The runner queues A before B before C, within the daily allowance (default 25, maximum 50). A manually queued **Research public website** job is also available from a lead's Research page. Run queued research from Agent Control if outside the automatic working window.

The public-web adapter captures the supplied website and up to two same-site contact/about/service pages. It honors robots restrictions, crawl delay, nofollow/noAI directives and bounded time/size limits. It does not crawl protected social platforms, execute page JavaScript, submit forms, test private analytics or infer budgets. Private/reserved addresses, local hosts, arbitrary ports, unsafe redirects and DNS rebinding are blocked. Robots lookup failures stop the job. Individual pages can be unavailable; a failed job is not automatically retried.

Completed jobs propose **Digital Presence, Social Presence and Customer Growth** observations/recommendations with actual captured URLs. Accepting proposals copies them into the editable review as **unverified, low confidence**. Public mailto addresses, when found, appear as optional source-linked candidates; an owner may explicitly copy one only after checking it. Existing saved email contacts are never overwritten by that action. No addresses are guessed from names or domains.

Open each source yourself. Correct the observation and recommendation, set verification/confidence/date and suggested offer, then save. For automatic outreach, all three pillars must have a verified, source-backed observation, and the current review must receive manual owner approval. The older manual draft workflow still permits its original one-verified-observation gate; that is insufficient for an automatic campaign. Editing a review invalidates approval. Unverified imported hypotheses never satisfy either gate.

## Optional model assistance

**Free public-web checks** is the default: deterministic proposals, no model fees or keys. Optional **Local Ollama recommendations** uses only `http://127.0.0.1:11434/v1` and an explicitly chosen installed model. The app can list installed models; it never downloads a model. Website observations and sources remain fixed; models may propose recommendations, offer and summary only.

Optional **OpenAI** requires an explicit model, server-only OPENAI_API_KEY, current model token prices (AI_INPUT_USD_PER_MILLION / AI_OUTPUT_USD_PER_MILLION), AI_MAX_CALL_USD > 0 and <= 1, and an owner opt-in on the settings form. Conservative prompt/output reservation rejects calls over the cap. The daily research-job allowance bounds dispatches, including failures and carried-over queued work; the worker rechecks pause/cancellation/lease state after website capture before starting a model request. There is at most one model call/job, with no automatic model retry or paid fallback. Reconfiguring limits pauses the email policy. Usage records are estimates using configured prices and reported tokens, not billing statements. Do not configure paid models in packaged clients without reviewing operator provisioning; free/rules and local Ollama need no secret. NoAI pages skip model assistance.

## Connect Gmail reading separately

Existing sending connections do not include reply reading. On **Connections**, use **Connect Gmail replies for the engine** in the system browser, authorize the additional Gmail read scope, then return to the app. Google may require adding the owner as a tester for an unverified personal OAuth project. The connected account remains contact.irrelevantcollective@gmail.com. ChatGPT's Gmail connection is separate.

Gmail has no thread-only read scope: gmail.readonly technically grants mailbox-wide read access. The implementation uses sent-message IDs/counts and history IDs, and fetches bodies only for CRM-tracked outbound conversations. It checks prior sent history before introducing a business and holds previously contacted recipients for manual review. OAuth tokens stay encrypted, organization/owner/runtime scoped; disconnect revokes application access. Reselling to external users requires a reviewed OAuth verification/compliance path.

## Review and approve a seven-day campaign

1. Save sender name, fixed sender email and a real business postal address in Agent Control. Resume agents and enable the local engine.
2. Review the full **sourced-v1** templates and current sample messages on the engine page. These templates interpolate the exact manually verified observations, recommendations and sources. Website/AI text cannot issue sending instructions.
3. Set the rolling-24-hour message allowance (default **25**, maximum 500) and seven-day total attempt allowance (default **100**, maximum 1,000). The 10,000 confirmed-send goal is cumulative, not a daily allowance.
4. Optionally permit up to two follow-ups, one standard acknowledgement, and checked appointment offers/invitations. Review and check the policy approval box. It expires after seven days. Later eligible research approvals may send without another per-message checkbox under this policy.
5. Keep the Windows app open, PC awake, Docker available and the owner signed in. Automatic work runs **Monday–Friday, 7 a.m.–3 p.m. America/New_York**, at most one message per minute. The browser runner requires an open page and may be throttled in the background. There is no always-on hosted worker in this release.

The database rechecks policy expiry/revision, owner/runtime Google scopes, sender identity, review revision, all three sourced pillars, current contact, suppression, prior contact, fresh thread synchronization and shared account volume immediately before claiming delivery. Editing controls/identity, disabling sending, pause/stop, suppression or stale evidence blocks/cancels queued work. An already in-flight provider call may still complete after pause. Failed/uncertain attempts consume limits. Unknown delivery results block subsequent automatic sends until an owner checks Gmail and reconciles the outcome; they are never automatically resent.

Consumer Gmail documents a 500-message/day restriction and may restrict sooner for other reasons. Observed sent IDs and all app attempts conservatively share a rolling 24-hour 500 ceiling across organizations using this sender. Ordinary mail outside the app consumes allowance. Fresh counts cannot eliminate races with simultaneous external Gmail use; keep allowances below the provider maximum. This is a bounded personal workflow, not a 10,000-message blast capability. Check contact relevance and suppression quality as the pipeline grows.

## Replies and agreed appointments

Only actual inbound messages from the saved business address in tracked Gmail conversations become replies. Quoted text and automatic-response headers are excluded. Automatic actions require aligned DMARC authentication from Google's trusted Authentication-Results header; uncertain/ambiguous messages remain manual. Any genuine reply stops follow-ups; opt-outs persist suppression and cancel queued outreach.

Positive interest can produce a fixed acknowledgement or two available 30-minute options. Google free/busy and local appointments are checked. **Only an authenticated reply explicitly choosing Option 1 or Option 2 from an actually sent offer** may create an agreed meeting and authorized Google invitation. Availability is checked again before booking. Negotiated/ambiguous times, rescheduling, duplicate selections on a booked meeting and provider errors go to manual review. Deterministic event IDs prevent duplicate Calendar creation. A Google failure is shown as uncertain, not a confirmed invitation.

Open opportunity value counts recorded estimates for open leads with agreed appointments, once per lead. It refreshes every ten seconds on the visible dashboard; the engine page refreshes every 15 seconds while visible and no form is focused. Estimates are not confirmed client budgets, signed contracts, cash or revenue. No bot is authorized to secure a contract on your behalf in this release.

## Verification

`npm run test:engine` creates a disposable local database, applies every migration and checks >1,000-lead pagination, owner/member/tenant boundaries, campaign gates/quotas, idempotent claims, authentic reply/selection recording, agreement-backed estimates, opt-outs, 1,001-row import idempotency and source provenance. Fixtures use synthetic domains and credentials; no Google/discovery calls occur. Other RLS/import/agent/acquisition/Trash/upgrade tests and Playwright workflows cover existing behavior. Real Google delivery and real recipient agreement are not claimed from mocked provider or disposable database tests.
