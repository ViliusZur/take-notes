/** JSON shapes shared by the REST API and the client. */

export type TaskStatus = "open" | "done" | "skipped";
export type TaskKind = "weekly" | "ad_hoc";

export type TaskDto = {
  id: string;
  title: string;
  kind: TaskKind;
  assignedDate: string | null;
  status: TaskStatus;
  skippedReason: string | null;
  position: number;
  version: number;
  callId: string | null;
  carriedOverFromTaskId: string | null;
};

export type CallImportBanner = {
  callId: string;
  createdAt: string;
  taskCount: number;
};

export type WeekDto = {
  isoYear: number;
  isoWeek: number;
  weekStartDate: string;
  dates: string[];
  bigPictureDirection: string;
  /** Version of the direction; 0 when the week has never been written. */
  version: number;
  notes: string;
  /** Version of the notes; 0 when they have never been written. */
  notesVersion: number;
  tasks: TaskDto[];
  callImports: CallImportBanner[];
};

export type WeekNotesDto = { notes: string; notesVersion: number };

export type WeekSummaryDto = {
  isoYear: number;
  isoWeek: number;
  weekStartDate: string;
  bigPictureDirection: string;
  taskCounts: { open: number; done: number; skipped: number };
};

export type ScheduleChannel = "call" | "email";

export type PlanningScheduleDto = {
  enabled: boolean;
  channel: ScheduleChannel;
  dayOfWeek: number;
  localTime: string;
  timezone: string;
  emailFallback: boolean;
  callConsentAt: string | null;
  nextRunAt: string | null;
};

export type MeDto = {
  id: string;
  email: string;
  name: string;
  timezone: string;
  phoneE164: string | null;
  phoneVerified: boolean;
  /** Notes and tasks are end-to-end encrypted; see `EncryptionStatusDto`. */
  encryptionEnabled: boolean;
};

export type CallStatus =
  | "queued"
  | "ringing"
  | "in_progress"
  | "ended"
  | "no_answer"
  | "failed"
  | "processed";

export type CallDto = {
  id: string;
  status: CallStatus;
  trigger: "schedule" | "manual" | "retry";
  attempt: number;
  targetIsoYear: number;
  targetIsoWeek: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  summary: string | null;
  error: string | null;
  importedTaskCount: number;
  /** True when the call added anything that can still be undone. */
  canUndoImport: boolean;
};

export type CallDetailDto = CallDto & { transcript: string | null };

export type ApiErrorBody = {
  error: string;
  /** Machine-readable reason, e.g. `locked` (423) or `encryption_off` (409). */
  code?: string;
  current?: unknown;
  issues?: unknown;
};

/** What the browser needs to unlock: never the password or the data key itself. */
export type EncryptionKeysDto = {
  kdf: "PBKDF2-SHA256";
  iterations: number;
  /** base64url */
  salt: string;
  /** The data key, AES-GCM-wrapped with a key derived from the password. base64url. */
  wrappedKey: string;
  wrapIv: string;
};

export type EncryptionStatusDto = {
  enabled: boolean;
  /** Minutes of inactivity before an unlocked notebook locks again. */
  lockTimeoutMinutes: number;
  /** Present when enabled. */
  keys: EncryptionKeysDto | null;
};

/**
 * Every piece of planner content a user has, with versions. Read before turning encryption
 * on or off (or changing its password) and written back converted, all or nothing.
 */
export type NotebookContentDto = {
  weeks: { id: string; version: number; notesVersion: number; bigPictureDirection: string; notes: string }[];
  tasks: { id: string; version: number; title: string; skippedReason: string | null }[];
};

/** Which optional features this server has configured. */
export type FeaturesDto = {
  email: boolean;
  calls: boolean;
  /** Calls are faked: a canned conversation, no real phone call. */
  simulatedCalls: boolean;
  /** Phone verification accepts the code 000000 and sends no SMS. */
  simulatedSms: boolean;
  missing: { email: string[]; calls: string[] };
};
