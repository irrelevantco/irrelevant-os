# Google integration plan — Phase 4, not implemented

Phase 1 supports Supabase email/password authentication only. Google OAuth, Gmail drafts/sending, replies, Calendar and encrypted provider token storage are not present. Environment keys are placeholders, not connected capabilities.

## Separate identity from capabilities

Google login, if later added, is distinct from permission to read/send Gmail or manage Calendar. Begin with least-privilege incremental OAuth grants and clear account identity. Never request broad scopes merely because the API offers them. Use exact redirect URIs, anti-CSRF state, PKCE where supported, short-lived state and server-side code exchange.

Potential scopes, selected only for an implemented capability:

| Capability                 | Candidate scope                          | Notes                                                         |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| Connect identity           | openid email profile                     | Avoid profile if name/avatar are unnecessary                  |
| Send approved messages     | gmail.send                               | Does not grant full mailbox access                            |
| Read reply threads         | gmail.readonly                           | Restricted scope; minimization/verification obligations apply |
| Create Gmail-native drafts | gmail.compose                            | Broader restricted scope; prefer app-local drafts first       |
| Mark/modify mailbox items  | gmail.modify                             | Do not request unless explicit behavior requires it           |
| Availability               | calendar.freebusy                        | Prefer to broad calendar read                                 |
| Create owned event         | calendar.events.owned or calendar.events | Choose least capable valid scope for the actual calendar      |

Review Google's current requirements at implementation time. Gmail read/compose scopes can require OAuth verification and additional assessments depending on data handling and user type. Do not claim an integration is ready until consent, token lifecycle and required verification are tested.

## Token and data boundary

Store encrypted provider credentials in a tenant-scoped server-only connection store excluded from client SELECT grants. AES-256-GCM (or equivalent authenticated encryption), random nonce, versioned key ID, rotation path, refresh locking and sanitized errors. Keep refresh tokens out of logs, client props, cookies, localStorage and public environment variables. Bind the connection to the approving operator and organization; prevent sharing access across tenants. Disconnect revokes when possible and removes stored tokens.

## Outbound state machine

App-local draft → reviewed exact version → explicit approved send request → bounded queued job → suppression/approval/quota/cancellation recheck → provider send → immutable provider message/thread ID and result. Edits invalidate approval. Store a unique idempotency key and reconcile ambiguous provider responses before retrying; never blindly send a second email after a timeout. Gmail sending has no general server-side idempotency key, so ambiguous sends need human reconciliation.

Sender identity, public postal address, opt-out instructions, small daily limits and suppression checks are mandatory before enabling any send action. A positive-reply classifier offers an interpretation for operator review and cannot schedule or send autonomously. Opt-outs suppress promptly, even if the CRM stage has not been manually updated.

## Reply and Calendar sync

Start with manually initiated, bounded thread sync or polling; later use validated Gmail watch/PubSub notifications and history cursors with expiry recovery. Fetch only necessary threads and retain minimal content. Rate-limit by organization/account and log provider usage/errors without message bodies. Avoid double importing by unique account + provider message ID.

Calendar availability and event creation require separate authorization. Avoid duplicate events through durable request keys and provider reconciliation. Capture timezone, guests and conferencing preferences explicitly. Never notify invitees or create external events without approval.

## Required tests

OAuth state/redirect attacks; revoked grants; refresh expiry/concurrency; cross-tenant connection access; encrypted token round trips/key rotation; scope minimization; edited draft approval invalidation; duplicate/ambiguous sends; daily limits and suppression races; opted-out replies; cancellation; bounded retries; thread deduplication; Calendar timezone and duplicate handling. Default sending and external scheduling remain disabled until these pass and the user authorizes activation.
