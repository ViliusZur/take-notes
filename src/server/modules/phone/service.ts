import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/server/db";
import { phoneVerifications, user } from "@/server/db/schema";
import { allowedCountryCodes } from "@/server/env";
import { requireFeature } from "@/server/features";
import { HttpError, notFound } from "@/server/http";
import { log } from "@/server/log";
import { revokeCallConsent } from "@/server/modules/schedules/service";
import { smsVerifier } from "./sms-verifier";

const E164 = /^\+[1-9]\d{7,14}$/;
const MAX_PER_HOUR = 3;
const MAX_PER_DAY = 8;
const MAX_ATTEMPTS = 5;
const CODE_TTL_MINUTES = 10;

export function normalizePhone(input: string) {
  const compact = input.replace(/[\s().-]/g, "");
  if (!E164.test(compact)) {
    throw new HttpError(422, "Enter the number in international format, e.g. +37061234567");
  }
  if (!allowedCountryCodes().some((prefix) => compact.startsWith(prefix))) {
    throw new HttpError(422, "Calls are not available for this country yet");
  }
  return compact;
}

async function sentSince(userId: string, since: DateTime) {
  const [row] = await db
    .select({ value: count() })
    .from(phoneVerifications)
    .where(and(eq(phoneVerifications.userId, userId), gte(phoneVerifications.createdAt, since.toJSDate())));
  return row?.value ?? 0;
}

/** Sends a code by SMS. Rate limited per user to blunt SMS toll fraud. */
export async function startVerification(userId: string, phoneInput: string, now: DateTime = DateTime.utc()) {
  requireFeature("calls");
  const phoneE164 = normalizePhone(phoneInput);
  if ((await sentSince(userId, now.minus({ hours: 1 }))) >= MAX_PER_HOUR) {
    throw new HttpError(429, "Too many codes requested. Try again in an hour.");
  }
  if ((await sentSince(userId, now.minus({ days: 1 }))) >= MAX_PER_DAY) {
    throw new HttpError(429, "Too many codes requested today.");
  }

  const [verification] = await db
    .insert(phoneVerifications)
    .values({ userId, phoneE164, expiresAt: now.plus({ minutes: CODE_TTL_MINUTES }).toJSDate() })
    .returning();
  await smsVerifier().sendCode(phoneE164);
  log.debug(`Started phone verification '${verification.id}' for user '${userId}'`);
  return { id: verification.id, expiresAt: verification.expiresAt.toISOString() };
}

export async function confirmVerification(userId: string, verificationId: string, code: string, now: DateTime = DateTime.utc()) {
  requireFeature("calls");
  const [verification] = await db
    .select()
    .from(phoneVerifications)
    .where(and(eq(phoneVerifications.id, verificationId), eq(phoneVerifications.userId, userId)));
  if (!verification) throw notFound("Verification");
  if (verification.status !== "pending") throw new HttpError(409, "This code was already used");
  if (verification.expiresAt <= now.toJSDate() || verification.attempts >= MAX_ATTEMPTS) {
    await db.update(phoneVerifications).set({ status: "expired" }).where(eq(phoneVerifications.id, verificationId));
    throw new HttpError(410, "This code expired. Request a new one.");
  }

  await db
    .update(phoneVerifications)
    .set({ attempts: verification.attempts + 1 })
    .where(eq(phoneVerifications.id, verificationId));

  if (!(await smsVerifier().checkCode(verification.phoneE164, code))) {
    throw new HttpError(422, "That code is not right");
  }

  const [owner] = await db.select().from(user).where(eq(user.id, userId));
  const numberChanged = owner?.phoneE164 !== verification.phoneE164;

  await db.update(phoneVerifications).set({ status: "approved" }).where(eq(phoneVerifications.id, verificationId));
  await db
    .update(user)
    .set({ phoneE164: verification.phoneE164, phoneVerifiedAt: now.toJSDate() })
    .where(eq(user.id, userId));

  // Consent was given for the old number.
  if (numberChanged && owner?.phoneE164) await revokeCallConsent(userId);
  return { status: "approved" as const };
}
