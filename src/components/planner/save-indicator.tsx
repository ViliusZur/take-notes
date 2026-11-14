import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabel, type SaveStatus } from "./use-autosave";

/** "Saving…" / "Saved" / "Not saved", announced to screen readers as it changes. */
export function SaveIndicator({ status, dirty, className }: { status: SaveStatus; dirty: boolean; className?: string }) {
  const label = statusLabel(status, dirty);
  const Icon = status === "saving" ? LoaderCircle : status === "error" ? CircleAlert : label ? Check : null;
  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground",
        status === "error" && "text-destructive",
        className,
      )}
    >
      {Icon && <Icon className={cn("size-3.5", status === "saving" && "animate-spin")} aria-hidden />}
      {label}
    </span>
  );
}
