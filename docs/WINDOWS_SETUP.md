# Windows startup and Git handoff

The existing application was preserved in `/workspace/irrelevant-os` in the cloud environment. `C:\Users\naryr\iRRELEVANT-OS` is on a different computer and is not mounted in that environment. A local address refers to the computer running the server; starting Next.js in the cloud does not start it on Windows.

The intended local URL is **http://localhost:3030** (spelled `localhost`). Both development and production start scripts now default to port 3030. The Supabase API remains on port 54321.

## Preserve an existing Windows checkout

From PowerShell:

```powershell
Set-Location 'C:\Users\naryr\iRRELEVANT-OS'
git status
git remote -v
```

After the completed source is available in `https://github.com/irrelevantco/irrelevant-os`, update an existing compatible checkout with `git fetch origin` and `git pull --ff-only origin main`. Fast-forward-only refuses to overwrite divergent history. If Git reports local changes, unrelated history or a different remote, inspect and preserve that work before merging. Do not run `create-next-app`, `git reset --hard`, `git clean`, or reinitialize the application over the folder.

The remote was publicly readable but had no commits when inspected. The original Phase 1 source had only been committed in the cloud workspace. GitHub's preconfigured credential was rejected. Remote synchronization must be verified after GitHub CLI authorization completes; local commits alone do not prove that GitHub has the files.

## If the browser reports connection refused

Use Command Prompt if your prompt looks like `C:\Users\naryr>`. Paste **only command lines**, not a `PS ...>` prompt or copied error messages. Using `npm.cmd` works in both shells and avoids the `npm.ps1` execution-policy error without changing system policy:

```bat
cd /d "C:\Users\naryr\iRRELEVANT-OS"
npm.cmd run dev -- --hostname 127.0.0.1 --port 3030
```

`cd /d` is for Command Prompt; in PowerShell use `Set-Location 'C:\Users\naryr\iRRELEVANT-OS'` instead. Keep the terminal open. Wait for **Ready**, then open **http://127.0.0.1:3030**. Do not use an unqualified `http://localhost`, which defaults to port 80.

This starts the website without waiting for Docker setup, isolating a web-server startup failure from a backend failure. It does not make authentication/CRM available if Supabase is not running. If Next is missing, install dependencies with `npm.cmd ci`, then retry. If it still exits, preserve the terminal error for diagnosis. The setup script now launches Node/npm directly so `C:\Program Files\nodejs` paths do not break shell quoting.

## Start the app on Windows

Requirements: Node.js 24 (or supported 22.12+), npm, Docker Desktop with Compose v2 and Linux containers. After obtaining the updated source:

```powershell
Set-Location 'C:\Users\naryr\iRRELEVANT-OS'
npm.cmd ci
npm.cmd run local
```

`npm run local` preserves existing environment files, generates local-only credentials only when both local files are absent, starts the small PostgreSQL/Supabase Auth/PostgREST stack, applies pending migrations without resetting data, then starts Next.js on port 3030. LF Git attributes keep Linux bootstrap scripts usable when cloned on Windows. Keep the terminal running, then open **http://localhost:3030** in your Windows browser.

If using an existing hosted Supabase database, configure `.env.local` and apply the new migration to that development project through your normal migration process, then use `npm run dev`; `local:setup` intentionally refuses a remote database URL.

To diagnose locally:

```powershell
Test-Path package.json
node --version
docker compose version
Test-NetConnection localhost -Port 3030
```

A refused port means the Next.js process is not listening there. Read the terminal error; do not assume an installed repository means a running server. An occupied port can be changed explicitly with `npm.cmd run dev -- --port 3031`. Do not delete the local Docker volume to troubleshoot normal startup.

## Load your data on Windows

The cloud database is separate. Create/sign in to your Windows local account, select your organization, choose **Imports → Load Prospect Batch 001**, inspect mapping and preview, then explicitly import. This creates 30 records on a fresh organization, preserves research metadata, and leaves all findings unverified and outreach in draft.

Alternatively, `npm run batch:import` explicitly bootstraps a dedicated local iRRELEVANT CO owner/workspace and imports the bundle. It saves generated login details in ignored `work/local-owner.json`. Read that file privately on the machine running the app. Never post it to GitHub or chat. The command is loopback-only and idempotent; it does not replace an existing owner login file.

## GitHub authentication

`gh auth login --hostname github.com --git-protocol https --web` requires you to complete the one-time browser authorization. Device codes expire. Never paste tokens into chat. GitHub CLI in the cloud uses an ignored writable `work/gh-auth` directory because its normal home configuration location is read-only. The invalid inherited token must be omitted for that flow. This changes source-repository access only and does not deploy the application.
