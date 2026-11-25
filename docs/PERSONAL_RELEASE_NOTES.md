This update aligns the workspace shell with iRRELEVANT CUT: a fixed vertical sidebar from 768 pixels upward, grouped Workspace / Growth / Automation / Workspace tools navigation, sidebar business search, a compact section header and stronger sans-serif headings. Half-screen Windows windows keep the sidebar instead of the former horizontally scrolling tab bar.

On phones, open the menu beside the current section to access the same vertical navigation. The drawer supports Escape, backdrop dismissal, keyboard focus, closing after navigation and safe resizing back to desktop. Opening and closing it preserves the current form. Long navigation lists scroll within the sidebar while workspace identity remains visible.

Use **Workspace → Check for app updates…** in Windows, then download and install after saving edits. Reload the hosted app for the web update. No database migration is required. This update aligns the visual style; the CUT and OS applications remain separate products.

---

Previous startup and motion update:

This update adds the neon iR startup splash to the web app and refreshes the Windows startup screen to match. The web splash releases after client hydration; the desktop progress bar follows actual connection, server and workspace startup stages. No artificial percentage or minimum waiting time is added.

Workspace tabs show a pending indicator while the router is working, followed by a gentle page entrance. Buttons have subtle press feedback. Reduced-motion preferences disable movement, and startup artwork never captures clicks or focus. Navigation does not remount the shared workspace or replay the full-screen splash. Server-rendered sign-in remains usable with JavaScript disabled.

The hosted app receives this update by reloading. Windows users can choose **Workspace → Check for app updates…**, download, then install and restart after saving changes. This UI-only update requires no database migration and does not change campaigns, billing or authorization.

Free Render hosting can show its own wake screen before the app responds; the application splash cannot replace that hosting screen. Phone access remains the hosted HTTPS web app, including Safari's Add to Home Screen option.

---

Previous import and pipeline fixes:

Large CSV previews no longer exceed hosted database time limits. The 2,000-row / 1 MiB file limit remains; existing lead totals do not cap a new batch. Duplicate detection, commit-time identity checks, source provenance, unverified hypotheses and owner permissions remain enforced.

Pipeline reads and searches also avoid repeated membership checks on large workspaces while retaining tenant authorization and Trash filtering.

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
