"use client";

import { Maximize2, Minimize2, NotebookPen } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SaveIndicator } from "./save-indicator";
import { useAutosave } from "./use-autosave";

const EDITOR_CLASSES =
  "h-full w-full resize-none bg-transparent text-base leading-relaxed outline-none [field-sizing:fixed] placeholder:text-muted-foreground sm:text-[15px]";

/**
 * The week's notes page. It never grows the layout: the text scrolls inside a fixed area,
 * and a full-screen mode gives room for long notes. Saves while you type.
 */
export function NotesPanel({
  value,
  onSave,
  weekLabel,
  className,
  ...rest
}: {
  value: string;
  onSave: (notes: string) => Promise<unknown>;
  weekLabel: string;
} & Omit<ComponentProps<"section">, "onChange">) {
  const { draft, setDraft, flush, status, dirty } = useAutosave(value, onSave, { debounceMs: 800 });
  const [fullScreen, setFullScreen] = useState(false);

  const editor = (autoFocus: boolean) => (
    <textarea
      aria-label={`Notes for ${weekLabel}`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void flush()}
      placeholder="Notes, ideas, checklists…"
      maxLength={100_000}
      autoFocus={autoFocus}
      spellCheck
      className={EDITOR_CLASSES}
    />
  );

  return (
    <section
      aria-label="Notes"
      {...rest}
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border bg-card shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 sm:px-5">
        <span className="flex size-6 items-center justify-center rounded-md bg-tone-violet text-tone-violet-fg">
          <NotebookPen className="size-3.5" aria-hidden />
        </span>
        <h2 className="text-sm font-semibold">Notes</h2>
        <SaveIndicator status={status} dirty={dirty} className="ml-auto" />
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-2 text-muted-foreground"
          aria-label="Open notes full screen"
          title="Full screen"
          onClick={() => setFullScreen(true)}
        >
          <Maximize2 />
        </Button>
      </div>

      {/* The editor is absolutely positioned so its content can never push the page taller. */}
      <div className="relative min-h-[max(18rem,calc(100dvh-26rem))] flex-1 lg:min-h-40">
        <div className="absolute inset-0 px-4 pt-2 pb-4 sm:px-5">{!fullScreen && editor(false)}</div>
      </div>

      <Dialog
        open={fullScreen}
        onOpenChange={(open) => {
          if (!open) void flush();
          setFullScreen(open);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="inset-0 flex h-dvh max-h-none w-screen max-w-none flex-col gap-3 rounded-none border-0 bg-card p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:inset-0 sm:top-0 sm:left-0 sm:max-h-none sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-6"
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base">Notes</DialogTitle>
              <DialogDescription className="truncate text-xs">{weekLabel}</DialogDescription>
            </div>
            <div className="flex items-center gap-3">
              <SaveIndicator status={status} dirty={dirty} />
              <Button variant="outline" size="sm" onClick={() => setFullScreen(false)}>
                <Minimize2 aria-hidden /> Done
              </Button>
            </div>
          </div>
          <div className="mx-auto min-h-0 w-full max-w-3xl flex-1">{fullScreen && editor(true)}</div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
