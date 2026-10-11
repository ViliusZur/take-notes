import "server-only";
import { z } from "zod";
import { HttpError } from "@/server/http";
import { isValidWeekKey, type WeekKey } from "@/lib/weeks";

export const isoDate = z.iso.date();

export function weekKeyFromParams(params: { isoYear: string; isoWeek: string }): WeekKey {
  const key = { isoYear: Number(params.isoYear), isoWeek: Number(params.isoWeek) };
  if (!isValidWeekKey(key)) throw new HttpError(404, "No such ISO week");
  return key;
}

export function isoYearFromParam(value: string) {
  const isoYear = Number(value);
  if (!Number.isInteger(isoYear) || isoYear < 2000 || isoYear > 2100) throw new HttpError(404, "No such year");
  return isoYear;
}

export const taskTitle = z.string().trim().min(1).max(200);
