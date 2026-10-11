"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical, PhoneCall, Plus } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { TaskDto, WeekDto } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import {
  formatDayHeading,
  formatWeekday,
  formatWeekMonths,
  formatWeekRange,
  shiftWeek,
  weekKeyOfDate,
  weekPath,
  type WeekKey,
} from "@/lib/weeks";
import { AddTaskForm } from "./add-task-form";
import { AutosaveTextarea } from "./autosave-textarea";
import { DAY_TONE, Marker } from "./marker";
import { NotesPanel } from "./notes-panel";
import { TaskItem, type TaskDragData } from "./task-item";
import { useWeek, useWeekActions, type WeekActions } from "./use-week";

function byPosition(a: TaskDto, b: TaskDto) {
  return a.position - b.position;
}

/** Drop targets: a day, or the weekly list (no day). */
type DropTarget = { date: string | null };

/** Prefer whatever is under the pointer; fall back to overlap for keyboard dragging. */
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

/** Highlights while a task is dragged over it, and hints while any task is being dragged. */
function DropZone({
  id,
  date,
  className,
  children,
  as: Tag = "section",
  ...rest
}: {
  id: string;
  date: string | null;
  className?: string;
  children: ReactNode;
  as?: "section" | "div";
} & React.AriaAttributes) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { date } satisfies DropTarget });
  const { active } = useDndContext();
  return (
    <Tag
      ref={setNodeRef}
      {...rest}
      className={cn(
        "transition-[background-color,box-shadow,outline-color] duration-150",
        active && "outline-2 -outline-offset-2 outline-primary/25 outline-dashed",
        isOver && "bg-primary/10 outline-primary/70 outline-solid",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * A two-page weekly spread. Left page: month, week number, big picture, and each day's tasks.
 * Right page: the weekly to-do list and the week's notes.
 *
 * On large screens the spread fits the window: long day lists and long to-do lists scroll inside
 * their page, and the notes take the remaining height. Smaller screens stack the pages.
 */
export function WeekPlanner({ initialWeek, today }: { initialWeek: WeekDto; today: string }) {
  const { data: week } = useWeek(initialWeek);
  const key = { isoYear: week.isoYear, isoWeek: week.isoWeek };
  const actions = useWeekActions(key);
  const currentWeek = weekKeyOfDate(today);
  const isCurrentWeek = currentWeek.isoYear === key.isoYear && currentWeek.isoWeek === key.isoWeek;

  // The weekly list is the master to-do list: weekly tasks (even once planned for a day)
  // plus anything without a day. Day sections show what is planned for that day.
  const weeklyTasks = week.tasks.filter((task) => task.kind === "weekly" || task.assignedDate === null).sort(byPosition);
  const doneCount = weeklyTasks.filter((task) => task.status === "done").length;

  // Drag a task onto a day to plan it, or onto the weekly list to clear its day.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const [dragged, setDragged] = useState<TaskDto | null>(null);

  function onDragStart(event: DragStartEvent) {
    setDragged((event.active.data.current as TaskDragData | undefined)?.task ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragged(null);
    const task = (event.active.data.current as TaskDragData | undefined)?.task;
    const target = event.over?.data.current as DropTarget | undefined;
    if (!task || !target || task.assignedDate === target.date) return;
    actions.updateTask(task.id, { assignedDate: target.date });
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragged(null)}
    >
      <div className="flex flex-col gap-3 lg:h-[calc(100dvh-6.5rem-1px)] lg:min-h-[36rem]">
        {week.callImports.map((callImport) => (
          <div
            key={callImport.callId}
            className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl bg-linear-to-r from-hl-violet via-hl-sky to-hl-teal px-4 py-2.5 text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              <PhoneCall className="size-4" aria-hidden />
              Drafted from your planning call
              {callImport.taskCount > 0 && ` · ${callImport.taskCount} item${callImport.taskCount === 1 ? "" : "s"}`}.
              Change anything that isn&apos;t right.
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={actions.undoPending}
              onClick={() => actions.undoCallImport(callImport.callId)}
            >
              Undo call import
            </Button>
          </div>
        ))}

        <div className="grid flex-1 overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(40_40_90/0.18)] lg:min-h-0 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
          {/* Left page */}
          <section
            aria-label="Days"
            className="paper-grid flex flex-col gap-5 p-4 sm:p-6 lg:min-h-0 lg:border-r lg:shadow-[inset_-22px_0_22px_-22px_var(--spine-shadow)]"
          >
            <header className="flex shrink-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-xl leading-tight font-bold tracking-tight text-primary sm:text-3xl">
                  {formatWeekMonths(key)}
                </h1>
                <p className="text-sm text-muted-foreground">{formatWeekRange(key)}</p>
              </div>
              <WeekStepper week={key} currentWeek={currentWeek} isCurrentWeek={isCurrentWeek} />
            </header>

            <section className="shrink-0 space-y-2">
              <h2>
                <Marker tone="coral">Big picture</Marker>
              </h2>
              <AutosaveTextarea
                label="Big picture direction for the week"
                value={week.bigPictureDirection}
                onSave={actions.setDirection}
                placeholder="What matters most this week?"
                className="max-h-36 min-h-16 overflow-y-auto bg-card/80"
                maxLength={2000}
              />
            </section>

            <div className="-mr-2 space-y-1 pr-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {week.dates.map((date) => (
                <DaySection
                  key={date}
                  date={date}
                  isToday={date === today}
                  tasks={week.tasks.filter((task) => task.assignedDate === date).sort(byPosition)}
                  dates={week.dates}
                  actions={actions}
                />
              ))}
            </div>
          </section>

          {/* Right page */}
          <section
            aria-label="Weekly to do and notes"
            className="paper-grid flex flex-col gap-5 border-t p-4 sm:p-6 lg:min-h-0 lg:border-t-0 lg:shadow-[inset_22px_0_22px_-22px_var(--spine-shadow)]"
          >
            <DropZone
              id="weekly"
              date={null}
              aria-label="Weekly to do"
              className="-m-2 flex shrink-0 flex-col gap-2 rounded-xl p-2 lg:max-h-[50%] lg:min-h-0"
            >
              <div className="flex items-center justify-between gap-2">
                <h2>
                  <Marker tone="sky">Weekly to do</Marker>
                </h2>
                {weeklyTasks.length > 0 && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground tabular-nums">
                    {doneCount}/{weeklyTasks.length} done
                  </span>
                )}
              </div>
              {weeklyTasks.length > 0 ? (
                <ol className="-mr-2 space-y-0.5 pr-2 lg:min-h-0 lg:overflow-y-auto">
                  {weeklyTasks.map((task, index) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      dates={week.dates}
                      actions={actions}
                      location="weekly"
                      number={index + 1}
                      showDay
                    />
                  ))}
                </ol>
              ) : (
                <p className="px-1 text-sm text-muted-foreground">What do you want to get done this week?</p>
              )}
              <AddTaskForm
                className="shrink-0"
                placeholder="Add to this week's list"
                onAdd={(title) => actions.createTask({ title, assignedDate: null })}
              />
            </DropZone>

            <NotesPanel
              className="lg:min-h-0 lg:flex-1"
              value={week.notes}
              onSave={actions.setNotes}
              weekLabel={`Week ${key.isoWeek} · ${formatWeekRange(key)}`}
            />
          </section>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{dragged && <DragPreview task={dragged} />}</DragOverlay>
    </DndContext>
  );
}

/** The card that follows the pointer while dragging, so it can cross between the two pages. */
function DragPreview({ task }: { task: TaskDto }) {
  return (
    <div className="flex w-max max-w-72 -rotate-2 cursor-grabbing items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm font-medium shadow-xl ring-2 ring-primary/40">
      <GripVertical className="size-3.5 text-primary" aria-hidden />
      <span className="truncate">{task.title}</span>
    </div>
  );
}

/** `‹ Week 42 ›`, plus a way back to the current week. Compact enough for phones. */
function WeekStepper({
  week,
  currentWeek,
  isCurrentWeek,
}: {
  week: WeekKey;
  currentWeek: WeekKey;
  isCurrentWeek: boolean;
}) {
  return (
    <nav aria-label="Weeks" className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex items-center rounded-full border bg-card p-0.5 shadow-xs">
        <Button asChild variant="ghost" size="icon-sm" className="rounded-full" aria-label="Previous week">
          <Link href={weekPath(shiftWeek(week, -1))}>
            <ChevronLeft />
          </Link>
        </Button>
        <span className="px-1.5 font-display text-lg font-bold whitespace-nowrap tabular-nums sm:text-xl">
          Week {week.isoWeek}
        </span>
        <Button asChild variant="ghost" size="icon-sm" className="rounded-full" aria-label="Next week">
          <Link href={weekPath(shiftWeek(week, 1))}>
            <ChevronRight />
          </Link>
        </Button>
      </div>
      {!isCurrentWeek && (
        <Link
          href={weekPath(currentWeek)}
          className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
        >
          Back to this week
        </Link>
      )}
    </nav>
  );
}

function DaySection({
  date,
  isToday,
  tasks,
  dates,
  actions,
}: {
  date: string;
  isToday: boolean;
  tasks: TaskDto[];
  dates: string[];
  actions: WeekActions;
}) {
  const [adding, setAdding] = useState(false);
  const heading = formatDayHeading(date);

  return (
    <DropZone
      id={`day:${date}`}
      date={date}
      aria-label={heading}
      className={cn("rounded-xl px-2 py-1.5", isToday && "bg-primary/[0.06] ring-1 ring-primary/25")}
    >
      <div className="flex items-center gap-2">
        <h3>
          <Marker tone={DAY_TONE}>{heading}</Marker>
        </h3>
        {isToday && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            Today
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto text-primary/80 hover:text-primary"
          aria-label={`Add a task for ${formatWeekday(date)}`}
          aria-expanded={adding}
          onClick={() => setAdding(true)}
        >
          <Plus />
        </Button>
      </div>
      {tasks.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} dates={dates} actions={actions} location="day" />
          ))}
        </ul>
      )}
      {adding && (
        <AddTaskForm
          className="mt-1.5"
          autoFocus
          placeholder={`Add for ${formatWeekday(date)}`}
          onAdd={(title) => actions.createTask({ title, assignedDate: date })}
          onClose={() => setAdding(false)}
        />
      )}
    </DropZone>
  );
}
