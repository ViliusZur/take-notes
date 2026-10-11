import { DateTime } from "luxon";

/**
 * ISO week helpers.
 *
 * Calendar math here uses plain UTC dates and never reads the clock, so it is safe to run while
 * Next.js prerenders (Luxon reads `Date.now()` even when building a fixed date). Only the
 * functions that need "now" or a timezone (`currentWeekKey`, `plannedWeekForCall`,
 * `isValidTimezone`) use Luxon, and they run at request time.
 */

/** An ISO week. `isoYear` is the ISO week-year: Dec 29 2025 is 2026-W01. */
export type WeekKey = { isoYear: number; isoWeek: number };

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const DAY_MS = 86_400_000;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ORDINAL_SUFFIXES: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };

// ---------------------------------------------------------------------------
// Pure UTC date math
// ---------------------------------------------------------------------------

function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function parseIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return utcDate(year, month - 1, day);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
function isoWeekday(date: Date) {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

function weekKeyOfUtcDate(date: Date): WeekKey {
  // The ISO week belongs to the year of its Thursday.
  const thursday = addDays(date, 4 - isoWeekday(date));
  const isoYear = thursday.getUTCFullYear();
  const yearStart = utcDate(isoYear, 0, 1);
  const isoWeek = Math.floor((thursday.getTime() - yearStart.getTime()) / DAY_MS / 7) + 1;
  return { isoYear, isoWeek };
}

function weeksInIsoYear(isoYear: number) {
  // Dec 28 is always in the last ISO week of its year.
  return weekKeyOfUtcDate(utcDate(isoYear, 11, 28)).isoWeek;
}

function mondayOf({ isoYear, isoWeek }: WeekKey) {
  // Jan 4 is always in week 1.
  const jan4 = utcDate(isoYear, 0, 4);
  return addDays(jan4, 1 - isoWeekday(jan4) + (isoWeek - 1) * 7);
}

// ---------------------------------------------------------------------------
// Week keys
// ---------------------------------------------------------------------------

export function isValidWeekKey({ isoYear, isoWeek }: WeekKey) {
  if (!Number.isInteger(isoYear) || !Number.isInteger(isoWeek)) return false;
  if (isoYear < 2000 || isoYear > 2100 || isoWeek < 1) return false;
  return isoWeek <= weeksInIsoYear(isoYear);
}

/** ISO date (YYYY-MM-DD) of the Monday that starts the week. */
export function weekStartDate(key: WeekKey): string {
  return toIsoDate(mondayOf(key));
}

/** The seven ISO dates of the week, Monday first. */
export function weekDates(key: WeekKey): string[] {
  const monday = mondayOf(key);
  return WEEKDAYS.map((_, index) => toIsoDate(addDays(monday, index)));
}

export function dateForWeekday(key: WeekKey, day: Weekday): string {
  return weekDates(key)[WEEKDAYS.indexOf(day)];
}

export function weekKeyOfDate(isoDate: string): WeekKey {
  return weekKeyOfUtcDate(parseIsoDate(isoDate));
}

export function shiftWeek(key: WeekKey, weeks: number): WeekKey {
  return weekKeyOfUtcDate(addDays(mondayOf(key), weeks * 7));
}

export function compareWeeks(a: WeekKey, b: WeekKey) {
  return a.isoYear - b.isoYear || a.isoWeek - b.isoWeek;
}

export function weekPath(key: WeekKey) {
  return `/week/${key.isoYear}/${key.isoWeek}`;
}

// ---------------------------------------------------------------------------
// Formatting (English, matching the rest of the UI)
// ---------------------------------------------------------------------------

function shortMonth(date: Date) {
  return MONTHS[date.getUTCMonth()].slice(0, 3);
}

export function formatWeekKey({ isoYear, isoWeek }: WeekKey) {
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

/** "Oct 12 – 18, 2026", or "Sep 28 – Oct 4, 2026" across months. */
export function formatWeekRange(key: WeekKey) {
  const monday = mondayOf(key);
  const sunday = addDays(monday, 6);
  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
  const end = sameMonth ? `${sunday.getUTCDate()}` : `${shortMonth(sunday)} ${sunday.getUTCDate()}`;
  return `${shortMonth(monday)} ${monday.getUTCDate()} – ${end}, ${sunday.getUTCFullYear()}`;
}

/** "October 2026", or "September – October 2026" for a week spanning two months. */
export function formatWeekMonths(key: WeekKey) {
  const monday = mondayOf(key);
  const sunday = addDays(monday, 6);
  const startMonth = MONTHS[monday.getUTCMonth()];
  const endMonth = MONTHS[sunday.getUTCMonth()];
  const startYear = monday.getUTCFullYear();
  const endYear = sunday.getUTCFullYear();
  if (startMonth === endMonth) return `${startMonth} ${startYear}`;
  if (startYear === endYear) return `${startMonth} – ${endMonth} ${endYear}`;
  return `${startMonth} ${startYear} – ${endMonth} ${endYear}`;
}

/** Short weekday, e.g. "Wed". */
export function formatWeekday(isoDate: string) {
  return DAY_NAMES[isoWeekday(parseIsoDate(isoDate)) - 1].slice(0, 3);
}

/** "Mon 12". */
export function formatDayLabel(isoDate: string) {
  return `${formatWeekday(isoDate)} ${parseIsoDate(isoDate).getUTCDate()}`;
}

function ordinal(day: number) {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${ORDINAL_SUFFIXES[day % 10] ?? "th"}`;
}

/** "Monday, 12th", like a paper planner's day heading. */
export function formatDayHeading(isoDate: string) {
  const date = parseIsoDate(isoDate);
  return `${DAY_NAMES[isoWeekday(date) - 1]}, ${ordinal(date.getUTCDate())}`;
}

// ---------------------------------------------------------------------------
// Request-time helpers (read the clock or a timezone)
// ---------------------------------------------------------------------------

export function isValidTimezone(timezone: string) {
  return DateTime.now().setZone(timezone).isValid;
}

function weekKeyOf(date: DateTime): WeekKey {
  return { isoYear: date.weekYear, isoWeek: date.weekNumber };
}

export function currentWeekKey(timezone: string, now: DateTime = DateTime.now()): WeekKey {
  return weekKeyOf(now.setZone(timezone));
}

/** The week a planning call plans: the ISO week starting on the Monday after the call's local date. */
export function plannedWeekForCall(callTime: DateTime, timezone: string): WeekKey {
  const local = callTime.setZone(timezone).startOf("day");
  return weekKeyOf(local.plus({ days: 8 - local.weekday }));
}
