"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, MoreHorizontal, Pencil, PhoneCall, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { TaskDto } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { dayOfMonth, formatWeekday, formatWeekdayLong } from "@/lib/weeks";
import type { WeekActions } from "./use-week";

/** What a dragged task carries; see `onDragEnd` in the week planner. */
export type TaskDragData = { task: TaskDto };

const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium";

export function TaskItem({
  task,
  dates,
  today,
  actions,
  location,
  showDay = false,
}: {
  task: TaskDto;
  dates: string[];
  today: string;
  actions: WeekActions;
  /** Where this row is shown; a task can appear on the weekly list and under its day. */
  location: "weekly" | "day";
  /** Show which day the task is planned for (used on the weekly list). */
  showDay?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const pending = task.id.startsWith("temp-");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `${location}:${task.id}`,
    data: { task } satisfies TaskDragData,
    disabled: pending || editing,
  });
  const done = task.status === "done";
  const skipped = task.status === "skipped";
  const showMeta = (showDay && task.assignedDate) || skipped || task.callId;

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    setEditing(false);
    if (title && title !== task.title) actions.updateTask(task.id, { title });
  }

  function planFor(date: string | null) {
    if (task.assignedDate !== date) actions.updateTask(task.id, { assignedDate: date });
  }

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "group relative flex items-start gap-1 rounded-xl py-1.5 pr-1 pl-1 transition-colors hover:bg-accent/60 pointer-coarse:pl-2.5",
        pending && "opacity-60",
        isDragging && "opacity-35",
      )}
    >
      {/* Drag with a mouse; on touch screens, the menu moves tasks between days. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag "${task.title}" to a day`}
        title="Drag to a day"
        className="mt-2 flex h-5 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/0 group-hover:text-muted-foreground/60 hover:text-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing disabled:cursor-default pointer-coarse:hidden"
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>
      <span className="flex h-9 shrink-0 items-center pr-2 sm:h-8">
        <Checkbox
          className="size-5 rounded-full data-[state=checked]:border-success data-[state=checked]:bg-success sm:size-[18px] sm:rounded-full dark:data-[state=checked]:bg-success"
          checked={done}
          disabled={pending}
          aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          onCheckedChange={(checked) => actions.updateTask(task.id, { status: checked ? "done" : "open" })}
        />
      </span>
      <div className="min-w-0 flex-1 py-1.5 sm:py-1">
        {editing ? (
          <form onSubmit={rename}>
            <input
              name="title"
              defaultValue={task.title}
              autoFocus
              maxLength={200}
              aria-label="Task title"
              enterKeyHint="done"
              className="-my-1 h-8 w-full rounded-md border border-ring bg-card px-2 text-base ring-[3px] ring-ring/25 outline-none sm:h-7 sm:text-sm"
              onBlur={(event) => event.currentTarget.form?.requestSubmit()}
              onKeyDown={(event) => event.key === "Escape" && setEditing(false)}
            />
          </form>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setEditing(true)}
            title="Rename"
            className={cn(
              "block w-full rounded-sm text-left text-[15px] leading-snug break-words focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:text-sm",
              done && "text-muted-foreground line-through decoration-muted-foreground/50",
              skipped && "text-muted-foreground",
            )}
          >
            {task.title}
          </button>
        )}
        {showMeta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {showDay && task.assignedDate && (
              <span className={cn(CHIP, task.assignedDate === today ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}>
                {task.assignedDate === today ? "Today" : formatWeekday(task.assignedDate)}
              </span>
            )}
            {skipped && (
              <span className={cn(CHIP, "bg-tone-orange text-tone-orange-fg")}>
                <SkipForward className="size-3" aria-hidden />
                Skipped{task.skippedReason ? `: ${task.skippedReason}` : ""}
              </span>
            )}
            {task.callId && (
              <span className={cn(CHIP, "bg-tone-violet text-tone-violet-fg")}>
                <PhoneCall className="size-3" aria-hidden /> From call
              </span>
            )}
          </div>
        )}
      </div>
      {/* Non-modal so the skip dialog can take focus when opened from a menu item. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            className="text-muted-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-fine:opacity-0"
            aria-label={`Actions for "${task.title}"`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Plan for</DropdownMenuLabel>
          <div className="grid grid-cols-4 gap-1 pb-1">
            {dates.map((date) => {
              const current = task.assignedDate === date;
              return (
                <DropdownMenuItem
                  key={date}
                  aria-label={`${formatWeekdayLong(date)}${date === today ? ", today" : ""}`}
                  aria-current={current ? "true" : undefined}
                  onSelect={() => planFor(date)}
                  className={cn(
                    "flex-col items-center justify-center gap-0 px-0 py-1.5 sm:py-1",
                    current && "bg-primary text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground",
                  )}
                >
                  <span className={cn("text-[11px] opacity-70", date === today && !current && "font-semibold text-primary opacity-100")}>
                    {formatWeekday(date)}
                  </span>
                  <span className="text-base leading-tight font-semibold tabular-nums">{dayOfMonth(date)}</span>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuItem
              aria-label="No specific day"
              aria-current={task.assignedDate === null ? "true" : undefined}
              onSelect={() => planFor(null)}
              className={cn(
                "flex-col items-center justify-center gap-0 px-0 py-1.5 text-center sm:py-1",
                task.assignedDate === null &&
                  "bg-primary text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground",
              )}
            >
              <span className="text-[11px] opacity-70">Any</span>
              <span className="text-sm leading-tight font-semibold">day</span>
            </DropdownMenuItem>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden /> Rename
          </DropdownMenuItem>
          {task.status === "open" ? (
            <DropdownMenuItem onSelect={() => setSkipOpen(true)}>
              <SkipForward aria-hidden /> Skip…
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => actions.updateTask(task.id, { status: "open" })}>
              <RotateCcw aria-hidden /> Reopen
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => actions.deleteTask(task.id)}>
            <Trash2 aria-hidden /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SkipDialog
        open={skipOpen}
        onOpenChange={setSkipOpen}
        title={task.title}
        onSkip={(reason) => actions.updateTask(task.id, { status: "skipped", skippedReason: reason || null })}
      />
    </li>
  );
}

function SkipDialog({
  open,
  onOpenChange,
  title,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSkip: (reason: string) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSkip(String(new FormData(event.currentTarget).get("reason") ?? "").trim());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Skip “{title}”</DialogTitle>
            <DialogDescription>A short reason helps when you look back at this week.</DialogDescription>
          </DialogHeader>
          <Textarea name="reason" aria-label="Reason" maxLength={500} placeholder="Why are you skipping it?" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Skip task</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
