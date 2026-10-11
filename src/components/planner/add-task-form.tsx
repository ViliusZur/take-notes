"use client";

import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
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

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
  }

  return (
    <form onSubmit={submit} className={cn("relative", className)}>
      <Plus className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-primary/70" aria-hidden />
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose?.();
        }}
        onBlur={() => {
          if (!title.trim()) onClose?.();
        }}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={200}
        className="h-8 border-dashed bg-card/70 pl-8 text-sm shadow-none"
      />
    </form>
  );
}
