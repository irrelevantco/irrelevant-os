# Local database repair and neon dashboard logo — 0.2.1

The reported combination (working sign-in/CRM, failing Agent control and outreach preparation) is consistent with a newer desktop application connected to a database without the contact/agent migration. Docker running alone does not apply migrations. The original application used its generic error boundary for these schema failures.

## User repair

Close version 0.2.0. Extract the complete 0.2.1 Windows ZIP and open its executable. Your existing per-user connection settings are reused. With Docker Desktop and the existing backend running, select **Workspace → Update local database…**, confirm, then reload the affected pages.

The updater accepts only the existing loopback API on port 54321, checks the expected Docker Compose labels and loopback gateway binding, requires a recognized versioned CRM database, and reads SQL from the packaged migrations directory. It applies only pending transactional migrations and records each committed version. It checks retained record counts and required contact/agent objects, then reloads the REST schema cache. Repeating it is a no-op when current. It never creates a replacement database, resets a volume, imports prospects, sends messages, or targets hosted Supabase. No service-role key or new application credential is used.

If required tables are missing, the two affected pages now show a database-update explanation instead of calling that condition a connection interruption. Unrelated permission or network errors still fail normally; they are not disguised as successful empty data.

The dashboard uses an SVG neon yellow-green iR↗ mark based on the supplied logo reference; the browser-tab SVG uses the same mark. No client findings or metrics were changed.

## Verification

- Unit checks cover wrong/local/hosted targets, Docker identity/port mismatch, unrecognized databases, transaction/version recording, failure stop, no-op repetition and precise error classification.
- A separate temporary database reproduces the old Phase 2 schema with a synthetic business, unverified hypothesis, notes, review and human draft. Eight integration checks verify migration, unchanged original records, RLS, authenticated contact/history and job APIs, anonymous denial and repeat safety. Only that temporary test database is dropped.
- Desktop smoke testing checks the native updater menu, actual local sign-in, both formerly failing screens, the neon logo and the real local updater's already-current/no-op result. Windows packaging independently checks native startup and menu availability.
- The release workflow requires the full CRM checks for the exact source commit before publishing assets.

The cloud execution workspace is separate from the user's Windows PC. Successful tests do not mean the user's database was remotely updated: the user must run the included updater once on that PC.
