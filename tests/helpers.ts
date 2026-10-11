import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

export async function createUser(overrides: Partial<typeof user.$inferInsert> = {}) {
  const id = randomUUID();
  const [row] = await db
    .insert(user)
    .values({ id, name: "Jane Doe", email: `${id}@example.com`, timezone: "Europe/Vilnius", ...overrides })
    .returning();
  return row;
}
