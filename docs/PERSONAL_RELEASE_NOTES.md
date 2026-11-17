Portable Windows x64 personal preview of iRRELEVANT OS. Extract the complete ZIP, then open **iRRELEVANT OS.exe**. It opens in its own window and starts its bundled server on an automatic loopback port—no need to type localhost:3030 or run npm each time.

Version 0.2.1 fixes the missing-table errors in Outreach drafts and Agent control. Choose **Workspace → Update local database…**, confirm the local update, and reload. It applies missing bundled migrations without resetting records. It also adds a specific database-update screen instead of a generic connection error for missing tables, and replaces the dashboard mark with the neon iR↗ logo. Keep the existing Supabase containers running in Docker Desktop. Import the connection from your existing `.env.local`, enter the account email already used in that database, and sign in. No credentials or database are bundled.

- [Setup guide](https://github.com/irrelevantco/irrelevant-os/blob/main/docs/PERSONAL_APP.md)
- [Agent controls and precise limits](https://github.com/irrelevantco/irrelevant-os/blob/main/docs/AGENT_CONTROL.md)
- [Optional free phone preview](https://github.com/irrelevantco/irrelevant-os/blob/main/docs/FREE_PHONE_PREVIEW.md)

Preparation uses rules/templates and approved evidence. Research checklists, draft proposals, manual contact events, follow-up gates, opt-outs and owner approval are implemented. Explee company search requires a server API key and explicit credit allowance. No email sending, autonomous research, LLM generation, Gmail synchronization, payments or unattended scheduled execution is enabled.

Windows-native setup → bundled server → sign-in UI is checked by the packaging workflow before publishing these assets. Real local database sign-in → private CRM → Agent control was also verified in the Linux desktop package. Full repository checks include type/lint/build, 90 unit tests, 113 real local database/repair assertions and four desktop/mobile browser workflows.

The app is an **unsigned personal preview**, not a signed installer, audited production release or automatically updating application. Verify the accompanying SHA-256 checksum. Keep every extracted file and the resources folder together. Windows 10/11 x64 is the target. Electron 45.3.4 is obtained from its official release and checksum verified during packaging.

The phone PWA has not been newly deployed. Vercel was not upgraded or purchased. A free Render personal-preview blueprint is provided; its limitations and independent hosted Supabase setup are documented. Local and hosted databases/accounts are distinct, and no automatic transfer is claimed.
