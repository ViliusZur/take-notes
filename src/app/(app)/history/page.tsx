import type { Metadata } from "next";
import { Suspense } from "react";
import { HistoryView } from "@/components/planner/history-view";
import { requirePageUser } from "@/server/page-auth";
import { currentWeekKey } from "@/lib/weeks";
import { LoadingBlock } from "../loading-block";

export const metadata: Metadata = { title: "History" };

async function History() {
  const me = await requirePageUser();
  return <HistoryView initialYear={currentWeekKey(me.timezone).isoYear} />;
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading history…" />}>
      <History />
    </Suspense>
  );
}
