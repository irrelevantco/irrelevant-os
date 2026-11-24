This update fixes large CSV previews that exceeded hosted database time limits. The 2,000-row / 1 MiB file limit remains; existing lead totals do not cap a new batch. Duplicate detection, commit-time identity checks, source provenance, unverified hypotheses and owner permissions remain enforced.

Preview counts now include rows beyond the first 1,000, with 100-row review pages. Import applies to all valid new rows across the batch. Timeout, owner-access and missing-migration failures have distinct messages.

For local Windows connections, keep Docker running and choose **Workspace → Update local database…** after updating. Hosted database updates are applied separately. Neither an application update nor the business-model roadmap copies data between local and hosted workspaces, changes pricing, starts a campaign or enables payments.

---

Previous guided-assistant release details:

This personal update introduces **iR Agent**, a guided task window replacing the default Agent control screen. Choose a task rather than writing a chat prompt. The black response panel, fine neon border and tinted choice bar bring discovery, research, draft preparation, approved campaigns, replies, meetings, files, identity and pause controls together. Existing advanced queue/history controls remain available.

Built-in guidance uses coded workflow rules with no chat-model API fees. Optional research models and paid providers keep their explicit settings and budgets. Task selection does not approve email. Research verification, full-message sending review, seven-day campaign policy, suppression, quotas and uncertain-delivery checks remain intact.

Weekday automation windows are selectable within 7 a.m.–3 p.m. Eastern, with checks every 1, 5, 15, 30 or 60 minutes. The database enforces the selected window/cadence. The app must remain open and signed in for its runner; free hosting is not an always-on worker.

A branded Windows startup screen shows actual connection/server/workspace readiness stages. Page/task transitions respect reduced-motion settings. No new privileged renderer bridge is introduced.

**After updating:** Keep Docker running, choose **Workspace → Update local database…** once, then reload. The additive update preserves existing accounts, leads, notes, reviews and encrypted Google setup. Application updates do not import business lists or move a Windows database into the cloud. Import your prospect CSV separately; duplicates are skipped.

No live email, calendar invitation, billing change or paid hosting plan was initiated during development. This remains an unsigned personal preview.
