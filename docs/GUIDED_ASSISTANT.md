# iR Agent

The Agent control entry is now **iR Agent**. Choose a task in the neon-tinted choice bar; the black response panel shows the relevant existing controls. There is no free-text chat prompt, trained custom model or chat API call. Workflow guidance uses application rules. Optional research models/providers retain their separate settings, limits and approvals.

Choices cover discovery, research, drafts and exact-message review, recurring work, bounded campaign approval, replies/meetings, imports/conversion, sender identity, job output and pause. Source review forms can be edited inside the assistant. Full-message sending review and richer file/Calendar workflows open their existing dedicated screens. **Advanced preparation controls** retain the prior queue/history interface.

Business selection is paginated in groups of 50 across the organization rather than capped at the first 500. Successful proposal output is reviewed before acceptance into a saved draft. Neither task selection nor draft preparation sends a message. The shared campaign panel retains full templates, actual examples, sender binding and explicit seven-day approval; changes reset its approval form.

Automation starts/ends are selectable within weekdays 7 a.m.–3 p.m. Eastern. The check cadence can be 1, 5, 15, 30 or 60 minutes. The database enforces both the window and cadence. Changing controls pauses a prior campaign. Existing daily quotas, source verification, owner approval, suppression and unknown-outcome guards remain in force. Additive migration `20261119024350_assistant_schedules.sql` is required; in Windows use **Workspace → Update local database…** after installing.

The Windows splash shows real startup phases: connection check, backend readiness, application process startup and workspace opening. The bar represents stages, not a time estimate. Startup failure returns to connection setup. It introduces no renderer Node access or new privileged IPC bridge. Workspace pages and selected assistant panels have brief CSS transitions; reduced-motion preferences disable them.

## Phone

The phone uses a hosted HTTPS application and hosted Supabase. Local Windows data and OAuth setup are separate and do not move with an application update. Render's free web service sleeps after inactivity and may take about a minute to wake. An open authenticated workspace can process approved work; this is not an always-on free background worker. Google sending from the hosted app requires hosted OAuth configuration and owner consent. Desktop-only OAuth credentials are not copied into the cloud.

When the verified hosted URL is available, open it in iPhone Safari, sign in/create the hosted operator account and organization, then **Share → Add to Home Screen → Open as Web App**. Import your CSV into that cloud workspace to add prospects. Existing Windows records remain in their original database unless explicitly exported/imported.
