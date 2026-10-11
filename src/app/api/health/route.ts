import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/server/db";
import { log } from "@/server/log";

export async function GET() {
  await connection();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    log.error("Health check could not reach the database", error);
    return Response.json({ status: "degraded" }, { status: 503 });
  }
}
