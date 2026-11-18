# Google connection — personal preview 0.3.0

The OAuth, encrypted credential store, exact-message Gmail delivery and owned-calendar adapters are implemented. No Google Cloud project/client has been created in this session; Google Cloud sign-in was not completed. Live Gmail sending and Calendar writes have **not** been verified or activated. Provider transport tests use synthetic responses and never send a message or invitation.

## Create the Google application

Use an account you control in Google Cloud Console. Create/select a project and enable **Gmail API** and **Google Calendar API**. This app does not provision paid Google services. Configure Google Auth Platform branding/audience and a contact email you control. For personal testing, add `contact.irrelevantcollective@gmail.com` as a test user. External testing refresh tokens can expire after seven days; expect reconnection. Production use and additional users may require Google's verification and appropriate published privacy information.

The implemented permissions are `openid`, `email`, `gmail.send`, `calendar.freebusy`, and `calendar.events.owned` (Google API scopes use the full `https://www.googleapis.com/auth/` prefix). They identify the verified account, send approved mail, check availability and create/reconcile events on owned calendars. Mailbox reading, reply synchronization and Gmail-native drafts are not included. Google login for the CRM is separate from this capability connection.

### Windows bundled application

1. Create an OAuth client of type **Desktop app** and download its official client JSON. A Web client JSON or service-account key is not interchangeable.
2. In iRRELEVANT OS choose **Workspace → Import Google OAuth setup…** and select that JSON locally. No secret belongs in chat, Git or your CSV. The client secret and a generated encryption key are encrypted with the OS credential facility in the current Windows profile; the app refuses plaintext fallback.
3. Choose **Workspace → Open Google connection in browser…**. Sign in to the CRM in that browser, then choose **Connect / renew Google permission**. Google consent happens in the system browser, not an embedded Electron login. The Desktop client uses the app's automatic loopback callback port with PKCE and one-time code exchange.
4. Select the verified company Gmail account. A different account is rejected. The callback stores encrypted credentials; it does not enable sending.

### Hosted web application

Create a **Web application** OAuth client. Register the exact redirect `https://YOUR-ACTUAL-HOST/api/integrations/google/callback`. Set server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `OAUTH_TOKEN_ENCRYPTION_KEY` (32 cryptographically random bytes, base64). Use the host's secret input, never a public variable. Restart/redeploy and complete the same connection flow from Connections. `APP_URL` must be the actual canonical HTTPS origin.

The encryption key must persist across deploys. Changing it requires reconnecting or a reviewed key rotation. Credential envelopes are bound to organization, owner and encryption-key identifier. A desktop installation and hosted server can have distinct encrypted connections without overwriting each other. For one shared Google connection across devices, use the hosted application on phone and desktop's hosted-app mode. Disconnect removes this runtime's encrypted credential; revoke the app's grant separately in Google Account settings if desired.

## Send one reviewed message

Configure sender name, the exact company sender email and a real business postal address in Agent control. Research and manually approve a sourced Growth Review. Save the outreach draft. On Connections, explicitly enable approved sending, then review the saved recipient, subject, full body and appended identity/opt-out footer on the prospect's outreach page. **Approve and send this email** submits that exact artifact.

The server checks owner identity, Google scope, suppression, pause state, saved draft/review revision, recipient, full body and daily quota again. Five attempts/day/organization is the fixed personal-preview limit, including uncertain attempts. Duplicate fingerprints/request keys cannot send twice. A confirmed Gmail message ID creates actual outbound contact; creating a draft or approving a proposal does not. An uncertain HTTP/DB result is never automatically retried. Check Gmail and recorded delivery history before any further action.

### Approval checkbox is disabled

Version 0.3.1 adds **Why email approval is locked** above the approval form. Each unmet page requirement includes its own remedy link: Google connection/sending scope, enabled sending controls, resumed agents, saved sender name/email/postal address, saved draft, valid business email, approved current Growth Review and an open lead status. Save the relevant changes, return to the draft and reload. Checkbox state alone is not authorization; the server still enforces current suppression, revisions, identity and the daily limit.

Google consent must be completed while signed into the same CRM account and organization as the Windows app. A connection saved under another account/workspace cannot unlock this one. The native app and system browser have separate CRM cookie sessions even on the same PC. No source-backed observation should be marked verified just to unlock a test send.

Replies and opt-outs currently require manual logging in the CRM before further outreach. This app has no mailbox-reading grant. Hourly discovery does not send messages or automatically accept draft proposals.

## Agreed calls and meetings

Record an actual agreement, future Eastern date/time, 15–120 minute duration and optional manual opportunity estimate in Calls & meetings. SQL enforces Monday–Friday, 7 a.m.–3 p.m. Eastern, and prevents overlapping local appointments. The entire duration must fit. An agreement creates a CRM appointment, not a Google event or a phone call.

A separate approval creates/reconciles the primary Google Calendar event after checking availability. A deterministic provider event ID prevents duplicate events. By default no guest is invited; the owner must explicitly approve the public contact as a guest and acknowledge their agreement before notifications are requested. Reconciling an existing event does not send a new invitation. Externally linked/uncertain appointments can be cancelled through a separate approved cancellation, which checks the deterministic event first and updates local value only after Google confirms cancellation. Rescheduling and automatic external-change/reply sync remain future work.

## Security and verification

Credentials use AES-256-GCM, random nonces, versioned envelopes and authenticated context. Only owner-authenticated RPCs access the private encrypted store. No service-role client, anonymous worker, browser token exposure or persistent worker password is introduced. Lifecycle audit entries contain field names, never token values. OAuth uses encrypted HttpOnly SameSite cookies, expiry, owner/organization binding, state, PKCE and fixed Google endpoints. Keep the application owner-private while production hardening and Google verification are pending.

Sources: [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Calendar event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).
