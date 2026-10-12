import { sql } from "drizzle-orm";
import { connection } from "next/server";
import journal from "../../../../drizzle/meta/_journal.json";
import { db } from "@/server/db";
import { json } from "@/server/http";
import { log } from "@/server/log";

/** Migrations applied to this database, from the table Drizzle's migrator keeps. */
async function appliedMigrations() {
  try {
    const result = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    // The table doesn't exist until the first migration has run.
    return 0;
  }
}

/** Reports whether the database is reachable and fully migrated. Contains no user data. */
export async function GET() {
  await connection();
  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    log.error("Health check could not reach the database", error);
    return json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }

  const migrations = { applied: await appliedMigrations(), expected: journal.entries.length };
  if (migrations.applied < migrations.expected) {
    log.error("Database is missing migrations; run `npm run db:migrate`", migrations);
    return json({ status: "degraded", database: "ok", migrations }, { status: 503 });
  }
  return json({ status: "ok", database: "ok", migrations });
}
