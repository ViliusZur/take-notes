import "server-only";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "@/server/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the root db or an open transaction. */
export type Executor = Database | Transaction;

type DbState = { db: Database; pglite?: PGlite };

const globalForDb = globalThis as unknown as { __weeklyDb?: DbState };

/**
 * `DATABASE_URL` accepts a normal Postgres URL (Neon in production) or
 * `pglite://<dir>` / `pglite://memory` for zero-setup local development and tests.
 */
function createDb(url: string): DbState {
  if (url.startsWith("pglite://")) {
    const location = url.slice("pglite://".length);
    const pglite = location === "memory" ? new PGlite() : new PGlite(location);
    // Both drivers expose the same query builder; typing as node-postgres keeps call sites simple.
    const db = drizzlePglite(pglite, { schema }) as unknown as Database;
    return { db, pglite };
  }

  const pool = new Pool({ connectionString: url, max: 5 });
  return { db: drizzleNodePg(pool, { schema }) };
}

function state(): DbState {
  globalForDb.__weeklyDb ??= createDb(databaseUrl());
  return globalForDb.__weeklyDb;
}

/** Created on first use so builds and imports never open a connection. */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const real = state().db;
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export function usesPglite() {
  return state().pglite !== undefined;
}

export { schema };
