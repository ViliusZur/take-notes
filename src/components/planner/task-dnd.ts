import type {
  Announcements,
  ClientRect,
  CollisionDetection,
  DroppableContainer,
  KeyboardCoordinateGetter,
  UniqueIdentifier,
} from "@dnd-kit/core";
import type { TaskDto } from "@/lib/api-types";
import { dayList, moveTask, PlacementError, weeklyList, type TaskMove } from "@/lib/task-order";
import { formatWeekdayLong } from "@/lib/weeks";

/**
 * Dragging tasks in the week planner.
 *
 * Lists (the weekly list and each day) and the day strip's buttons are drop targets. Task rows are
 * registered too, only so their positions are measured: a drop lands in a list, at the spot between
 * the rows nearest the pointer (or, when dragging with the keyboard, the dragged card's center).
 */

/** The weekly list, or a day's list. */
export type ListId = "weekly" | `day:${string}`;

export function dayListId(date: string): ListId {
  return `day:${date}`;
}

export function listDate(list: ListId) {
  return list === "weekly" ? null : list.slice("day:".length);
}

/** What a dragged task carries: the task and the list it was picked up from. */
export type DragData = { task: TaskDto; list: ListId };

/** Drop targets: a list, or a day button in the strip (which drops at the bottom of that day). */
export type DropData = { kind: "list"; list: ListId } | { kind: "strip"; date: string };

/** A task row, measured to find the spot between rows. */
export type RowData = { kind: "row"; list: ListId; taskId: string };

/** Where a drop would land: before the `index`-th row of the list (not counting the dragged task). */
export type Slot = { kind: "list"; list: ListId; index: number } | { kind: "strip"; date: string };

type Point = { x: number; y: number };
type RectMap = Map<UniqueIdentifier, ClientRect>;

function center(rect: ClientRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function contains(rect: ClientRect | undefined, point: Point): rect is ClientRect {
  return Boolean(
    rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      point.x >= rect.left &&
      point.x <= rect.left + rect.width &&
      point.y >= rect.top &&
      point.y <= rect.top + rect.height,
  );
}

function dataOf(container: DroppableContainer) {
  return container.data.current as DropData | RowData | undefined;
}

function draggedTaskId(data: unknown) {
  return (data as DragData | undefined)?.task.id;
}

/** The list's rows other than the dragged task's, top to bottom. */
function otherRows(list: ListId, taskId: string | undefined, containers: DroppableContainer[], rects: RectMap) {
  const rows: ClientRect[] = [];
  for (const container of containers) {
    const data = dataOf(container);
    const rect = rects.get(container.id);
    if (data?.kind === "row" && data.list === list && data.taskId !== taskId && rect && rect.height > 0) {
      rows.push(rect);
    }
  }
  return rows.sort((a, b) => a.top - b.top);
}

function slotAt(point: Point, taskId: string | undefined, containers: DroppableContainer[], rects: RectMap) {
  for (const container of containers) {
    const data = dataOf(container);
    if (data?.kind === "strip" && contains(rects.get(container.id), point)) {
      return { container, slot: { kind: "strip", date: data.date } satisfies Slot };
    }
  }
  for (const container of containers) {
    const data = dataOf(container);
    if (data?.kind === "list" && contains(rects.get(container.id), point)) {
      const rows = otherRows(data.list, taskId, containers, rects);
      const index = rows.filter((row) => center(row).y < point.y).length;
      return { container, slot: { kind: "list", list: data.list, index } satisfies Slot };
    }
  }
  return null;
}

/** Finds the list (or strip button) under the pointer and the spot in it; see `Slot`. */
export const collisionDetection: CollisionDetection = (args) => {
  const point = args.pointerCoordinates ?? center(args.collisionRect);
  const hit = slotAt(point, draggedTaskId(args.active.data.current), args.droppableContainers, args.droppableRects);
  if (!hit) return [];
  return [{ id: hit.container.id, data: { droppableContainer: hit.container, value: 0, slot: hit.slot } }];
};

/** The slot a drag event's collision found. */
export function slotOf(collisions: { data?: Record<string, unknown> }[] | null): Slot | null {
  return (collisions?.[0]?.data?.slot as Slot | undefined) ?? null;
}

/** Days in order, then the weekly list. */
function listOrder(list: ListId) {
  return list === "weekly" ? "~" : list;
}

/**
 * Up and down arrows step through the spots between rows, list by list. Returns where the dragged
 * card's top-left corner goes so that its center sits on the next spot.
 */
export const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const step = event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0;
  if (!step) return undefined;
  event.preventDefault();
  const { active, collisionRect, droppableRects, droppableContainers } = context;
  if (!active || !collisionRect) return undefined;

  const taskId = draggedTaskId(active.data.current);
  const containers = droppableContainers.getEnabled();
  const lists = containers
    .flatMap((container) => {
      const data = dataOf(container);
      const rect = droppableRects.get(container.id);
      return data?.kind === "list" && rect && rect.width > 0 && rect.height > 0 ? [{ list: data.list, rect }] : [];
    })
    .sort((a, b) => (listOrder(a.list) < listOrder(b.list) ? -1 : 1));

  const spots: (Point & { list: ListId; index: number })[] = [];
  for (const { list, rect } of lists) {
    const rows = otherRows(list, taskId, containers, droppableRects);
    const x = center(rect).x;
    if (rows.length === 0) {
      spots.push({ list, index: 0, x, y: center(rect).y });
      continue;
    }
    for (let index = 0; index <= rows.length; index++) {
      const above = rows[index - 1];
      const below = rows[index];
      const y = !above ? below.top + 1 : !below ? above.top + above.height - 1 : (above.top + above.height + below.top) / 2;
      spots.push({ list, index, x, y });
    }
  }
  if (spots.length === 0) return undefined;

  const here = center(collisionRect);
  const slot = slotAt(here, taskId, containers, droppableRects)?.slot;
  let current =
    slot?.kind === "list" ? spots.findIndex((spot) => spot.list === slot.list && spot.index === slot.index) : -1;
  if (current < 0) {
    const distance = (spot: Point) => Math.hypot(spot.x - here.x, spot.y - here.y);
    current = spots.reduce((best, spot, i) => (distance(spot) < distance(spots[best]) ? i : best), 0);
  }
  const next = spots[Math.min(spots.length - 1, Math.max(0, current + step))];
  return { x: next.x - collisionRect.width / 2, y: next.y - collisionRect.height / 2 };
};

function listName(list: ListId) {
  const date = listDate(list);
  return date ? formatWeekdayLong(date) : "the weekly to-do list";
}

function slotName(slot: Slot | null) {
  if (!slot) return null;
  if (slot.kind === "strip") return `the bottom of ${formatWeekdayLong(slot.date)}`;
  return `position ${slot.index + 1} in ${listName(slot.list)}`;
}

/**
 * Follows the spot a drag would land on, for the screen reader announcements that name the task and
 * where it would go. `track` returns false when the spot did not change.
 */
export function createDragTracker() {
  let slot: Slot | null = null;
  let announced: string | null = null;
  const title = (data: unknown) => `"${(data as DragData | undefined)?.task.title ?? "task"}"`;

  const announcements: Announcements = {
    onDragStart({ active }) {
      announced = null;
      return `Picked up ${title(active.data.current)}. Use the up and down arrow keys to move it.`;
    },
    onDragOver({ active, over }) {
      return over ? undefined : `${title(active.data.current)} is not over a list.`;
    },
    onDragMove({ active }) {
      const name = slotName(slot);
      if (!name || name === announced) return undefined;
      announced = name;
      return `${title(active.data.current)}: ${name}.`;
    },
    onDragEnd({ active }) {
      const name = slotName(slot);
      return name ? `Dropped ${title(active.data.current)} at ${name}.` : `Dropped ${title(active.data.current)}.`;
    },
    onDragCancel({ active }) {
      return `Stopped moving ${title(active.data.current)}. It stays where it was.`;
    },
  };

  return {
    announcements,
    track(next: Slot | null) {
      if (sameSlot(slot, next)) return false;
      slot = next;
      return true;
    },
  };
}

/** When the last drag ended; a click right after it is the end of that drag, not a tap. */
let dragEndedAt = -Infinity;

export function noteDragEnded() {
  dragEndedAt = performance.now();
}

export function justDragged() {
  return performance.now() - dragEndedAt < 400;
}

/**
 * What dropping `drag` on `slot` changes, as a task patch, or null when it changes nothing.
 * A drop in the weekly list keeps the task's day when it was dragged within that list, and clears
 * it when the task came from a day. A drop on a strip button plans it for that day, at the bottom.
 */
export function dropMove(tasks: TaskDto[], drag: DragData, slot: Slot): TaskMove | null {
  const task = tasks.find((candidate) => candidate.id === drag.task.id);
  if (!task) return null;

  let move: TaskMove;
  if (slot.kind === "strip") {
    move = { assignedDate: slot.date };
  } else {
    const date = listDate(slot.list);
    const others = (date ? dayList(tasks, date) : weeklyList(tasks)).filter((candidate) => candidate.id !== task.id);
    move = {
      assignedDate: date ?? (drag.list === "weekly" ? task.assignedDate : null),
      place: { list: date ? "day" : "weekly", before: others[slot.index]?.id ?? null },
    };
  }

  let arranged: TaskDto[];
  try {
    arranged = moveTask(tasks, task.id, move);
  } catch (error) {
    if (error instanceof PlacementError) return null;
    throw error;
  }
  const changed = arranged.some(
    (after, i) =>
      after.assignedDate !== tasks[i].assignedDate ||
      after.position !== tasks[i].position ||
      after.dayPosition !== tasks[i].dayPosition,
  );
  if (!changed) return null;
  return {
    ...(move.assignedDate !== task.assignedDate ? { assignedDate: move.assignedDate } : {}),
    ...(move.place ? { place: move.place } : {}),
  };
}

export function sameSlot(a: Slot | null, b: Slot | null) {
  if (!a || !b) return a === b;
  if (a.kind === "strip") return b.kind === "strip" && a.date === b.date;
  if (b.kind === "strip") return false;
  return a.list === b.list && a.index === b.index;
}
