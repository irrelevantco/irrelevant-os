import { missingDatabaseMigration } from "../database-failure";
export function importFailure(
  error: { code?: string } | null,
  stage: "preview" | "import",
): string {
  if (error?.code === "57014")
    return `The ${stage} exceeded the database time limit and was rolled back. No rows from that attempt were saved. Try a smaller CSV batch or contact the workspace owner.`;
  if (error?.code === "42501")
    return "Only this organization's owner can import prospects. Check the selected workspace and account.";
  if (missingDatabaseMigration(error))
    return "The import database needs an update. Contact the hosted workspace owner, or use Workspace → Update local database in the local Windows app.";
  return `The ${stage} could not be saved. No changes from this attempt should be assumed saved. Check your connection and try again.`;
}
