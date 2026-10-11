import "server-only";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/server/db";
import { planningSchedules, user, type PlanningSchedule } from "@/server/db/schema";
import { requireFeature } from "@/server/features";
import { HttpError, notFound } from "@/server/http";
import { log } from "@/server/log";
import type { PlanningScheduleDto, ScheduleChannel } from "@/lib/api-types";
import {
  CALL_CONSENT_VERSION,
  EARLIEST_LOCAL_TIME,
  isWithinCallingHours,
  LATEST_LOCAL_TIME,
  nextRunAfter,
} from "@/lib/schedule";
import { isValidTimezone } from "@/lib/weeks";

function toDto(schedule: PlanningSchedule): PlanningScheduleDto {
  return {
    enabled: schedule.enabled,
    channel: schedule.channel,
    dayOfWeek: schedule.dayOfWeek,
    localTime: schedule.localTime,
    timezone: schedule.timezone,
    emailFallback: schedule.emailFallback,
    callConsentAt: schedule.callConsentAt?.toISOString() ?? null,
    nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
  };
}

async function loadUser(userId: string) {
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  if (!row) throw notFound("User");
  return row;
}

export async function findSchedule(userId: string) {
  const [schedule] = await db.select().from(planningSchedules).where(eq(planningSchedules.userId, userId));
  return schedule;
}

export async function getSchedule(userId: string): Promise<PlanningScheduleDto> {
  const schedule = await findSchedule(userId);
  if (schedule) return toDto(schedule);
  const owner = await loadUser(userId);
  return {
    enabled: false,
    channel: "email",
    dayOfWeek: 7,
    localTime: "18:00",
    timezone: owner.timezone,
    emailFallback: true,
    callConsentAt: null,
    nextRunAt: null,
  };
}

export type ScheduleInput = {
  enabled: boolean;
  channel: ScheduleChannel;
  dayOfWeek: number;
  localTime: string;
  timezone: string;
  emailFallback: boolean;
  /** Must be true the first time calls are enabled; records consent. */
  callConsent?: boolean;
};

export async function putSchedule(
  userId: string,
  input: ScheduleInput,
  now: DateTime = DateTime.utc(),
): Promise<PlanningScheduleDto> {
  if (!isValidTimezone(input.timezone)) throw new HttpError(422, "Unknown timezone");
  if (input.enabled) requireFeature(input.channel === "call" ? "calls" : "email");
  if (!isWithinCallingHours(input.localTime)) {
    throw new HttpError(422, `Pick a time between ${EARLIEST_LOCAL_TIME} and ${LATEST_LOCAL_TIME}`);
  }

  const existing = await findSchedule(userId);
  let callConsentAt = existing?.callConsentAt ?? null;
  let callConsentVersion = existing?.callConsentVersion ?? null;

  if (input.channel === "call") {
    const owner = await loadUser(userId);
    if (!owner.phoneE164 || !owner.phoneVerifiedAt) {
      throw new HttpError(422, "Verify a phone number before choosing calls");
    }
    if (input.callConsent) {
      callConsentAt = now.toJSDate();
      callConsentVersion = CALL_CONSENT_VERSION;
    }
    if (!callConsentAt) throw new HttpError(422, "Consent is required before we can call you");
  }

  const values = {
    enabled: input.enabled,
    channel: input.channel,
    dayOfWeek: input.dayOfWeek,
    localTime: input.localTime,
    timezone: input.timezone,
    emailFallback: input.emailFallback,
    callConsentAt,
    callConsentVersion,
    nextRunAt: input.enabled ? nextRunAfter(input, now).toJSDate() : null,
  };

  const [saved] = await db
    .insert(planningSchedules)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: planningSchedules.userId, set: values })
    .returning();
  log.debug(`Saved planning schedule for user '${userId}'`, {
    enabled: saved.enabled,
    channel: saved.channel,
    nextRunAt: saved.nextRunAt,
  });
  return toDto(saved);
}

/** Keeps the schedule in the user's timezone when they move. */
export async function recomputeScheduleForTimezone(userId: string, timezone: string, now: DateTime = DateTime.utc()) {
  const schedule = await findSchedule(userId);
  if (!schedule) return;
  const timing = { dayOfWeek: schedule.dayOfWeek, localTime: schedule.localTime, timezone };
  await db
    .update(planningSchedules)
    .set({ timezone, nextRunAt: schedule.enabled ? nextRunAfter(timing, now).toJSDate() : null })
    .where(eq(planningSchedules.id, schedule.id));
}

/** "Stop calling me": calls end immediately, email reminders continue if enabled. */
export async function revokeCallConsent(userId: string) {
  log.warn(`Call consent revoked for user '${userId}'`);
  await db
    .update(planningSchedules)
    .set({ channel: "email", callConsentAt: null, callConsentVersion: null })
    .where(eq(planningSchedules.userId, userId));
}
