import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePageUser } from "@/server/page-auth";
import { currentWeekKey, weekPath } from "@/lib/weeks";
import { LoadingBlock } from "../loading-block";

async function RedirectToCurrentWeek(): Promise<never> {
  const me = await requirePageUser();
  redirect(weekPath(currentWeekKey(me.timezone)));
}

export default function CurrentWeekPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Opening this week…" />}>
      <RedirectToCurrentWeek />
    </Suspense>
  );
}
