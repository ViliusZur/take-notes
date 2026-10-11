"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Local draft for a server value, saved on demand (`flush`) and optionally after typing pauses.
 * Unsaved text is never replaced by server updates, and leaving the page with unsaved text asks first.
 */
export function useAutosave(
  value: string,
  onSave: (value: string) => Promise<unknown>,
  { debounceMs }: { debounceMs?: number } = {},
) {
  const [draft, setDraftState] = useState(value);
  const [saved, setSaved] = useState(value);
  const [serverValue, setServerValue] = useState(value);
  const [status, setStatus] = useState<SaveStatus>("idle");

  // A server update replaces the draft only when there is nothing unsaved.
  if (value !== serverValue) {
    setServerValue(value);
    setSaved(value);
    if (draft === saved) setDraftState(value);
  }

  // Latest values for the async save path; written after each commit and in event handlers.
  const draftRef = useRef(draft);
  const savedRef = useRef(saved);
  const onSaveRef = useRef(onSave);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retried = useRef(false);

  useLayoutEffect(() => {
    draftRef.current = draft;
    savedRef.current = saved;
    onSaveRef.current = onSave;
  });

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    while (inFlight.current) await inFlight.current;
    const text = draftRef.current;
    if (text === savedRef.current) return;
    setStatus("saving");
    inFlight.current = (async () => {
      try {
        await onSaveRef.current(text);
        retried.current = false;
        savedRef.current = text;
        setSaved(text);
        setStatus(draftRef.current === text ? "saved" : "idle");
      } catch {
        setStatus("error");
        // One automatic retry (e.g. after a version conflict refreshed the cache), then wait for the user.
        if (!retried.current) {
          retried.current = true;
          timer.current = setTimeout(() => void flushRef.current(), 3000);
        }
      } finally {
        inFlight.current = null;
      }
    })();
    await inFlight.current;
  }, []);

  useLayoutEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const setDraft = useCallback(
    (next: string) => {
      draftRef.current = next;
      retried.current = false;
      setDraftState(next);
      setStatus("idle");
      if (debounceMs !== undefined) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flushRef.current(), debounceMs);
      }
    },
    [debounceMs],
  );

  const dirty = draft !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { draft, setDraft, flush, status, dirty };
}

export function statusLabel(status: SaveStatus, dirty: boolean) {
  if (status === "saving") return "Saving…";
  if (status === "error") return "Not saved";
  if (status === "saved" && !dirty) return "Saved";
  return "";
}
