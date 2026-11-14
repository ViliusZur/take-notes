"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical, ListTodo, PhoneCall, Plus, Target } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { TaskDto, WeekDto } from "@/lib/api-types";
import { dayList, weeklyList } from "@/lib/task-order";
import { cn } from "@/lib/utils";
import {
  dayOfMonth,
  formatMonthDay,
  formatWeekday,
  formatWeekdayLong,
  formatWeekRange,
  shiftWeek,
  weekKeyOfDate,
  weekPath,
  weeksBetween,
  type WeekKey,
} from "@/lib/weeks";
import { EncryptionGate } from "@/components/encryption/encryption-gate";
import { AddTaskForm } from "./add-task-form";
import { NotesPanel } from "./notes-panel";
import { SaveIndicator } from "./save-indicator";
import {
  collisionDetection,
  dayListId,
  dropMove,
  keyboardCoordinates,
  createDragTracker,
  noteDragEnded,
  slotOf,
  type DragData,
  type DropData,
  type ListId,
  type Slot,
} from "./task-dnd";
import { TaskItem } from "./task-item";
import { useAutosave } from "./use-autosave";
import { useWeek, useWeekActions, type WeekActions } from "./use-week";

/** Below the sticky header and, on phones, the sticky view switcher. */
const SCROLL_MARGIN = "scroll-mt-[calc(env(safe-area-inset-top)+8rem)] lg:scroll-mt-24";

/** Highlights while a task is dragged over it, and hints while any task is being dragged. */
function DropZone({
  dropId,
  data,
  className,
  children,
  as: Tag = "section",
  ...rest
}: {
  dropId: string;
  data: DropData;
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "button";
} & React.AriaAttributes &
  Pick<React.HTMLAttributes<HTMLElement>, "id" | "role" | "onClick" | "title">) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId, data });
  const { active } = useDndContext();
  return (
    <Tag
      ref={setNodeRef}
      {...(Tag === "button" ? { type: "button" as const } : {})}
      {...rest}
      className={cn(
        "transition-[background-color,box-shadow,outline-color] duration-150",
        active && "outline-2 -outline-offset-2 outline-primary/25 outline-dashed",
        isOver && "bg-primary/8 outline-primary/70 outline-solid",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * The week planner. A plain notebook arrives rendered by the server (`initialWeek`); an encrypted
 * one is fetched and decrypted in the browser once it is unlocked.
 */
export function WeekPlanner({
  weekKey,
  initialWeek,
  encrypted,
  today,
}: {
  weekKey: WeekKey;
  initialWeek: WeekDto | null;
  encrypted: boolean;
  today: string;
}) {
  return (
    <EncryptionGate encrypted={encrypted}>
      <WeekLoader weekKey={weekKey} initialWeek={initialWeek} today={today} />
    </EncryptionGate>
  );
}

function WeekLoader({ weekKey, initialWeek, today }: { weekKey: WeekKey; initialWeek: WeekDto | null; today: string }) {
  const { data: week, isError, refetch, isFetching } = useWeek(weekKey, initialWeek);
  if (week) return <WeekView week={week} today={today} />;
  if (isError) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-sm" role="alert">
        <p className="text-destructive">Could not load this week.</p>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="flex min-h-[50dvh] items-center justify-center text-sm text-muted-foreground" role="status">
      Opening your week…
    </div>
  );
}

type View = "days" | "todo" | "notes";

/**
 * The week: header, big picture, then the days, the weekly to-do list, and notes.
 *
 * Phones show one of days / to do / notes at a time, picked with a switcher that stays in reach.
 * Large screens show the days next to a sticky column with the to-do list and notes, so a task
 * can be dragged from any day onto the list and back.
 */
function WeekView({ week, today }: { week: WeekDto; today: string }) {
  const key = { isoYear: week.isoYear, isoWeek: week.isoWeek };
  const actions = useWeekActions(key);
  const currentWeek = weekKeyOfDate(today);
  const [view, setView] = useState<View>("days");
  const tabsId = useId();

  // The weekly list is the master to-do list: weekly tasks (even once planned for a day)
  // plus anything without a day. Day sections show what is planned for that day.
  const weeklyTasks = weeklyList(week.tasks);
  const tasksByDay = new Map(week.dates.map((date) => [date, dayList(week.tasks, date)]));

  // Drag a task within a list to reorder it, into another list to move it there, or onto a day
  // in the strip to plan it for that day.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
  const [drag, setDrag] = useState<DragData | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [tracker] = useState(createDragTracker);

  // Where the dragged task would land, shown as a line, unless the drop would change nothing.
  const pending = drag && slot?.kind === "list" && dropMove(week.tasks, drag, slot) ? slot : null;
  const dropIndex = (list: ListId) => (pending?.list === list ? pending.index : null);

  function trackSlot(event: DragMoveEvent) {
    const next = slotOf(event.collisions);
    if (tracker.track(next)) setSlot(next);
  }

  function onDragStart(event: DragStartEvent) {
    tracker.track(null);
    setSlot(null);
    setDrag((event.active.data.current as DragData | undefined) ?? null);
    if (typeof TouchEvent !== "undefined" && event.activatorEvent instanceof TouchEvent) navigator.vibrate?.(10);
  }

  function stopDragging() {
    setDrag(null);
    setSlot(null);
    noteDragEnded();
  }

  function onDragEnd(event: DragEndEvent) {
    stopDragging();
    const data = event.active.data.current as DragData | undefined;
    const target = slotOf(event.collisions);
    tracker.track(target);
    const move = data && target ? dropMove(week.tasks, data, target) : null;
    if (data && move) actions.updateTask(data.task.id, move);
  }

  const panelProps = (panel: View) => ({
    id: `${tabsId}-${panel}`,
    role: "tabpanel" as const,
    "aria-labelledby": `${tabsId}-${panel}-tab`,
  });

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements: tracker.announcements }}
      onDragStart={onDragStart}
      onDragMove={trackSlot}
      onDragOver={trackSlot}
      onDragEnd={onDragEnd}
      onDragCancel={stopDragging}
    >
      <div className="flex flex-col gap-4 lg:gap-6">
        <WeekHeader week={key} currentWeek={currentWeek} />

        {week.callImports.map((callImport) => (
          <div
            key={callImport.callId}
            className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/6 p-3.5 sm:items-center sm:p-4"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              <PhoneCall className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                Drafted from your planning call
                {callImport.taskCount > 0 &&
                  ` · ${callImport.taskCount} item${callImport.taskCount === 1 ? "" : "s"}`}
              </p>
              <p className="text-muted-foreground">Change anything that isn&apos;t right.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-primary hover:text-primary"
              disabled={actions.undoPending}
              onClick={() => actions.undoCallImport(callImport.callId)}
            >
              Undo
            </Button>
          </div>
        ))}

        <BigPicture value={week.bigPictureDirection} onSave={actions.setDirection} />

        <ViewSwitcher
          view={view}
          onChange={setView}
          tabsId={tabsId}
          todoCount={weeklyTasks.filter((task) => task.status === "open").length}
        />

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
          <section
            {...panelProps("days")}
            aria-label="Days"
            className={cn("overflow-hidden rounded-2xl border bg-card shadow-xs", view !== "days" && "max-lg:hidden")}
          >
            <DayStrip dates={week.dates} today={today} tasksByDay={tasksByDay} />
            <div className="divide-y">
              {week.dates.map((date) => (
                <DaySection
                  key={date}
                  date={date}
                  today={today}
                  tasks={tasksByDay.get(date) ?? []}
                  dates={week.dates}
                  actions={actions}
                  draggedId={drag?.task.id ?? null}
                  dropIndex={dropIndex(dayListId(date))}
                />
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:gap-6">
            <WeeklyList
              {...panelProps("todo")}
              tasks={weeklyTasks}
              dates={week.dates}
              today={today}
              actions={actions}
              draggedId={drag?.task.id ?? null}
              dropIndex={dropIndex("weekly")}
              className={cn(view !== "todo" && "max-lg:hidden")}
            />
            <NotesPanel
              {...panelProps("notes")}
              className={cn("lg:min-h-72 lg:flex-1 lg:shrink-0", view !== "notes" && "max-lg:hidden")}
              value={week.notes}
              onSave={actions.setNotes}
              weekLabel={`Week ${key.isoWeek} · ${formatWeekRange(key)}`}
            />
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{drag && <DragPreview task={drag.task} />}</DragOverlay>
    </DndContext>
  );
}

function relativeWeekLabel(offset: number) {
  if (offset === 0) return "This week";
  if (offset === 1) return "Next week";
  if (offset === -1) return "Last week";
  return offset > 1 ? `In ${offset} weeks` : `${-offset} weeks ago`;
}

/** "Week 46", how far it is from today, and arrows to step between weeks. */
function WeekHeader({ week, currentWeek }: { week: WeekKey; currentWeek: WeekKey }) {
  const offset = weeksBetween(currentWeek, week);
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", offset === 0 ? "text-primary" : "text-muted-foreground")}>
          {relativeWeekLabel(offset)}
        </p>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight tabular-nums sm:text-4xl">
          Week {week.isoWeek}
        </h1>
        <p className="text-sm text-muted-foreground">{formatWeekRange(week)}</p>
      </div>
      <nav aria-label="Weeks" className="flex shrink-0 items-center gap-2">
        {offset !== 0 && (
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href={weekPath(currentWeek)}>Today</Link>
          </Button>
        )}
        <div className="flex items-center rounded-full border bg-card shadow-xs">
          <Button asChild variant="ghost" size="icon" className="rounded-full" aria-label="Previous week">
            <Link href={weekPath(shiftWeek(week, -1))}>
              <ChevronLeft />
            </Link>
          </Button>
          <span aria-hidden className="h-5 w-px bg-border" />
          <Button asChild variant="ghost" size="icon" className="rounded-full" aria-label="Next week">
            <Link href={weekPath(shiftWeek(week, 1))}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

/** The week's direction. Grows with its text and saves when you leave it (or press Cmd/Ctrl+Enter). */
function BigPicture({ value, onSave }: { value: string; onSave: (value: string) => Promise<unknown> }) {
  const { draft, setDraft, flush, status, dirty } = useAutosave(value, onSave);
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="rounded-2xl border bg-card p-4 shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25 sm:p-5"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-tone-amber text-tone-amber-fg">
          <Target className="size-3.5" aria-hidden />
        </span>
        <h2 id={id} className="text-sm font-semibold">
          Big picture
        </h2>
        <SaveIndicator status={status} dirty={dirty} className="ml-auto" />
      </div>
      <textarea
        aria-label="Big picture direction for the week"
        value={draft}
        placeholder="What matters most this week?"
        maxLength={2000}
        rows={1}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void flush()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void flush();
        }}
        className="block max-h-48 min-h-7 w-full resize-none bg-transparent text-base leading-relaxed outline-none [field-sizing:content] placeholder:text-muted-foreground sm:text-[15px]"
      />
    </section>
  );
}

/** Days / To do / Notes, for phones. Stays under the header while scrolling. */
function ViewSwitcher({
  view,
  onChange,
  tabsId,
  todoCount,
}: {
  view: View;
  onChange: (view: View) => void;
  tabsId: string;
  todoCount: number;
}) {
  const tabs: { value: View; label: string; count?: number }[] = [
    { value: "days", label: "Days" },
    { value: "todo", label: "To do", count: todoCount },
    { value: "notes", label: "Notes" },
  ];
  const barRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  /** Switch views; when scrolled past the switcher, start the new view at its top. */
  function select(next: View) {
    onChange(next);
    const bar = barRef.current;
    const anchor = anchorRef.current;
    if (!bar || !anchor) return;
    const stuckAt = parseFloat(getComputedStyle(bar).top) || 0;
    const anchorTop = anchor.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > anchorTop - stuckAt) window.scrollTo({ top: anchorTop - stuckAt });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const index = tabs.findIndex((tab) => tab.value === view);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length].value;
    select(next);
    document.getElementById(`${tabsId}-${next}-tab`)?.focus();
  }

  return (
    <>
      <div ref={anchorRef} aria-hidden className="-mb-4 lg:hidden" />
      <div
        ref={barRef}
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 bg-background/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:hidden"
      >
        <div
          role="tablist"
          aria-label="Week sections"
          onKeyDown={onKeyDown}
          className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
        >
          {tabs.map((tab) => {
            const selected = view === tab.value;
            return (
              <button
                key={tab.value}
                id={`${tabsId}-${tab.value}-tab`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${tabsId}-${tab.value}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(tab.value)}
                className={cn(
                  "flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-[background-color,color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected && "bg-card text-foreground shadow-sm dark:bg-white/12",
                )}
              >
                {tab.label}
                {Boolean(tab.count) && (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums",
                      selected ? "bg-primary text-primary-foreground" : "bg-foreground/8",
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Mon–Sun at a glance; tap a day to jump to it, or drop a task on it to plan it for that day. */
function DayStrip({
  dates,
  today,
  tasksByDay,
}: {
  dates: string[];
  today: string;
  tasksByDay: Map<string, TaskDto[]>;
}) {
  return (
    <div className="grid grid-cols-7 gap-1 border-b bg-muted/40 p-2 sm:gap-1.5 sm:p-3">
      {dates.map((date) => {
        const tasks = tasksByDay.get(date) ?? [];
        const isToday = date === today;
        const allDone = tasks.length > 0 && tasks.every((task) => task.status !== "open");
        return (
          <DropZone
            key={date}
            as="button"
            dropId={`strip:${date}`}
            data={{ kind: "strip", date }}
            aria-label={`${formatWeekdayLong(date)}, ${formatMonthDay(date)}${isToday ? ", today" : ""}: ${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
            onClick={() =>
              document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-xl py-2 transition-colors hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              date < today && "opacity-55",
            )}
          >
            <span
              className={cn(
                "text-[11px] font-medium text-muted-foreground",
                isToday && "text-primary",
              )}
            >
              {formatWeekday(date)}
            </span>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums",
                isToday && "bg-primary text-primary-foreground",
              )}
            >
              {dayOfMonth(date)}
            </span>
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                tasks.length === 0 ? "bg-transparent" : allDone ? "bg-success" : "bg-primary/60",
              )}
            />
          </DropZone>
        );
      })}
    </div>
  );
}

function DaySection({
  date,
  today,
  tasks,
  dates,
  actions,
  draggedId,
  dropIndex,
}: {
  date: string;
  today: string;
  tasks: TaskDto[];
  dates: string[];
  actions: WeekActions;
  draggedId: string | null;
  dropIndex: number | null;
}) {
  const [adding, setAdding] = useState(false);
  const isToday = date === today;
  const isPast = date < today;
  const done = tasks.filter((task) => task.status === "done").length;
  const weekday = formatWeekdayLong(date);

  return (
    <DropZone
      id={`day-${date}`}
      dropId={dayListId(date)}
      data={{ kind: "list", list: dayListId(date) }}
      aria-label={`${weekday}, ${formatMonthDay(date)}`}
      className={cn("px-2 py-2 sm:px-3", SCROLL_MARGIN, isToday && "bg-primary/4")}
    >
      <div className="flex items-center gap-2 py-1 pl-2">
        <h3 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span className={cn("text-[15px] font-semibold", isPast && "text-muted-foreground")}>{weekday}</span>
          <span className="text-sm text-muted-foreground">{formatMonthDay(date)}</span>
          {isToday && (
            <span className="self-center rounded-full bg-primary px-2 py-px text-[11px] font-semibold text-primary-foreground">
              Today
            </span>
          )}
        </h3>
        {tasks.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {done}/{tasks.length}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-primary"
          aria-label={`Add a task for ${formatWeekday(date)}`}
          aria-expanded={adding}
          onClick={() => setAdding(true)}
        >
          <Plus />
        </Button>
      </div>
      {tasks.length > 0 && (
        <TaskRows
          list={dayListId(date)}
          tasks={tasks}
          dates={dates}
          today={today}
          actions={actions}
          draggedId={draggedId}
          dropIndex={dropIndex}
        />
      )}
      {adding && (
        <AddTaskForm
          className="px-1 pt-1 pb-1.5"
          autoFocus
          placeholder={`Add for ${weekday}`}
          onAdd={(title) => actions.createTask({ title, assignedDate: date })}
          onClose={() => setAdding(false)}
        />
      )}
    </DropZone>
  );
}

/** The week's to-do list: weekly tasks and anything not planned for a day. Drop a task here to clear its day. */
function WeeklyList({
  tasks,
  dates,
  today,
  actions,
  draggedId,
  dropIndex,
  className,
  ...panel
}: {
  tasks: TaskDto[];
  dates: string[];
  today: string;
  actions: WeekActions;
  draggedId: string | null;
  dropIndex: number | null;
  className?: string;
  id: string;
  role: "tabpanel";
  "aria-labelledby": string;
}) {
  const done = tasks.filter((task) => task.status === "done").length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <DropZone
      {...panel}
      dropId="weekly"
      data={{ kind: "list", list: "weekly" }}
      aria-label="To do this week"
      className={cn("flex flex-col rounded-2xl border bg-card shadow-xs lg:min-h-0", className)}
    >
      <div className="shrink-0 px-4 pt-4 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-tone-sky text-tone-sky-fg">
            <ListTodo className="size-3.5" aria-hidden />
          </span>
          <h2 className="text-sm font-semibold">To do this week</h2>
          {tasks.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {done} of {tasks.length} done
            </span>
          )}
        </div>
        {tasks.length > 0 && (
          <div
            role="progressbar"
            aria-label="Weekly to-do progress"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      {tasks.length > 0 ? (
        <TaskRows
          className="px-2 py-2 sm:px-3 lg:min-h-0 lg:overflow-y-auto"
          list="weekly"
          tasks={tasks}
          dates={dates}
          today={today}
          actions={actions}
          draggedId={draggedId}
          dropIndex={dropIndex}
          showDay
        />
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
          What do you want to get done this week?
        </p>
      )}
      <AddTaskForm
        className="shrink-0 border-t px-3 py-3 sm:px-4"
        placeholder="Add a task"
        onAdd={(title) => actions.createTask({ title, assignedDate: null })}
      />
    </DropZone>
  );
}

/** A list's tasks, with a line where a dragged task would land (`dropIndex` doesn't count the dragged task). */
function TaskRows({
  list,
  tasks,
  draggedId,
  dropIndex,
  className,
  ...itemProps
}: {
  list: ListId;
  tasks: TaskDto[];
  dates: string[];
  today: string;
  actions: WeekActions;
  draggedId: string | null;
  dropIndex: number | null;
  showDay?: boolean;
  className?: string;
}) {
  const rows: ReactNode[] = [];
  let index = 0;
  for (const task of tasks) {
    if (task.id !== draggedId) {
      if (index === dropIndex) rows.push(<DropLine key="drop-line" />);
      index++;
    }
    rows.push(<TaskItem key={task.id} task={task} list={list} {...itemProps} />);
  }
  if (index === dropIndex) rows.push(<DropLine key="drop-line" />);
  return <ul className={className}>{rows}</ul>;
}

/** Marks the drop spot between two rows without moving them. */
function DropLine() {
  return (
    <li aria-hidden className="pointer-events-none relative h-0">
      <span className="absolute inset-x-2 top-0 h-0.5 -translate-y-1/2 rounded-full bg-primary" />
      <span className="absolute top-0 left-1 size-2 -translate-y-1/2 rounded-full border-2 border-primary bg-card" />
    </li>
  );
}

/** The card that follows the pointer while dragging. */
function DragPreview({ task }: { task: TaskDto }) {
  return (
    <div className="flex w-max max-w-72 -rotate-1 cursor-grabbing items-center gap-2 rounded-xl border bg-popover px-3 py-2 text-sm font-medium shadow-xl ring-2 ring-primary/30">
      <GripVertical className="size-3.5 text-primary" aria-hidden />
      <span className="truncate">{task.title}</span>
    </div>
  );
}

