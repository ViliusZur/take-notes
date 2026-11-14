import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "@/server/db";
import { calls, tasks, weeks, type Task } from "@/server/db/schema";
import { weekStartDate, type WeekKey } from "@/lib/weeks";

export async function findWeek(ex: Executor, userId: string, key: WeekKey) {
  const [week] = await ex
    .select()
    .from(weeks)
    .where(and(eq(weeks.userId, userId), eq(weeks.isoYear, key.isoYear), eq(weeks.isoWeek, key.isoWeek)));
  return week;
}

/** Returns the week row, creating it on first write. */
export async function ensureWeek(ex: Executor, userId: string, key: WeekKey) {
  await ex
    .insert(weeks)
    .values({ userId, isoYear: key.isoYear, isoWeek: key.isoWeek, weekStartDate: weekStartDate(key) })
    .onConflictDoNothing();
  const week = await findWeek(ex, userId, key);
  if (!week) throw new Error("Week upsert failed");
  return week;
}

export async function listWeeksForYear(ex: Executor, userId: string, isoYear: number) {
  return ex
    .select({
      isoYear: weeks.isoYear,
      isoWeek: weeks.isoWeek,
      weekStartDate: weeks.weekStartDate,
      bigPictureDirection: weeks.bigPictureDirection,
      open: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'open')`.mapWith(Number),
      done: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'done')`.mapWith(Number),
      skipped: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'skipped')`.mapWith(Number),
    })
    .from(weeks)
    .leftJoin(tasks, eq(tasks.weekId, weeks.id))
    .where(and(eq(weeks.userId, userId), eq(weeks.isoYear, isoYear)))
    .groupBy(weeks.id)
    .orderBy(asc(weeks.isoWeek));
}

export async function listTasks(ex: Executor, weekId: string) {
  return ex
    .select()
    .from(tasks)
    .where(eq(tasks.weekId, weekId))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
}

/** Positions at the bottom of every list of the week, for a new task. */
export async function nextTaskPositions(ex: Executor, weekId: string) {
  const [row] = await ex
    .select({
      position: sql<number>`coalesce(max(${tasks.position}), -1) + 1`.mapWith(Number),
      dayPosition: sql<number>`coalesce(max(${tasks.dayPosition}), -1) + 1`.mapWith(Number),
    })
    .from(tasks)
    .where(eq(tasks.weekId, weekId));
  return { position: row?.position ?? 0, dayPosition: row?.dayPosition ?? 0 };
}

/** Serializes reordering within a week, so two moves never interleave their renumbering. */
export async function lockWeekOrder(ex: Executor, weekId: string) {
  await ex.select({ id: weeks.id }).from(weeks).where(eq(weeks.id, weekId)).for("no key update");
}

/** Renumbers a task in its lists. Order isn't content, so the task's version stays. */
export async function setTaskPositions(
  ex: Executor,
  taskId: string,
  positions: Pick<Task, "position" | "dayPosition">,
) {
  await ex.update(tasks).set(positions).where(eq(tasks.id, taskId));
}

export async function insertTask(ex: Executor, values: typeof tasks.$inferInsert) {
  const [task] = await ex.insert(tasks).values(values).returning();
  return task;
}

/** Loads a task together with its week, scoped to the owner. */
export async function findOwnedTask(ex: Executor, userId: string, taskId: string) {
  const [row] = await ex
    .select({ task: tasks, week: weeks })
    .from(tasks)
    .innerJoin(weeks, eq(tasks.weekId, weeks.id))
    .where(and(eq(tasks.id, taskId), eq(weeks.userId, userId)));
  return row;
}

export async function updateTask(
  ex: Executor,
  taskId: string,
  expectedVersion: number,
  patch: Partial<
    Pick<Task, "title" | "assignedDate" | "status" | "skippedReason" | "position" | "dayPosition" | "completedAt">
  >,
) {
  const [task] = await ex
    .update(tasks)
    .set({ ...patch, version: sql`${tasks.version} + 1` })
    .where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion)))
    .returning();
  return task;
}

export async function deleteTask(ex: Executor, taskId: string) {
  await ex.delete(tasks).where(eq(tasks.id, taskId));
}

export async function deleteTasksByIds(ex: Executor, ids: string[]) {
  if (ids.length === 0) return;
  await ex.delete(tasks).where(inArray(tasks.id, ids));
}

export async function updateWeekDirection(
  ex: Executor,
  weekId: string,
  expectedVersion: number,
  bigPictureDirection: string,
) {
  const [week] = await ex
    .update(weeks)
    .set({ bigPictureDirection, version: sql`${weeks.version} + 1` })
    .where(and(eq(weeks.id, weekId), eq(weeks.version, expectedVersion)))
    .returning();
  return week;
}

export async function updateWeekNotes(ex: Executor, weekId: string, expectedVersion: number, notes: string) {
  const [week] = await ex
    .update(weeks)
    .set({ notes, notesVersion: sql`${weeks.notesVersion} + 1` })
    .where(and(eq(weeks.id, weekId), eq(weeks.notesVersion, expectedVersion)))
    .returning();
  return week;
}

/** Every week's content with versions, for converting the notebook (encryption on/off). */
export async function listWeekContent(ex: Executor, userId: string) {
  return ex
    .select({
      id: weeks.id,
      version: weeks.version,
      notesVersion: weeks.notesVersion,
      bigPictureDirection: weeks.bigPictureDirection,
      notes: weeks.notes,
    })
    .from(weeks)
    .where(eq(weeks.userId, userId))
    .orderBy(asc(weeks.isoYear), asc(weeks.isoWeek));
}

export async function listTaskContent(ex: Executor, userId: string) {
  return ex
    .select({ id: tasks.id, version: tasks.version, title: tasks.title, skippedReason: tasks.skippedReason })
    .from(tasks)
    .innerJoin(weeks, eq(tasks.weekId, weeks.id))
    .where(eq(weeks.userId, userId))
    .orderBy(asc(tasks.createdAt));
}

/** Replaces a week's content if neither version moved; bumps both. Returns false on a conflict. */
export async function replaceWeekContent(
  ex: Executor,
  week: { id: string; version: number; notesVersion: number; bigPictureDirection: string; notes: string },
) {
  const updated = await ex
    .update(weeks)
    .set({
      bigPictureDirection: week.bigPictureDirection,
      notes: week.notes,
      version: sql`${weeks.version} + 1`,
      notesVersion: sql`${weeks.notesVersion} + 1`,
    })
    .where(and(eq(weeks.id, week.id), eq(weeks.version, week.version), eq(weeks.notesVersion, week.notesVersion)))
    .returning({ id: weeks.id });
  return updated.length === 1;
}

/** Replaces a task's content if its version did not move; bumps it. Returns false on a conflict. */
export async function replaceTaskContent(
  ex: Executor,
  task: { id: string; version: number; title: string; skippedReason: string | null },
) {
  const updated = await ex
    .update(tasks)
    .set({ title: task.title, skippedReason: task.skippedReason, version: sql`${tasks.version} + 1` })
    .where(and(eq(tasks.id, task.id), eq(tasks.version, task.version)))
    .returning({ id: tasks.id });
  return updated.length === 1;
}

export async function listProcessedCallsForWeek(ex: Executor, userId: string, key: WeekKey) {
  return ex
    .select({ id: calls.id, createdAt: calls.createdAt, importResult: calls.importResult })
    .from(calls)
    .where(
      and(
        eq(calls.userId, userId),
        eq(calls.targetIsoYear, key.isoYear),
        eq(calls.targetIsoWeek, key.isoWeek),
        eq(calls.status, "processed"),
      ),
    )
    .orderBy(asc(calls.createdAt));
}
