# iRRELEVANT OS personal application

The Windows package opens the existing Next.js CRM in its own Electron window. The bundled application server starts and stops with the program on a private, automatically selected loopback port. You do not install Node, run npm, open a terminal, or type localhost:3030 to launch it.

This remains a database-backed application. It does not bundle your database, account passwords, Google credentials or API secrets. It is not an offline CRM.

## Windows

Version 0.2.2 includes the local database updater, free preparation resume, OpenStreetMap discovery and XLSX/CSV conversion. If Outreach drafts or Agent control reports a missing database update, choose **Workspace → Update local database…** in the app, confirm, then reload. This applies only missing additive migrations to the supported existing local Docker stack; it does not reset or seed your database. No terminal, source checkout, Node installation or environment file copying is required for that repair.

1. Download the Windows x64 ZIP and extract the **entire folder**. Keep all files together. Windows 10/11 x64 are the target; ARM Windows and macOS builds are not supplied.
2. Open **iRRELEVANT OS.exe** inside the extracted folder. This is a portable personal preview, not a signed installer or an automatically updating app.
3. For your existing home setup, leave **Use bundled app with Supabase** selected. Choose **Import connection from .env.local**, then select `.env.local` inside `C:\Users\naryr\iRRELEVANT-OS\irrelevant-os-main` (or your actual project folder). Windows hides dotfiles in some file pickers; show hidden files if needed.
4. Enter the same account email you created in the local CRM, then choose **Open my workspace**. Sign in normally. The program imports only the backend URL and publishable/anon key; it never reads a service-role key or database password.
5. Local mode still needs Docker Desktop and your existing Supabase containers running. Start the existing containers from Docker Desktop if the backend is stopped. No database is reset or seeded by the program.

Alternatively enter a **hosted Supabase** URL, its publishable key and your hosted account email. This uses the packaged UI against the cloud database, so your PC does not need Docker. Apply the documented migrations to that backend before using it.

Once the web application is deployed, **Open the hosted app** mode needs only its HTTPS address and uses the same application as your phone. Change connection later through **Workspace → Change connection…**. Reusing the same backend and account shares records; choosing a different backend does not transfer data automatically.

Connection settings are saved in Electron's per-user application-data directory. They contain a public backend URL, publishable/anon key and operator email, never your account password. Sign out when finished on a shared computer. The app uses an isolated persistent browser profile. Private CRM responses are not cached offline.

The package is not signed with an iRRELEVANT CO Windows code-signing certificate. Windows may flag an unfamiliar application. Verify the supplied SHA-256 checksum and source before deciding whether to run it. Do not treat this preview as a security-audited production release. No silent updater is installed; download a new reviewed version for updates, including Electron security fixes.

The neon iR icon is embedded in the Windows executable and used for the window/PWA. Close the old app and launch the executable from the newly extracted v0.2.2 folder. If a taskbar shortcut still shows the Atom icon, unpin the old shortcut and pin the new executable; the old pinned path does not update itself. Check **Workspace → About** or the sidebar for version 0.2.2.

## Phone

Use the deployed HTTPS web application with the hosted Supabase project. Your Windows local database cannot be reached through your phone's localhost address.

- iPhone: Safari → Share → Add to Home Screen → Open as Web App.
- Android: Chrome → Install app / Add to Home screen.

The app keeps its icon and opens as a standalone application. Your PC can be off when you use the hosted database. Internet access is required. App Store / Google Play native packages are not included.

A free personal phone preview option is documented in `FREE_PHONE_PREVIEW.md`; it is not deployed. Vercel publishing remains release-gated while the team stays on Hobby: Vercel requires Pro for this commercial application. No plan upgrade, paid purchase or new production deployment has been performed as part of this release candidate.

## Troubleshooting

- **Supabase is not responding:** start the existing local backend, or correct the hosted URL/key. The package does not create a separate Supabase database.
- **Unable to sign in:** local and hosted accounts are different. Use the account for the chosen backend and confirm email if that backend requires it.
- **Not an approved operator:** use the operator email entered in bundled connection settings. Hosted mode uses the host's `OPERATOR_EMAIL_ALLOWLIST`.
- **Migration message:** apply all repository migrations to the chosen backend, without resetting existing data.
- **Blank window / immediate exit:** extract all files, keep the `resources` folder beside the executable, and confirm Windows x64 support. The native Windows CI startup check is distinct from Linux browser tests.

## Build from source

`npm ci`, `npm run build`, then `python scripts/package-desktop.py --platform win32`. The script downloads pinned Electron 45.3.4 from the official Electron GitHub release, verifies its SHA-256, includes the standalone app/static assets and rejects environment/credential files. For a Windows release, build on Windows so optional native dependencies match Windows. Linux packages exist only for automated smoke tests.
