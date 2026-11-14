"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EncryptionGate, useCodec } from "@/components/encryption/encryption-gate";
import { api } from "@/lib/api-client";
import type { WeekSummaryDto } from "@/lib/api-types";
import { decodeWeekSummaries } from "@/lib/content-codec";
import { formatWeekRange, weekPath } from "@/lib/weeks";

export function HistoryView({ initialYear, encrypted }: { initialYear: number; encrypted: boolean }) {
  return (
    <EncryptionGate encrypted={encrypted}>
      <HistoryList initialYear={initialYear} />
    </EncryptionGate>
  );
}

function HistoryList({ initialYear }: { initialYear: number }) {
  const codec = useCodec();
  const [isoYear, setIsoYear] = useState(initialYear);
  const { data: weeks, isPending, isError } = useQuery({
    queryKey: ["weeks", isoYear],
    queryFn: async () => decodeWeekSummaries(codec, await api<WeekSummaryDto[]>(`/api/v1/years/${isoYear}/weeks`)),
  });
  const newestFirst = [...(weeks ?? [])].reverse();

  return (
    <div className="mx-auto max-w-2xl space-y-5 sm:space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Looking back</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">History</h1>
        </div>
        <div className="flex items-center rounded-full border bg-card shadow-xs">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Previous year"
            onClick={() => setIsoYear((y) => y - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="w-12 text-center text-sm font-semibold tabular-nums" aria-live="polite">
            {isoYear}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Next year"
            onClick={() => setIsoYear((y) => y + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </header>

      {isPending && (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading…
        </p>
      )}
      {isError && <p className="text-sm text-destructive">Could not load this year.</p>}
      {weeks && weeks.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CalendarDays className="size-5" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground">No planned weeks in {isoYear}.</p>
        </div>
      )}

      {newestFirst.length > 0 && (
        <ol className="space-y-2.5">
          {newestFirst.map((week) => {
            const key = { isoYear: week.isoYear, isoWeek: week.isoWeek };
            const { done, skipped, open } = week.taskCounts;
            const total = done + skipped + open;
            return (
              <li key={week.isoWeek}>
                <Link
                  href={weekPath(key)}
                  className="group block rounded-2xl border bg-card p-4 shadow-xs transition-[border-color,box-shadow,transform] hover:border-primary/30 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.99] sm:p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 leading-none text-primary">
                      <span className="text-[10px] font-medium opacity-80">Week</span>
                      <span className="text-base font-semibold tabular-nums">{week.isoWeek}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{formatWeekRange(key)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {total === 0 ? "No tasks" : `${done} done · ${skipped} skipped · ${open} open`}
                      </p>
                    </div>
                    <ChevronRight
                      className="size-5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </div>
                  {week.bigPictureDirection && (
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{week.bigPictureDirection}</p>
                  )}
                  {total > 0 && (
                    <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="bg-success" style={{ width: `${(done / total) * 100}%` }} />
                      <span className="bg-tone-orange-fg/60" style={{ width: `${(skipped / total) * 100}%` }} />
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
