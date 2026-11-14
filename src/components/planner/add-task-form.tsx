"use client";

import { ArrowUp, Plus } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

export function AddTaskForm({
  placeholder,
  onAdd,
  onClose,
  autoFocus = false,
  className,
}: {
  placeholder: string;
  onAdd: (title: string) => void;
  /** Called on Escape, or when the empty field loses focus. */
  onClose?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const canAdd = title.trim().length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
    // Keep the keyboard up so several tasks can be added in a row.
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={submit} className={className}>
      <div className="relative">
        <Plus
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose?.();
          }}
          onBlur={(event) => {
            // Tapping the add button moves focus to it; that isn't leaving the form.
            if (event.currentTarget.form?.contains(event.relatedTarget as Node | null)) return;
            if (!title.trim()) onClose?.();
          }}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={200}
          enterKeyHint="done"
          className="h-11 w-full rounded-xl border border-transparent bg-muted/70 pr-12 pl-9 text-base outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground hover:bg-muted focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/25 sm:h-10 sm:text-sm"
        />
        <button
          type="submit"
          aria-label="Add task"
          tabIndex={canAdd ? 0 : -1}
          className={cn(
            "absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs transition-[opacity,transform] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:size-7",
            canAdd ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0",
          )}
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
