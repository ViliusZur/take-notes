import "server-only";
import { z } from "zod";
import { HttpError } from "@/server/http";
import { envelopeLimit, LOCK_TIMEOUT_OPTIONS } from "@/lib/encryption";
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

/**
 * Content fields only get an outer bound here: the planner service applies the plain-text rules
 * (trimming, 200 characters, …) or, for encrypted notebooks, checks for an encrypted envelope.
 */
export const taskTitle = z.string().max(envelopeLimit("task.title"));
export const skippedReason = z.string().max(envelopeLimit("task.skippedReason"));

const base64Url = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const encryptionKeys = z.object({
  kdf: z.literal("PBKDF2-SHA256"),
  iterations: z.number().int().min(100_000).max(10_000_000),
  salt: base64Url.min(22).max(64),
  wrappedKey: base64Url.min(43).max(128),
  wrapIv: base64Url.length(16),
});

/** 32 bytes, base64url. */
export const proofValue = base64Url.length(43);

export const lockTimeout = z
  .number()
  .int()
  .refine((value) => (LOCK_TIMEOUT_OPTIONS as readonly number[]).includes(value), "Unsupported lock timeout");

const version = z.number().int().min(0);

export const notebookContent = z.object({
  weeks: z
    .array(
      z.object({
        id: z.uuid(),
        version,
        notesVersion: version,
        bigPictureDirection: z.string().max(envelopeLimit("week.direction")),
        notes: z.string().max(envelopeLimit("week.notes")),
      }),
    )
    .max(5_000),
  tasks: z
    .array(
      z.object({
        id: z.uuid(),
        version,
        title: taskTitle,
        skippedReason: skippedReason.nullable(),
      }),
    )
    .max(100_000),
});
