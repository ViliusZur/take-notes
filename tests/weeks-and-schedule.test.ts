import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { isWithinCallingHours, nextRunAfter } from "@/lib/schedule";
import {
  currentWeekKey,
  isValidWeekKey,
  plannedWeekForCall,
  shiftWeek,
  weekDates,
  weekKeyOfDate,
  weekStartDate,
} from "@/lib/weeks";

describe("ISO weeks", () => {
  it("uses the ISO week-year around new year", () => {
    expect(weekKeyOfDate("2025-12-29")).toEqual({ isoYear: 2026, isoWeek: 1 });
    expect(weekKeyOfDate("2027-01-01")).toEqual({ isoYear: 2026, isoWeek: 53 });
    expect(weekStartDate({ isoYear: 2026, isoWeek: 1 })).toBe("2025-12-29");
  });

  it("knows which years have 53 weeks", () => {
    expect(isValidWeekKey({ isoYear: 2026, isoWeek: 53 })).toBe(true);
    expect(isValidWeekKey({ isoYear: 2025, isoWeek: 53 })).toBe(false);
    expect(isValidWeekKey({ isoYear: 2026, isoWeek: 0 })).toBe(false);
  });

  it("lists Monday to Sunday", () => {
    expect(weekDates({ isoYear: 2026, isoWeek: 42 })).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(shiftWeek({ isoYear: 2026, isoWeek: 53 }, 1)).toEqual({ isoYear: 2027, isoWeek: 1 });
  });

  it("computes the current week in the user's timezone", () => {
    // Sunday 23:30 UTC is already Monday in Vilnius.
    const now = DateTime.fromISO("2026-10-11T23:30:00Z");
    expect(currentWeekKey("UTC", now)).toEqual({ isoYear: 2026, isoWeek: 41 });
    expect(currentWeekKey("Europe/Vilnius", now)).toEqual({ isoYear: 2026, isoWeek: 42 });
  });

  it("plans the week that starts on the Monday after the call", () => {
    const sunday = DateTime.fromISO("2026-10-11T16:00:00Z");
    const monday = DateTime.fromISO("2026-10-12T09:00:00Z");
    expect(plannedWeekForCall(sunday, "Europe/Vilnius")).toEqual({ isoYear: 2026, isoWeek: 42 });
    expect(plannedWeekForCall(monday, "Europe/Vilnius")).toEqual({ isoYear: 2026, isoWeek: 43 });
  });
});

describe("planning schedule", () => {
  const sundayEvening = { dayOfWeek: 7, localTime: "18:00", timezone: "Europe/Vilnius" };

  it("finds the next occurrence later the same week", () => {
    const next = nextRunAfter(sundayEvening, DateTime.fromISO("2026-10-07T10:00:00Z"));
    expect(next.toISO()).toBe("2026-10-11T15:00:00.000Z");
  });

  it("moves to next week once this week's time has passed", () => {
    const next = nextRunAfter(sundayEvening, DateTime.fromISO("2026-10-11T15:00:00Z"));
    expect(next.toISO()).toBe("2026-10-18T15:00:00.000Z");
  });

  it("keeps local time across the end of daylight saving time", () => {
    // Lithuania leaves summer time on 2026-10-25, so 18:00 local becomes 16:00 UTC.
    const next = nextRunAfter(sundayEvening, DateTime.fromISO("2026-10-19T00:00:00Z"));
    expect(next.toISO()).toBe("2026-10-25T16:00:00.000Z");
  });

  it("only allows calling hours", () => {
    expect(isWithinCallingHours("08:00")).toBe(true);
    expect(isWithinCallingHours("20:30")).toBe(true);
    expect(isWithinCallingHours("20:31")).toBe(false);
    expect(isWithinCallingHours("07:59")).toBe(false);
    expect(isWithinCallingHours("8:00")).toBe(false);
  });
});

describe("week formatting (no clock reads)", () => {
  it("matches the ISO calendar across many years", async () => {
    const { DateTime } = await import("luxon");
    for (let year = 2000; year <= 2100; year++) {
      const weeks = DateTime.fromObject({ weekYear: year, weekNumber: 1 }).weeksInWeekYear;
      expect(isValidWeekKey({ isoYear: year, isoWeek: weeks })).toBe(true);
      expect(isValidWeekKey({ isoYear: year, isoWeek: weeks + 1 })).toBe(false);
      const monday = DateTime.fromObject({ weekYear: year, weekNumber: weeks, weekday: 1 }, { zone: "UTC" });
      expect(weekStartDate({ isoYear: year, isoWeek: weeks })).toBe(monday.toISODate());
    }
  });

  it("formats headings and ranges", async () => {
    const { formatDayHeading, formatDayLabel, formatWeekMonths, formatWeekRange, formatWeekday } = await import(
      "@/lib/weeks"
    );
    expect(formatWeekRange({ isoYear: 2026, isoWeek: 42 })).toBe("Oct 12 – 18, 2026");
    expect(formatWeekRange({ isoYear: 2026, isoWeek: 40 })).toBe("Sep 28 – Oct 4, 2026");
    expect(formatWeekMonths({ isoYear: 2026, isoWeek: 40 })).toBe("September – October 2026");
    expect(formatWeekMonths({ isoYear: 2026, isoWeek: 1 })).toBe("December 2025 – January 2026");
    expect(formatDayHeading("2026-10-12")).toBe("Monday, 12th");
    expect(formatDayHeading("2026-10-13")).toBe("Tuesday, 13th");
    expect(formatDayHeading("2026-10-22")).toBe("Thursday, 22nd");
    expect(formatDayHeading("2026-11-01")).toBe("Sunday, 1st");
    expect(formatDayLabel("2026-10-14")).toBe("Wed 14");
    expect(formatWeekday("2026-10-18")).toBe("Sun");
  });

  it("never reads the clock", () => {
    const realNow = Date.now;
    Date.now = () => {
      throw new Error("Date.now() was called");
    };
    try {
      const key = { isoYear: 2026, isoWeek: 42 };
      isValidWeekKey(key);
      weekDates(key);
      shiftWeek(key, 1);
      weekKeyOfDate("2026-10-12");
    } finally {
      Date.now = realNow;
    }
  });
});
