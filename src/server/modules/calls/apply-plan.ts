import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/server/db";
import { calls, tasks, type CallImportResult } from "@/server/db/schema";
import * as plannerRepo from "@/server/modules/planner/repository";
import type { ExtractedPlan } from "@/server/modules/extraction/schema";
import { dateForWeekday, type WeekKey } from "@/lib/weeks";

const NOTES_SEPARATOR = "\n\n";

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Appends a processed call's plan to the target week. Never overwrites or deletes
 * user-entered content, and records exactly what changed so it can be undone.
 *
 * - tasks go on the weekly to-do list (scheduled on a day when the caller named one)
 * - day items (appointments, reminders) become tasks on that day only
 * - week notes are appended to the week's notes
 */
export async function applyPlan(
  tx: Transaction,
  args: {
    userId: string;
    callId: string;
    week: WeekKey;
    plan: ExtractedPlan;
    /** Task ids the call was allowed to carry over (the caller's unfinished tasks). */
    carryOverCandidateIds: string[];
  },
): Promise<CallImportResult> {
  const { userId, callId, week: key, plan } = args;
  const week = await plannerRepo.ensureWeek(tx, userId, key);
  const existing = await plannerRepo.listTasks(tx, week.id);
  const seen = new Set(existing.map((task) => normalize(task.title)));
  const candidates = new Set(args.carryOverCandidateIds);
  let position = await plannerRepo.nextTaskPosition(tx, week.id);

  const items = [
    ...plan.tasks.map((task) => ({ ...task, title: task.title, kind: "weekly" as const })),
    ...plan.dayItems.map((item) => ({
      title: item.text,
      day: item.day,
      carriedOverFromTaskId: null,
      kind: "ad_hoc" as const,
    })),
  ];

  const taskIds: string[] = [];
  for (const item of items) {
    const title = item.title.trim();
    if (!title || seen.has(normalize(title))) continue;
    seen.add(normalize(title));
    const task = await plannerRepo.insertTask(tx, {
      weekId: week.id,
      callId,
      title,
      kind: item.kind,
      assignedDate: item.day ? dateForWeekday(key, item.day) : null,
      carriedOverFromTaskId:
        item.carriedOverFromTaskId && candidates.has(item.carriedOverFromTaskId) ? item.carriedOverFromTaskId : null,
      position: position++,
    });
    taskIds.push(task.id);
  }

  const noteLines: string[] = [];
  let direction: CallImportResult["direction"] = null;
  const callDirection = plan.bigPictureDirection?.trim();
  if (callDirection) {
    if (!week.bigPictureDirection.trim()) {
      await plannerRepo.updateWeekDirection(tx, week.id, week.version, callDirection);
      direction = { set: true, value: callDirection };
    } else if (normalize(week.bigPictureDirection) !== normalize(callDirection)) {
      // Keep the user's direction; record the call's version in the notes.
      noteLines.push(`Direction from your call: ${callDirection}`);
    }
  }
  if (plan.weekNotes?.trim()) noteLines.push(plan.weekNotes.trim());

  let notesAppended: string | null = null;
  if (noteLines.length) {
    const block = `From your planning call:\n${noteLines.join("\n")}`;
    notesAppended = week.notes.trim() ? `${NOTES_SEPARATOR}${block}` : block;
    await plannerRepo.updateWeekNotes(tx, week.id, week.notesVersion, week.notes + notesAppended);
  }

  return { taskIds, direction, notesAppended };
}

/** Removes what `applyPlan` added, leaving anything the user changed since alone where possible. */
export async function undoPlan(tx: Transaction, userId: string, callId: string, result: CallImportResult, key: WeekKey) {
  if (result.taskIds.length) {
    await tx.delete(tasks).where(and(inArray(tasks.id, result.taskIds), eq(tasks.callId, callId)));
  }

  const week = await plannerRepo.findWeek(tx, userId, key);
  if (week) {
    if (result.direction?.set && week.bigPictureDirection === result.direction.value) {
      await plannerRepo.updateWeekDirection(tx, week.id, week.version, "");
    }
    if (result.notesAppended && week.notes.includes(result.notesAppended)) {
      await plannerRepo.updateWeekNotes(tx, week.id, week.notesVersion, week.notes.replace(result.notesAppended, ""));
    }
  }

  await tx
    .update(calls)
    .set({ importResult: { ...result, undoneAt: new Date().toISOString() } })
    .where(eq(calls.id, callId));
}
