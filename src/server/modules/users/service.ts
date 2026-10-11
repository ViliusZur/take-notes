import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { notFound } from "@/server/http";
import { log } from "@/server/log";
import type { MeDto } from "@/lib/api-types";
import { recomputeScheduleForTimezone } from "@/server/modules/schedules/service";

export async function getMe(userId: string): Promise<MeDto> {
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  if (!row) throw notFound("User");
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    timezone: row.timezone,
    phoneE164: row.phoneE164,
    phoneVerified: row.phoneVerifiedAt !== null,
  };
}

export async function updateMe(userId: string, patch: { name?: string; timezone?: string }): Promise<MeDto> {
  if (Object.keys(patch).length > 0) {
    await db.update(user).set(patch).where(eq(user.id, userId));
  }
  if (patch.timezone) {
    await recomputeScheduleForTimezone(userId, patch.timezone);
  }
  return getMe(userId);
}

export async function removePhone(userId: string): Promise<MeDto> {
  await db.update(user).set({ phoneE164: null, phoneVerifiedAt: null }).where(eq(user.id, userId));
  return getMe(userId);
}

/** Deletes the account; every user-owned table cascades from `user`. */
export async function deleteAccount(userId: string) {
  log.warn(`Deleting account '${userId}'`);
  await db.delete(user).where(eq(user.id, userId));
}
