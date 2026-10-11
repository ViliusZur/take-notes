"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Marker } from "./marker";
import { statusLabel, useAutosave } from "./use-autosave";

const NOTES_CLASSES =
  "h-full w-full resize-none rounded-lg border border-input bg-card/55 px-3 py-2 text-[0.925rem] leading-[22px] shadow-xs outline-none [field-sizing:fixed] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The week's notes page. It never grows the layout: the text scrolls inside a fixed area,
 * and a full-screen mode gives room for long notes. Saves while you type.
 */
export function NotesPanel({
  value,
  onSave,
  weekLabel,
  className,
}: {
  value: string;
  onSave: (notes: string) => Promise<unknown>;
  weekLabel: string;
  className?: string;
}) {
  const { draft, setDraft, flush, status, dirty } = useAutosave(value, onSave, { debounceMs: 800 });
  const [fullScreen, setFullScreen] = useState(false);
  const saveState = statusLabel(status, dirty);

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
      className={NOTES_CLASSES}
    />
  );

  return (
    <section className={cn("flex min-h-0 flex-col gap-2", className)} aria-label="Notes">
      <div className="flex items-center justify-between gap-2">
        <h2>
          <Marker tone="lime">Notes</Marker>
        </h2>
        <div className="flex items-center gap-2">
          <span aria-live="polite" className="text-[11px] text-muted-foreground">
            {saveState}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            className="text-primary"
            aria-label="Open notes full screen"
            title="Full screen"
            onClick={() => setFullScreen(true)}
          >
            <Maximize2 />
          </Button>
        </div>
      </div>

      {/* The editor is absolutely positioned so its content can never push the page taller. */}
      <div className="relative min-h-72 flex-1 lg:min-h-28">
        <div className="absolute inset-0">{!fullScreen && editor(false)}</div>
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
          className="paper-grid flex h-[100dvh] w-screen max-w-none flex-col gap-3 rounded-none border-0 bg-card p-4 sm:max-w-none sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle>
                <Marker tone="lime">Notes</Marker>
              </DialogTitle>
              <DialogDescription className="text-xs">{weekLabel}</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <span aria-live="polite" className="text-[11px] text-muted-foreground">
                {saveState}
              </span>
              <Button variant="outline" size="sm" onClick={() => setFullScreen(false)}>
                <Minimize2 aria-hidden /> Exit full screen
              </Button>
            </div>
          </div>
          <div className="mx-auto min-h-0 w-full max-w-4xl flex-1">{fullScreen && editor(true)}</div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
