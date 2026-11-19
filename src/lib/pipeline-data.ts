import "server-only";
import { requireContext } from "./context";
import { pipelinePageSchema } from "./pipeline";
import { missingDatabaseMigration } from "./database-failure";
export async function pipelinePage(
  payload: { query?: string; stage?: string; page?: number } = {},
) {
  const { db, organization } = await requireContext();
  const result = await db.rpc("pipeline_page", {
    org: organization.id,
    payload,
  });
  if (missingDatabaseMigration(result.error))
    throw Error("PIPELINE_DATABASE_UPDATE");
  if (result.error)
    throw Error(
      "Could not load the full pipeline. Check the database update and connection.",
    );
  return pipelinePageSchema.parse(result.data);
}
