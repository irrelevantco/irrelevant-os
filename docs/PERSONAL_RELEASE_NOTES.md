Portable Windows x64 personal preview **v0.3.1** fixes the unexplained disabled email-approval checkbox.

The outreach page now shows **Why email approval is locked**, with specific requirements and links to resolve each one: Google connection and Gmail sending permission, enabled sending controls, resumed agents, saved sender identity/postal address, saved draft, valid recipient, current approved Growth Review and open lead status. The checkbox remains locked until the page requirements pass. Server-side suppression, revision, exact-message approval and daily-limit checks remain mandatory.

Google consent must use the same CRM account and workspace as the Windows app. Completing consent under a different CRM account or organization does not connect this one. No credentials or private token contents appear in the diagnostics. Errors loading controls fail closed.

Close the old program, extract the entire ZIP, and run **iRRELEVANT OS.exe from the new folder**. Confirm **v0.3.1** in the sidebar or Workspace → About. Keep Docker and your existing backend running. This patch introduces no database migration and does not replace your saved OAuth setup, accounts, leads or notes. The neon iR executable/window icon is retained.

Validation includes type checking, zero-warning lint, production build and 131 unit tests. Desktop/mobile browser checks cover visible blocker explanations, remedy links, disabled approval and preserved drafts. Publication requires exact-commit CI (including all 222 database assertions and eight browser workflows), native Windows startup and a live bounded free-provider check. No test email or Calendar invitation is sent by those checks; Google transports use synthetic responses.

Hourly discovery and agreed appointment/value controls from v0.3.0 remain available. This patch does not turn on sending or create a Google connection. Live Google sending must be tested through your approved message in your own connected workspace. Phone hosting and an always-on hosted runner remain pending setup. This remains an unsigned personal preview, not an audited production release.

[Google connection and locked-checkbox guide](https://github.com/irrelevantco/irrelevant-os/blob/main/docs/GOOGLE_INTEGRATION.md) · [Windows guide](https://github.com/irrelevantco/irrelevant-os/blob/main/docs/PERSONAL_APP.md)
