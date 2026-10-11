"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, MoreHorizontal, PhoneCall } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TaskDto } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { formatDayLabel, formatWeekday } from "@/lib/weeks";
import { DAY_TONE, toneClasses } from "./marker";
import type { WeekActions } from "./use-week";

/** What a dragged task carries; see `onDragEnd` in the week planner. */
export type TaskDragData = { task: TaskDto };

export function TaskItem({
  task,
  dates,
  actions,
  location,
  number,
  showDay = false,
}: {
  task: TaskDto;
  dates: string[];
  actions: WeekActions;
  /** Where this row is shown; a task can appear on the weekly list and under its day. */
  location: "weekly" | "day";
  /** Position in a numbered list, like a paper to-do list. */
  number?: number;
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

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    setEditing(false);
    if (title && title !== task.title) actions.updateTask(task.id, { title });
  }

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "group flex items-start gap-1.5 rounded-md py-1 pr-1 hover:bg-accent/50",
        pending && "opacity-60",
        isDragging && "opacity-35",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag "${task.title}" to a day`}
        title="Drag to a day"
        className="mt-0.5 -mr-1 flex h-5 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/45 group-hover:text-muted-foreground hover:text-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing disabled:cursor-default"
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>
      {number !== undefined && (
        <span className="w-5 shrink-0 pt-px text-right font-display text-sm font-semibold text-primary/70 tabular-nums">
          {number}.
        </span>
      )}
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={pending}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        onCheckedChange={(checked) => actions.updateTask(task.id, { status: checked ? "done" : "open" })}
      />
      <div className="min-w-0 flex-1">
        {editing ? (
          <form onSubmit={rename}>
            <Input
              name="title"
              defaultValue={task.title}
              autoFocus
              maxLength={200}
              aria-label="Task title"
              className="h-7 text-sm"
              onBlur={(event) => event.currentTarget.form?.requestSubmit()}
              onKeyDown={(event) => event.key === "Escape" && setEditing(false)}
            />
          </form>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setEditing(true)}
            className={cn(
              "w-full text-left text-sm leading-5 break-words",
              done && "text-muted-foreground line-through",
              skipped && "text-muted-foreground",
            )}
          >
            {task.title}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {showDay && task.assignedDate && (
            <span
              className={cn(
                "mt-1 rounded-full px-2 py-px text-[11px] font-semibold",
                toneClasses(DAY_TONE),
              )}
            >
              {formatWeekday(task.assignedDate)}
            </span>
          )}
          {skipped && (
            <Badge variant="outline" className="mt-1 font-normal text-muted-foreground">
              Skipped{task.skippedReason ? `: ${task.skippedReason}` : ""}
            </Badge>
          )}
          {task.callId && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-hl-violet px-2 py-px text-[11px] font-medium text-hl-violet-fg">
              <PhoneCall className="size-3" aria-hidden /> from call
            </span>
          )}
        </div>
      </div>
      {/* Non-modal so the skip dialog can take focus when opened from a menu item. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={pending}
            className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Actions for "${task.title}"`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Plan for</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                disabled={task.assignedDate === null}
                onSelect={() => actions.updateTask(task.id, { assignedDate: null })}
              >
                No specific day
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {dates.map((date) => (
                <DropdownMenuItem
                  key={date}
                  disabled={task.assignedDate === date}
                  onSelect={() => actions.updateTask(task.id, { assignedDate: date })}
                >
                  {formatDayLabel(date)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {task.status === "open" ? (
            <DropdownMenuItem onSelect={() => setSkipOpen(true)}>Skip…</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => actions.updateTask(task.id, { status: "open" })}>Reopen</DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setEditing(true)}>Rename</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => actions.deleteTask(task.id)}>
            Delete
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
