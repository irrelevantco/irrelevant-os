# Hourly acquisition and agreed opportunity value

Version 0.3.0 adds opt-in discovery targets, agreed appointments, approved-delivery APIs and live dashboard polling. Defaults remain disabled. No emails or invitations were sent during implementation.

## Hourly discovery

On **Connections**, choose city/state and categories, then explicitly enable hourly discovery. Seven default categories are cleaning, HVAC, plumbing, roofing, electrical, landscaping and general contractors. Target: up to five new OpenStreetMap candidates per category per hour, Monday–Friday, 7 a.m.–3 p.m. America/New_York. The current hour is queued when the runner becomes active; past hours are not replayed. Seven categories means at most 56 scheduled searches / 280 candidate targets per workday. Candidate counts are targets, not guarantees or qualification scores.

The owner opt-in sets a 100-job daily total ceiling and resumes preparation. Existing paid allowance is retained; hourly discovery uses no Explee credits and cannot purchase anything. Requests are staggered at 65-second intervals, with execution cooldowns, no automatic provider retries and one idempotent job per category/hour. Disabling the workflow cancels its pending/running results. Pause/stop controls override it. Failed searches count conservatively toward the day's job ceiling.

Completed candidate results automatically create normal import previews. Records still require explicit owner import confirmation before becoming Discovered businesses/leads. Their research metadata stays unverified. Source IDs previously returned are excluded locally from a bounded 50-listing scan. A city/trade can exhaust this scan; the app reports fewer/no new candidates rather than reusing or inventing businesses. Domain/name/location deduplication applies again on import. Broader permitted providers/geographies can be added later with separately approved limits.

The community North America endpoint is https://ovp.dresel.systems/api-na/interpreter. It has no key requirement or uptime guarantee. It receives only public city/trade filters. Read its [terms/privacy](https://ovp.dresel.systems/impressum.html); the provider logs requests/IPs for 14 days. Retain OpenStreetMap attribution and ODbL obligations. Review capacity and terms before reselling a widely used multi-company deployment.

## What runs unattended

The **Windows app's native runner** checks once per minute while the app is open, PC awake, backend available and an owner signed in. It uses the owner's existing encrypted browser session and invokes the same authenticated endpoint. No worker password, service-role key or anonymous RPC is provisioned. Closing the app, sleeping the PC or signing out prevents execution. An open web page supplies a browser timer when explicitly enabled; phone OS/background-tab throttling can delay it.

This is not an always-on hosted scheduler. Render Free sleeps and does not provide a free background worker. Phone hosting can use hosted Supabase while the PC is off, but that alone does not run hourly jobs. An always-on reviewed authenticated runner remains a separate deployment task; do not advertise 24/7 operation from this release.

Each tick queues the current eligible batch and processes at most one eligible preparation/discovery job. Research plans are checklists, not completed audits. Drafts require researched evidence and remain pending owner acceptance. Follow-ups require actual logged outbound contact at least three days old, no later logged reply and no suppression. Email sending and invitations are separate explicit actions; the heartbeat never sends either.

## Open opportunity value

The main dashboard metric now sums the recorded estimates of open leads with at least one non-cancelled agreed appointment. Each lead counts once even with multiple meetings. Closed/Won/Lost/Suppressed leads are excluded. Leads without an estimate contribute no assumed value and are disclosed. The separate all-open-lead estimate total remains visible for comparison. These amounts are neither confirmed budgets nor contracts, revenue, cash or MRR.

Metrics refresh every ten seconds while the page is visible, and on returning to the tab. Refresh failures retain the last values with a stale warning. No WebSocket/instantaneous update claim is made. Integration and browser tests verify meeting-backed value, overlap checks, cancellation, organization isolation and updates without page reload.

## Regional engine extension

The above describes the legacy single-city scheduler. The newer optional **Acquisition engine** replaces that schedule when enabled and adds rotating territories, bounded public-web research and separately approved seven-day sending/reply/appointment policies. Its default daily discovery allowance is 24, maximum 56; optional auto-import is an explicit independent choice. The local availability and opportunity-value definitions above still apply. See [ACQUISITION_ENGINE.md](ACQUISITION_ENGINE.md) for current behavior, approval gates and Google read-permission requirements.
