export function missingDatabaseMigration(
  error: { code?: string } | null | undefined,
) {
  return Boolean(
    error &&
    ["PGRST205", "PGRST202", "42P01", "42703"].includes(error.code ?? ""),
  );
}
