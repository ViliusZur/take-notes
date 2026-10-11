import "server-only";
import { and, eq, isNull, lt, lte, or } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/server/db";
import { planningSchedules, user, type PlanningSchedule } from "@/server/db/schema";
import { features } from "@/server/features";
import { HttpError } from "@/server/http";
import { log } from "@/server/log";
import {
  claimDueRetries,
  failStaleCalls,
  findUnprocessedCalls,
  processCall,
  purgeExpiredTranscripts,
  startCall,
} from "@/server/modules/calls/service";
import type { PlanExtractor } from "@/server/modules/extraction/schema";
import { sendPlanningReminder } from "@/server/modules/notifications/service";
import { nextRunAfter } from "@/lib/schedule";
import { formatWeekKey, plannedWeekForCall } from "@/lib/weeks";

export type CronSummary = {
  schedulesRun: number;
  callsStarted: number;
  remindersSent: number;
  retriesStarted: number;
  callsProcessed: number;
  staleCallsFailed: number;
  transcriptsPurged: number;
};

/**
 * Claims every due schedule in one statement. `last_run_at < next_run_at` makes each
 * occurrence claimable exactly once, so overlapping cron runs cannot double-dial.
 */
async function claimDueSchedules(now: DateTime) {
  return db
    .update(planningSchedules)
    .set({ lastRunAt: now.toJSDate() })
    .where(
      and(
        eq(planningSchedules.enabled, true),
        lte(planningSchedules.nextRunAt, now.toJSDate()),
        or(isNull(planningSchedules.lastRunAt), lt(planningSchedules.lastRunAt, planningSchedules.nextRunAt)),
      ),
    )
    .returning();
}

async function runSchedule(schedule: PlanningSchedule, now: DateTime, summary: CronSummary) {
  await db
    .update(planningSchedules)
    .set({ nextRunAt: nextRunAfter(schedule, now).toJSDate() })
    .where(eq(planningSchedules.id, schedule.id));

  const [owner] = await db.select().from(user).where(eq(user.id, schedule.userId));
  if (!owner) return;
  const targetWeek = plannedWeekForCall(now, schedule.timezone);

  const enabled = features();
  if (schedule.channel === "call" && enabled.calls) {
    try {
      await startCall({ userId: schedule.userId, trigger: "schedule", targetWeek, now });
      summary.callsStarted++;
      return;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      log.warn(`Scheduled call skipped for user '${schedule.userId}': ${error.message}; sending email instead`);
    }
  }

  if (!enabled.email) {
    log.warn(`Planning schedule '${schedule.id}' skipped: neither calls nor email can reach the user`);
    return;
  }
  await sendPlanningReminder(owner, targetWeek, `reminder:${schedule.id}:${formatWeekKey(targetWeek)}`);
  summary.remindersSent++;
}

export async function runPlanningCron(
  now: DateTime = DateTime.utc(),
  options: { extractor?: PlanExtractor } = {},
): Promise<CronSummary> {
  const summary: CronSummary = {
    schedulesRun: 0,
    callsStarted: 0,
    remindersSent: 0,
    retriesStarted: 0,
    callsProcessed: 0,
    staleCallsFailed: 0,
    transcriptsPurged: 0,
  };

  for (const schedule of await claimDueSchedules(now)) {
    summary.schedulesRun++;
    try {
      await runSchedule(schedule, now, summary);
    } catch (error) {
      log.error(`Failed to run planning schedule '${schedule.id}'`, error);
    }
  }

  for (const call of await claimDueRetries(now)) {
    try {
      await startCall({
        userId: call.userId,
        trigger: "retry",
        attempt: call.attempt + 1,
        targetWeek: { isoYear: call.targetIsoYear, isoWeek: call.targetIsoWeek },
        now,
      });
      summary.retriesStarted++;
    } catch (error) {
      log.warn(`Retry for call '${call.id}' skipped`, error);
    }
  }

  for (const { id } of await findUnprocessedCalls(now)) {
    await processCall(id, { extractor: options.extractor, now });
    summary.callsProcessed++;
  }

  summary.staleCallsFailed = await failStaleCalls(now);
  summary.transcriptsPurged = await purgeExpiredTranscripts(now);

  log.debug("Planning cron finished", summary);
  return summary;
}
