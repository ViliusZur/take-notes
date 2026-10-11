import { DateTime } from "luxon";

/** Calls and reminders only go out between these local times (inclusive). */
export const EARLIEST_LOCAL_TIME = "08:00";
export const LATEST_LOCAL_TIME = "20:30";

export const CALL_CONSENT_VERSION = "2026-10-v1";
export const CALL_CONSENT_TEXT =
  "I agree to receive an automated weekly phone call from an AI assistant at the number above, " +
  "at the day and time I choose, to plan my week. What I say is transcribed and processed by the " +
  "app's voice and AI providers to write my plan. I can stop the calls at any time in settings or " +
  'by saying "stop calling me" during a call.';

export type ScheduleTiming = {
  /** ISO weekday: 1 = Monday ... 7 = Sunday. */
  dayOfWeek: number;
  /** "HH:MM" local wall-clock time. */
  localTime: string;
  timezone: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseLocalTime(localTime: string) {
  const match = TIME_PATTERN.exec(localTime);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function isWithinCallingHours(localTime: string) {
  return parseLocalTime(localTime) !== null && localTime >= EARLIEST_LOCAL_TIME && localTime <= LATEST_LOCAL_TIME;
}

/**
 * Next occurrence of the schedule strictly after `after`, in UTC.
 * Luxon keeps local wall-clock time across daylight saving changes.
 */
export function nextRunAfter(timing: ScheduleTiming, after: DateTime): DateTime {
  const time = parseLocalTime(timing.localTime);
  if (!time) throw new Error(`Invalid local time '${timing.localTime}'`);
  const local = after.setZone(timing.timezone);
  if (!local.isValid) throw new Error(`Invalid timezone '${timing.timezone}'`);

  let candidate = local
    .set({ weekday: timing.dayOfWeek as 1 | 2 | 3 | 4 | 5 | 6 | 7 })
    .set({ hour: time.hour, minute: time.minute, second: 0, millisecond: 0 });
  if (candidate <= local) {
    candidate = candidate.plus({ weeks: 1 }).set({ hour: time.hour, minute: time.minute });
  }
  return candidate.toUTC();
}
