import "server-only";
import { db, type Executor } from "@/server/db";
import type { Task, Week } from "@/server/db/schema";
import { HttpError, notFound, VersionConflict } from "@/server/http";
import type { TaskDto, TaskKind, TaskStatus, WeekDto, WeekNotesDto, WeekSummaryDto } from "@/lib/api-types";
import { isValidWeekKey, weekDates, weekStartDate, type WeekKey } from "@/lib/weeks";
import * as repo from "./repository";

export function assertWeekKey(key: WeekKey) {
  if (!isValidWeekKey(key)) throw new HttpError(404, "No such ISO week");
}

export function toTaskDto(task: Task): TaskDto {
  return {
    id: task.id,
    title: task.title,
    kind: task.kind,
    assignedDate: task.assignedDate,
    status: task.status,
    skippedReason: task.skippedReason,
    position: task.position,
    version: task.version,
    callId: task.callId,
    carriedOverFromTaskId: task.carriedOverFromTaskId,
  };
}

export async function getWeek(userId: string, key: WeekKey, ex: Executor = db): Promise<WeekDto> {
  assertWeekKey(key);
  const week = await repo.findWeek(ex, userId, key);
  const [taskRows, processedCalls] = week
    ? await Promise.all([repo.listTasks(ex, week.id), repo.listProcessedCallsForWeek(ex, userId, key)])
    : [[], []];

  return {
    isoYear: key.isoYear,
    isoWeek: key.isoWeek,
    weekStartDate: weekStartDate(key),
    dates: weekDates(key),
    bigPictureDirection: week?.bigPictureDirection ?? "",
    version: week?.version ?? 0,
    notes: week?.notes ?? "",
    notesVersion: week?.notesVersion ?? 0,
    tasks: taskRows.map(toTaskDto),
    callImports: processedCalls
      .filter((call) => call.importResult && !call.importResult.undoneAt)
      .map((call) => ({
        callId: call.id,
        createdAt: call.createdAt.toISOString(),
        taskCount: call.importResult?.taskIds.length ?? 0,
      })),
  };
}

export async function listWeekSummaries(userId: string, isoYear: number): Promise<WeekSummaryDto[]> {
  const rows = await repo.listWeeksForYear(db, userId, isoYear);
  return rows.map((row) => ({
    isoYear: row.isoYear,
    isoWeek: row.isoWeek,
    weekStartDate: row.weekStartDate,
    bigPictureDirection: row.bigPictureDirection,
    taskCounts: { open: row.open, done: row.done, skipped: row.skipped },
  }));
}

async function weekDto(userId: string, week: Week) {
  return getWeek(userId, { isoYear: week.isoYear, isoWeek: week.isoWeek });
}

export async function setDirection(
  userId: string,
  key: WeekKey,
  direction: string,
  expectedVersion: number | undefined,
): Promise<WeekDto> {
  assertWeekKey(key);
  const week = await repo.ensureWeek(db, userId, key);
  // A never-written week is version 0 to the client; ensureWeek creates it at 1.
  const clientVersion = expectedVersion === 0 ? 1 : expectedVersion;
  const updated = await repo.updateWeekDirection(db, week.id, clientVersion ?? week.version, direction);
  if (!updated) throw new VersionConflict(await weekDto(userId, week));
  return weekDto(userId, updated);
}

function assertDateInWeek(key: WeekKey, date: string | null | undefined) {
  if (date && !weekDates(key).includes(date)) {
    throw new HttpError(422, "assignedDate must be a day of this week");
  }
}

export async function createTask(
  userId: string,
  key: WeekKey,
  input: { title: string; assignedDate?: string | null; kind?: TaskKind },
): Promise<TaskDto> {
  assertWeekKey(key);
  assertDateInWeek(key, input.assignedDate);
  const week = await repo.ensureWeek(db, userId, key);
  const task = await repo.insertTask(db, {
    weekId: week.id,
    title: input.title,
    assignedDate: input.assignedDate ?? null,
    kind: input.kind ?? (input.assignedDate ? "ad_hoc" : "weekly"),
    position: await repo.nextTaskPosition(db, week.id),
  });
  return toTaskDto(task);
}

export type TaskPatch = {
  title?: string;
  assignedDate?: string | null;
  status?: TaskStatus;
  skippedReason?: string | null;
  position?: number;
};

export async function updateTask(
  userId: string,
  taskId: string,
  patch: TaskPatch,
  expectedVersion: number | undefined,
): Promise<TaskDto> {
  const found = await repo.findOwnedTask(db, userId, taskId);
  if (!found) throw notFound("Task");
  const { task, week } = found;
  assertDateInWeek({ isoYear: week.isoYear, isoWeek: week.isoWeek }, patch.assignedDate);

  const changes: Parameters<typeof repo.updateTask>[3] = {};
  if (patch.title !== undefined) changes.title = patch.title;
  if (patch.assignedDate !== undefined) changes.assignedDate = patch.assignedDate;
  if (patch.position !== undefined) changes.position = patch.position;
  if (patch.status !== undefined) {
    changes.status = patch.status;
    changes.completedAt = patch.status === "done" ? new Date() : null;
    if (patch.status !== "skipped") changes.skippedReason = null;
  }
  if (patch.skippedReason !== undefined) {
    const status = patch.status ?? task.status;
    if (status !== "skipped" && patch.skippedReason) {
      throw new HttpError(422, "Only skipped tasks can have a skipped reason");
    }
    changes.skippedReason = patch.skippedReason;
  }

  const updated = await repo.updateTask(db, task.id, expectedVersion ?? task.version, changes);
  if (!updated) throw new VersionConflict(toTaskDto(task));
  return toTaskDto(updated);
}

export async function deleteTask(userId: string, taskId: string) {
  const found = await repo.findOwnedTask(db, userId, taskId);
  if (!found) throw notFound("Task");
  await repo.deleteTask(db, taskId);
}

/** Replaces the week's notes. Versioned separately from the direction. */
export async function setNotes(
  userId: string,
  key: WeekKey,
  notes: string,
  expectedVersion: number | undefined,
): Promise<WeekNotesDto> {
  assertWeekKey(key);
  const week = await repo.ensureWeek(db, userId, key);
  // A never-written week is version 0 to the client; ensureWeek creates it at 1.
  const clientVersion = expectedVersion === 0 ? 1 : expectedVersion;
  const updated = await repo.updateWeekNotes(db, week.id, clientVersion ?? week.notesVersion, notes);
  if (!updated) throw new VersionConflict({ notes: week.notes, notesVersion: week.notesVersion });
  return { notes: updated.notes, notesVersion: updated.notesVersion };
}
