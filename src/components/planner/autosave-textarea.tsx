"use client";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { statusLabel, useAutosave } from "./use-autosave";

/** Grows with its content and saves on blur (and Cmd/Ctrl+Enter). */
export function AutosaveTextarea({
  value,
  onSave,
  placeholder,
  label,
  className,
  maxLength,
}: {
  value: string;
  onSave: (value: string) => Promise<unknown>;
  placeholder?: string;
  label: string;
  className?: string;
  maxLength?: number;
}) {
  const { draft, setDraft, flush, status, dirty } = useAutosave(value, onSave);

  return (
    <div className="relative">
      <Textarea
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        className={cn("resize-none", className)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void flush()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void flush();
        }}
      />
      <span aria-live="polite" className="pointer-events-none absolute right-2 bottom-1.5 text-[11px] text-muted-foreground">
        {statusLabel(status, dirty)}
      </span>
    </div>
  );
}
