# Explee workflow research — November 17, 2026

Reviewed public product information and the published API specification, not signed-in product screens, private customer lists or protected social content. Public marketing claims are not verified sales results or forecasts for iRRELEVANT CO.

Sources:

- https://explee.com/ — product workflow: define target companies, find contacts, prepare outreach, handle replies and meetings, manage campaigns.
- https://api.explee.com/public/api/docs — documented search and enrichment endpoints, API authentication, credits and quotas.
- https://api.explee.com/public/api/openapi.json — company-search request/response contract used by the adapter.
- https://explee.com/terms-of-use — permitted-use and billing obligations. Provider automation defaults do not override this application's approval requirements.

## Applied here

| Public workflow | iRRELEVANT implementation |
| --- | --- |
| Company targeting | Industry, US city, at most ten candidates, relevance filter; optional fixed-endpoint company-search adapter |
| Research and qualification | Three-pillar research checklist and five evidence criteria; human research and approval remain required |
| Personalized outreach | Deterministic drafts using only recorded verified observations from an approved review; sender identity and postal address required |
| Follow-up | Actual outbound contact must be logged, at least three days old, with no later reply; at most three accepted follow-up drafts per lead |
| Campaign control | Tenant queue, per-day limits, reservations, leases, pause, stop, suppression, owner approvals and audit history |

## Deliberately excluded

No autonomous sending, reply handling, mailbox synchronization, contact enrichment, provider campaign creation, saved-card purchases, top-ups or scraping of protected content. No provider revenue/traffic estimates are treated as verified business facts. A research plan is not a completed audit. The baseline provider is rules/templates, not an LLM; OpenAI/Ollama integration is future work.

## Actual discovery boundary

Only `POST https://api.explee.com/public/api/v1/search/companies` is called. It uses `X-API-Key`, page 1, page_size 1–10, selected industry and US city. Results are provider-supplied candidates. They create an import preview only after owner action, then still require the normal CSV validation/deduplication/commit workflow. Source label, URL and generation time remain in the job record. Imported hypotheses stay unverified.

The published specification describes 0.5 credits per returned company; the queue reserves that amount even if a conditional free quota might apply. A positive provider balance may be required. No zero-cost search is promised. The credit allowance starts at zero and every search requires an owner confirmation. Provider charges are not USD estimates. Unexpected reported charges pause automation, but no application can undo an already-billed request or guarantee an external provider's future pricing. Review current provider terms before enabling; do not enable automatic provider top-ups. Failed or timed-out discovery calls are never automatically retried because their billing outcome may be unknown.
