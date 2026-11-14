/**
 * The order of tasks in the week's lists. Shared by the server (which stores it) and the browser
 * (which shows a move before the server confirms it), so both arrive at the same positions.
 *
 * - The weekly list holds weekly tasks, even once planned for a day, and anything without a day.
 *   It is ordered by `position`.
 * - A day's list holds the tasks planned for that day, ordered by `dayPosition`.
 *
 * A weekly task planned for a day sits in both lists, with an independent place in each.
 */
import type { TaskKind } from "@/lib/api-types";

export type OrderedTask = {
  id: string;
  kind: TaskKind;
  assignedDate: string | null;
  position: number;
  dayPosition: number;
};

export type TaskList = "weekly" | "day";

/** Where a moved task lands in one of its lists: just before `before`, or last when it is null. */
export type Placement = { list: TaskList; before: string | null };

export type TaskMove = { assignedDate?: string | null; place?: Placement };

export class PlacementError extends Error {}

export function inWeeklyList(task: Pick<OrderedTask, "kind" | "assignedDate">) {
  return task.kind === "weekly" || task.assignedDate === null;
}

function byId(a: OrderedTask, b: OrderedTask) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function weeklyOrder(a: OrderedTask, b: OrderedTask) {
  return a.position - b.position || a.dayPosition - b.dayPosition || byId(a, b);
}

export function dayOrder(a: OrderedTask, b: OrderedTask) {
  return a.dayPosition - b.dayPosition || a.position - b.position || byId(a, b);
}

export function weeklyList<T extends OrderedTask>(tasks: T[]) {
  return tasks.filter(inWeeklyList).sort(weeklyOrder);
}

export function dayList<T extends OrderedTask>(tasks: T[], date: string) {
  return tasks.filter((task) => task.assignedDate === date).sort(dayOrder);
}

/** Positions for a new task: the bottom of every list. */
export function nextPositions(tasks: OrderedTask[]) {
  return {
    position: Math.max(-1, ...tasks.map((task) => task.position)) + 1,
    dayPosition: Math.max(-1, ...tasks.map((task) => task.dayPosition)) + 1,
  };
}

/**
 * The week's tasks after `taskId` is planned for `move.assignedDate` and, with `move.place`,
 * dropped at a spot in one of its lists. A list the task newly joins any other way gets it at the
 * bottom. Callers save the tasks whose day or positions changed.
 *
 * Throws `PlacementError` when the task would not be in the list it is placed in.
 */
export function moveTask<T extends OrderedTask>(tasks: T[], taskId: string, move: TaskMove): T[] {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) return tasks;

  const assignedDate = move.assignedDate === undefined ? task.assignedDate : move.assignedDate;
  const moved: T = { ...task, assignedDate };
  const next = nextPositions(tasks);
  if (inWeeklyList(moved) && !inWeeklyList(task) && move.place?.list !== "weekly") moved.position = next.position;
  if (assignedDate && assignedDate !== task.assignedDate && move.place?.list !== "day") {
    moved.dayPosition = next.dayPosition;
  }

  let result = tasks.map((candidate) => (candidate === task ? moved : candidate));
  const place = move.place;
  if (!place) return result;

  let list: T[];
  if (place.list === "weekly") {
    if (!inWeeklyList(moved)) throw new PlacementError("A task planned only for a day isn't on the weekly list");
    list = weeklyList(result);
  } else {
    if (!assignedDate) throw new PlacementError("A task without a day can't be placed in a day");
    list = dayList(result, assignedDate);
  }

  const others = list.filter((candidate) => candidate.id !== taskId);
  const index = place.before === null ? -1 : others.findIndex((candidate) => candidate.id === place.before);
  const order = index < 0 ? [...others, moved] : [...others.slice(0, index), moved, ...others.slice(index)];

  const key = place.list === "weekly" ? "position" : "dayPosition";
  const positions = new Map(order.map((candidate, i) => [candidate.id, i]));
  result = result.map((candidate) => {
    const position = positions.get(candidate.id);
    return position === undefined || candidate[key] === position ? candidate : { ...candidate, [key]: position };
  });
  return result;
}
