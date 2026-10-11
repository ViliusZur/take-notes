import "server-only";
import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { db, usesPglite } from "./index";

const migrationsFolder = path.join(process.cwd(), "drizzle");

export async function runMigrations() {
  if (usesPglite()) {
    await migratePglite(db as unknown as PgliteDatabase, { migrationsFolder });
  } else {
    await migrateNodePg(db, { migrationsFolder });
  }
}
