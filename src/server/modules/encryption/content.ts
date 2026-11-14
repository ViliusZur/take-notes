import "server-only";
import { HttpError } from "@/server/http";
import { CONTENT_LIMITS, envelopeLimit, isEnvelope, type ContentField } from "@/lib/encryption";

/** How a user's planner content is stored: readable, or as `enc1.` envelopes only their browser can open. */
export type ContentMode = "plain" | "encrypted";

const LABELS: Record<ContentField, string> = {
  "task.title": "Task title",
  "task.skippedReason": "Skipped reason",
  "week.direction": "Big picture",
  "week.notes": "Notes",
};

const TRIMMED = new Set<ContentField>(["task.title", "task.skippedReason"]);

/**
 * Validates a content value for the user's mode and returns what to store.
 * Plain text keeps the editors' rules. Encrypted content must be an envelope (or empty),
 * so plain text can never slip into an encrypted notebook.
 */
export function contentValue(mode: ContentMode, field: ContentField, value: string): string {
  if (mode === "encrypted") {
    if (value === "" && field !== "task.title") return value;
    if (!isEnvelope(value) || value.length > envelopeLimit(field)) {
      throw new HttpError(422, `${LABELS[field]} must be encrypted`, { code: "encryption_required" });
    }
    return value;
  }

  const text = TRIMMED.has(field) ? value.trim() : value;
  if (field === "task.title" && !text) throw new HttpError(422, "Task title can't be empty");
  if (text.length > CONTENT_LIMITS[field]) {
    throw new HttpError(422, `${LABELS[field]} is longer than ${CONTENT_LIMITS[field]} characters`);
  }
  return text;
}
