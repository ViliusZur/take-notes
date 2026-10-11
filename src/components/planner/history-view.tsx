"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { WeekSummaryDto } from "@/lib/api-types";
import { formatWeekRange, weekPath } from "@/lib/weeks";
import { Marker, toneAt } from "./marker";

export function HistoryView({ initialYear }: { initialYear: number }) {
  const [isoYear, setIsoYear] = useState(initialYear);
  const { data: weeks, isPending, isError } = useQuery({
    queryKey: ["weeks", isoYear],
    queryFn: () => api<WeekSummaryDto[]>(`/api/v1/years/${isoYear}/weeks`),
  });
  const newestFirst = [...(weeks ?? [])].reverse();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tight text-primary">History</h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous year" onClick={() => setIsoYear((y) => y - 1)}>
            <ChevronLeft />
          </Button>
          <span className="w-14 text-center text-sm font-medium tabular-nums">{isoYear}</span>
          <Button variant="outline" size="icon-sm" aria-label="Next year" onClick={() => setIsoYear((y) => y + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </header>

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Could not load this year.</p>}
      {weeks && weeks.length === 0 && <p className="text-sm text-muted-foreground">No planned weeks in {isoYear}.</p>}

      <ol className="space-y-2">
        {newestFirst.map((week) => {
          const key = { isoYear: week.isoYear, isoWeek: week.isoWeek };
          const { done, skipped, open } = week.taskCounts;
          return (
            <li key={week.isoWeek}>
              <Link
                href={weekPath(key)}
                className="paper-grid block rounded-xl border bg-card px-4 py-3 shadow-xs transition hover:-translate-y-px hover:shadow-md"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Marker tone={toneAt(week.isoWeek)} className="text-lg">
                      Week {week.isoWeek}
                    </Marker>
                    <span className="text-sm text-muted-foreground">{formatWeekRange(key)}</span>
                  </span>
                  <span className="flex gap-1.5 text-xs font-medium tabular-nums">
                    <span className="rounded-full bg-hl-green px-2 py-0.5 text-hl-green-fg">{done} done</span>
                    <span className="rounded-full bg-hl-orange px-2 py-0.5 text-hl-orange-fg">{skipped} skipped</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{open} open</span>
                  </span>
                </div>
                {week.bigPictureDirection && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{week.bigPictureDirection}</p>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
