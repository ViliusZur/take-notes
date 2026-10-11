import type { Metadata } from "next";
import { DateTime } from "luxon";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WeekPlanner } from "@/components/planner/week-planner";
import { getWeek } from "@/server/modules/planner/service";
import { requirePageUser } from "@/server/page-auth";
import { formatWeekRange, isValidWeekKey } from "@/lib/weeks";
import { LoadingBlock } from "../../../loading-block";

type Params = PageProps<"/week/[isoYear]/[isoWeek]">["params"];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const key = { isoYear: Number((await params).isoYear), isoWeek: Number((await params).isoWeek) };
  if (!isValidWeekKey(key)) return { title: "Week" };
  return { title: `Week ${key.isoWeek} · ${formatWeekRange(key)}` };
}

async function Planner({ params }: { params: Params }) {
  const me = await requirePageUser();
  const raw = await params;
  const key = { isoYear: Number(raw.isoYear), isoWeek: Number(raw.isoWeek) };
  if (!isValidWeekKey(key)) notFound();
  const week = await getWeek(me.id, key);
  const today = DateTime.now().setZone(me.timezone).toISODate()!;
  return <WeekPlanner initialWeek={week} today={today} />;
}

export default function WeekPage({ params }: PageProps<"/week/[isoYear]/[isoWeek]">) {
  return (
    <Suspense fallback={<LoadingBlock label="Opening your week…" />}>
      <Planner params={params} />
    </Suspense>
  );
}
