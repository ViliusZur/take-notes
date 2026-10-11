export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { usesPglite } = await import("@/server/db");
  if (!usesPglite()) return;
  // Local development database: keep the schema current on every start.
  const { runMigrations } = await import("@/server/db/migrate");
  const { log } = await import("@/server/log");
  await runMigrations();
  log.info("Local PGlite database migrated");
}
