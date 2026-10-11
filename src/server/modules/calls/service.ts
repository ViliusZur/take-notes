import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/server/db";
import { calls, user, type Call, type CallImportResult, type CallStatus } from "@/server/db/schema";
import { env } from "@/server/env";
import { requireFeature } from "@/server/features";
import { HttpError, notFound } from "@/server/http";
import { log } from "@/server/log";
import * as plannerRepo from "@/server/modules/planner/repository";
import { findSchedule, revokeCallConsent } from "@/server/modules/schedules/service";
import { sendCallMissed, sendPlanningReminder, sendPlanReady } from "@/server/modules/notifications/service";
import { claudeExtractor } from "@/server/modules/extraction/claude";
import type { ExtractedPlan, ExtractionInput, PlanExtractor } from "@/server/modules/extraction/schema";
import { SimulatedVoiceProvider, voiceProvider, type VoiceEvent } from "@/server/modules/voice";
import type { CallDetailDto, CallDto } from "@/lib/api-types";
import {
  currentWeekKey,
  formatWeekKey,
  formatWeekRange,
  plannedWeekForCall,
  WEEKDAYS,
  weekDates,
  type WeekKey,
} from "@/lib/weeks";
import { applyPlan, undoPlan } from "./apply-plan";
import { firstMessage, MAX_CALL_SECONDS, systemPrompt } from "./conversation";

const ACTIVE_STATUSES: CallStatus[] = ["queued", "ringing", "in_progress"];
const TRANSCRIPT_RETENTION_DAYS = 30;
const RETRY_DELAY_MINUTES = 15;
const MAX_PROCESSING_ATTEMPTS = 3;
const PROCESSING_LEASE_MINUTES = 5;
/** A call with no result after this long is treated as failed. */
const STALE_CALL_MINUTES = 30;

type Trigger = Call["trigger"];

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

function toCallDto(call: Call): CallDto {
  return {
    id: call.id,
    status: call.status,
    trigger: call.trigger,
    attempt: call.attempt,
    targetIsoYear: call.targetIsoYear,
    targetIsoWeek: call.targetIsoWeek,
    createdAt: call.createdAt.toISOString(),
    startedAt: call.startedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSeconds: call.durationSeconds,
    summary: call.summary,
    error: call.error,
    importedTaskCount: call.importResult?.taskIds.length ?? 0,
    canUndoImport: Boolean(
      call.importResult &&
        !call.importResult.undoneAt &&
        (call.importResult.taskIds.length > 0 || call.importResult.notesAppended || call.importResult.direction?.set),
    ),
  };
}

export async function listCalls(userId: string): Promise<CallDto[]> {
  const rows = await db.select().from(calls).where(eq(calls.userId, userId)).orderBy(desc(calls.createdAt)).limit(20);
  return rows.map(toCallDto);
}

async function findOwnedCall(userId: string, callId: string) {
  if (!isUuid(callId)) throw notFound("Call");
  const [call] = await db.select().from(calls).where(and(eq(calls.id, callId), eq(calls.userId, userId)));
  if (!call) throw notFound("Call");
  return call;
}

export async function getCall(userId: string, callId: string): Promise<CallDetailDto> {
  const call = await findOwnedCall(userId, callId);
  return { ...toCallDto(call), transcript: call.transcript };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function targetOf(call: Call): WeekKey {
  return { isoYear: call.targetIsoYear, isoWeek: call.targetIsoWeek };
}

// ---------------------------------------------------------------------------
// Context shared by the live call and the extraction
// ---------------------------------------------------------------------------

async function loadOwner(userId: string) {
  const [owner] = await db.select().from(user).where(eq(user.id, userId));
  if (!owner) throw notFound("User");
  return owner;
}

function firstNameOf(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

/** This week's direction and unfinished tasks: the only planner content sent to the voice provider. */
async function currentWeekContext(userId: string, timezone: string, at: DateTime) {
  const week = await plannerRepo.findWeek(db, userId, currentWeekKey(timezone, at));
  if (!week) return { direction: "", unfinished: [] };
  const rows = await plannerRepo.listTasks(db, week.id);
  return {
    direction: week.bigPictureDirection,
    unfinished: rows
      .filter((task) => task.status !== "done")
      .slice(0, 15)
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status as "open" | "skipped",
        skippedReason: task.skippedReason,
      })),
  };
}

// ---------------------------------------------------------------------------
// Starting calls
// ---------------------------------------------------------------------------

function provider() {
  const voice = voiceProvider();
  if (voice instanceof SimulatedVoiceProvider) {
    voice.setEventSink(async (event) => {
      const { callId, process } = await handleVoiceEvent(event);
      if (process && callId) await processCall(callId);
    });
  }
  return voice;
}

async function connectedCallsThisMonth(userId: string, now: DateTime) {
  const [row] = await db
    .select({ value: count() })
    .from(calls)
    .where(
      and(
        eq(calls.userId, userId),
        gte(calls.createdAt, now.startOf("month").toJSDate()),
        notInArray(calls.status, ["no_answer", "failed"]),
      ),
    );
  return row?.value ?? 0;
}

async function hasActiveCall(userId: string, now: DateTime) {
  const [row] = await db
    .select({ value: count() })
    .from(calls)
    .where(
      and(
        eq(calls.userId, userId),
        inArray(calls.status, ACTIVE_STATUSES),
        gte(calls.createdAt, now.minus({ minutes: STALE_CALL_MINUTES }).toJSDate()),
      ),
    );
  return (row?.value ?? 0) > 0;
}

/**
 * Places an outbound planning call. Throws `HttpError` when the user cannot be called
 * (no verified phone, no consent, monthly cap, a call already in progress).
 * Provider failures are recorded on the returned call instead of thrown.
 */
export async function startCall(args: {
  userId: string;
  trigger: Trigger;
  targetWeek: WeekKey;
  attempt?: number;
  now?: DateTime;
}): Promise<Call> {
  const now = args.now ?? DateTime.utc();
  requireFeature("calls");
  const owner = await loadOwner(args.userId);
  if (!owner.phoneE164 || !owner.phoneVerifiedAt) throw new HttpError(422, "Verify a phone number first");
  const schedule = await findSchedule(args.userId);
  if (!schedule?.callConsentAt) throw new HttpError(422, "Turn on planning calls and give consent first");
  if ((await connectedCallsThisMonth(args.userId, now)) >= env().CALL_MONTHLY_CAP) {
    throw new HttpError(429, "Monthly call limit reached");
  }
  if (await hasActiveCall(args.userId, now)) throw new HttpError(409, "A call is already in progress");

  const voice = provider();
  const [call] = await db
    .insert(calls)
    .values({
      userId: args.userId,
      targetIsoYear: args.targetWeek.isoYear,
      targetIsoWeek: args.targetWeek.isoWeek,
      provider: voice.name,
      trigger: args.trigger,
      attempt: args.attempt ?? 1,
      createdAt: now.toJSDate(),
    })
    .returning();

  const context = await currentWeekContext(args.userId, owner.timezone, now);
  const firstName = firstNameOf(owner.name);
  log.debug(`Starting ${args.trigger} call '${call.id}' for user '${args.userId}'`, {
    targetWeek: formatWeekKey(args.targetWeek),
    attempt: call.attempt,
  });

  try {
    const { providerCallId } = await voice.startCall({
      callId: call.id,
      userId: args.userId,
      toNumber: owner.phoneE164,
      customerName: owner.name,
      firstMessage: firstMessage(firstName),
      systemPrompt: systemPrompt({
        firstName,
        targetWeekLabel: formatWeekRange(args.targetWeek),
        currentWeekDirection: context.direction,
        unfinishedTasks: context.unfinished,
      }),
      maxDurationSeconds: MAX_CALL_SECONDS,
    });
    const [updated] = await db.update(calls).set({ providerCallId }).where(eq(calls.id, call.id)).returning();
    return updated;
  } catch (error) {
    log.error(`Failed to start call '${call.id}'`, error);
    const [failed] = await db
      .update(calls)
      .set({ status: "failed", error: "The call could not be placed", endedAt: now.toJSDate() })
      .where(eq(calls.id, call.id))
      .returning();
    return failed;
  }
}

/** "Call me now" from settings: plans the week after today. */
export async function requestTestCall(userId: string, now: DateTime = DateTime.utc()): Promise<CallDto> {
  const owner = await loadOwner(userId);
  const call = await startCall({
    userId,
    trigger: "manual",
    targetWeek: plannedWeekForCall(now, owner.timezone),
    now,
  });
  return toCallDto(call);
}

// ---------------------------------------------------------------------------
// Provider events
// ---------------------------------------------------------------------------

async function findCallForEvent(event: VoiceEvent) {
  if (event.callId && isUuid(event.callId)) {
    const [call] = await db.select().from(calls).where(eq(calls.id, event.callId));
    if (call) return call;
  }
  const [call] = await db.select().from(calls).where(eq(calls.providerCallId, event.providerCallId));
  return call;
}

/**
 * Applies a provider event. Idempotent: replays and out-of-order events are ignored.
 * Returns whether the call now needs extraction (`processCall`).
 */
export async function handleVoiceEvent(
  event: VoiceEvent,
  now: DateTime = DateTime.utc(),
): Promise<{ callId: string | null; process: boolean }> {
  const call = await findCallForEvent(event);
  if (!call) {
    log.warn(`Voice event for unknown call '${event.providerCallId}'`);
    return { callId: null, process: false };
  }

  if (event.kind === "status") {
    const from: CallStatus[] = event.status === "ringing" ? ["queued"] : ["queued", "ringing"];
    await db
      .update(calls)
      .set({
        status: event.status,
        providerCallId: call.providerCallId ?? event.providerCallId,
        ...(event.status === "in_progress" ? { startedAt: now.toJSDate() } : {}),
      })
      .where(and(eq(calls.id, call.id), inArray(calls.status, from)));
    return { callId: call.id, process: false };
  }

  const startedAt = event.startedAt ?? call.startedAt ?? undefined;
  const endedAt = event.endedAt ?? now.toJSDate();
  const transcript = event.transcript.trim() || null;
  const [ended] = await db
    .update(calls)
    .set({
      status: event.outcome === "completed" ? "ended" : event.outcome,
      providerCallId: call.providerCallId ?? event.providerCallId,
      endedReason: event.endedReason,
      transcript,
      transcriptExpiresAt: transcript ? now.plus({ days: TRANSCRIPT_RETENTION_DAYS }).toJSDate() : null,
      startedAt,
      endedAt,
      durationSeconds: startedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)) : null,
      costCents: event.costCents,
    })
    .where(and(eq(calls.id, call.id), inArray(calls.status, ACTIVE_STATUSES)))
    .returning();

  if (!ended) {
    log.debug(`Ignoring repeated end event for call '${call.id}'`);
    return { callId: call.id, process: false };
  }
  log.debug(`Call '${call.id}' ended`, { outcome: event.outcome, endedReason: event.endedReason });

  if (event.outcome === "completed") return { callId: call.id, process: true };
  await handleUnansweredCall(ended, now);
  return { callId: call.id, process: false };
}

/** First scheduled attempt gets one retry; after that the user gets an email instead. */
async function handleUnansweredCall(call: Call, now: DateTime) {
  if (call.trigger === "manual") return;
  if (call.attempt === 1) {
    await db
      .update(calls)
      .set({ nextAttemptAt: now.plus({ minutes: RETRY_DELAY_MINUTES }).toJSDate() })
      .where(eq(calls.id, call.id));
    return;
  }
  await sendFallbackEmail(call, "missed");
}

async function sendFallbackEmail(call: Call, kind: "missed" | "reminder") {
  const schedule = await findSchedule(call.userId);
  if (!schedule?.emailFallback || call.trigger === "manual") return;
  const owner = await loadOwner(call.userId);
  try {
    if (kind === "missed") await sendCallMissed(owner, targetOf(call), `call-missed:${call.id}`);
    else await sendPlanningReminder(owner, targetOf(call), `call-reminder:${call.id}`);
  } catch (error) {
    log.error(`Failed to send fallback email for call '${call.id}'`, error);
  }
}

// ---------------------------------------------------------------------------
// Extraction and applying the plan
// ---------------------------------------------------------------------------

const EMPTY_IMPORT: CallImportResult = { taskIds: [], direction: null, notesAppended: null };

function callerSpoke(transcript: string | null) {
  return Boolean(transcript && /^(user|customer)\s*:/im.test(transcript));
}

async function claimForProcessing(callId: string, now: DateTime) {
  const [claimed] = await db
    .update(calls)
    .set({
      processingLeaseUntil: now.plus({ minutes: PROCESSING_LEASE_MINUTES }).toJSDate(),
      processingAttempts: sql`${calls.processingAttempts} + 1`,
    })
    .where(
      and(
        eq(calls.id, callId),
        eq(calls.status, "ended"),
        isNull(calls.processedAt),
        or(isNull(calls.processingLeaseUntil), lt(calls.processingLeaseUntil, now.toJSDate())),
      ),
    )
    .returning();
  return claimed;
}

/**
 * Extracts the plan from a finished call and writes it into the target week.
 * Safe to call repeatedly: a lease and `processed_at` make it run at most once.
 */
export async function processCall(
  callId: string,
  options: { extractor?: PlanExtractor; now?: DateTime } = {},
): Promise<void> {
  const now = options.now ?? DateTime.utc();
  const extractor = options.extractor ?? claudeExtractor;
  const call = await claimForProcessing(callId, now);
  if (!call) return;

  try {
    const owner = await loadOwner(call.userId);
    const target = targetOf(call);
    const callTime = DateTime.fromJSDate(call.startedAt ?? call.createdAt);
    const context = await currentWeekContext(call.userId, owner.timezone, callTime);
    const targetWeek = await plannerRepo.findWeek(db, call.userId, target);
    const existingTitles = targetWeek ? (await plannerRepo.listTasks(db, targetWeek.id)).map((t) => t.title) : [];

    let plan: ExtractedPlan;
    if (callerSpoke(call.transcript)) {
      const input: ExtractionInput = {
        transcript: call.transcript ?? "",
        callerFirstName: firstNameOf(owner.name),
        targetWeek: {
          label: formatWeekRange(target),
          days: weekDates(target).map((date, index) => ({ weekday: WEEKDAYS[index], date })),
        },
        currentWeekDirection: context.direction,
        unfinishedTasks: context.unfinished,
        existingTargetWeekTaskTitles: existingTitles,
      };
      plan = await extractor(input);
    } else {
      plan = {
        planCaptured: false,
        userAskedToStopCalls: false,
        bigPictureDirection: null,
        tasks: [],
        dayItems: [],
        weekNotes: null,
        callSummary: "The call ended before any plan was shared.",
      };
    }

    if (plan.userAskedToStopCalls) await revokeCallConsent(call.userId);

    const importResult = await db.transaction(async (tx) => {
      const result = plan.planCaptured
        ? await applyPlan(tx, {
            userId: call.userId,
            callId: call.id,
            week: target,
            plan,
            carryOverCandidateIds: context.unfinished.map((task) => task.id),
          })
        : EMPTY_IMPORT;
      await tx
        .update(calls)
        .set({
          status: "processed",
          processedAt: now.toJSDate(),
          processingLeaseUntil: null,
          extractedPlan: plan,
          importResult: result,
          summary: plan.callSummary,
          error: null,
        })
        .where(eq(calls.id, call.id));
      return result;
    });

    log.debug(`Processed call '${call.id}'`, {
      tasks: importResult.taskIds.length,
      notesAppended: importResult.notesAppended !== null,
      directionSet: importResult.direction?.set ?? false,
    });

    const imported = importResult.taskIds.length > 0 || importResult.notesAppended || importResult.direction;
    if (imported) {
      try {
        await sendPlanReady(owner, target, `plan-ready:${call.id}`);
      } catch (error) {
        log.error(`Failed to send plan-ready email for call '${call.id}'`, error);
      }
    } else {
      await sendFallbackEmail(call, "reminder");
    }

    await deleteProviderCopy(call);
  } catch (error) {
    log.error(`Failed to process call '${call.id}'`, error);
    const exhausted = call.processingAttempts >= MAX_PROCESSING_ATTEMPTS;
    await db
      .update(calls)
      .set({
        processingLeaseUntil: null,
        status: exhausted ? "failed" : "ended",
        error: exhausted
          ? "We could not turn this call into a plan"
          : "Writing your plan hit a problem; retrying in a few minutes",
      })
      .where(eq(calls.id, call.id));
    if (exhausted) await sendFallbackEmail(call, "missed");
  }
}

async function deleteProviderCopy(call: Call) {
  try {
    const voice = provider();
    if (!call.providerCallId || call.provider !== voice.name) return;
    await voice.deleteCallData(call.providerCallId);
  } catch (error) {
    log.warn(`Could not delete provider copy of call '${call.id}'`, error);
  }
}

export async function undoImport(userId: string, callId: string): Promise<CallDto> {
  const call = await findOwnedCall(userId, callId);
  if (call.status !== "processed" || !call.importResult) throw new HttpError(409, "This call has nothing to undo");
  if (call.importResult.undoneAt) throw new HttpError(409, "This call was already undone");
  const result = call.importResult;
  await db.transaction((tx) => undoPlan(tx, userId, call.id, result, targetOf(call)));
  return toCallDto(await findOwnedCall(userId, callId));
}

// ---------------------------------------------------------------------------
// Maintenance used by the cron run
// ---------------------------------------------------------------------------

/** Claims calls whose retry is due; each is returned once. */
export async function claimDueRetries(now: DateTime) {
  return db
    .update(calls)
    .set({ nextAttemptAt: null })
    .where(lt(calls.nextAttemptAt, now.plus({ seconds: 1 }).toJSDate()))
    .returning();
}

export async function findUnprocessedCalls(now: DateTime) {
  return db
    .select({ id: calls.id })
    .from(calls)
    .where(
      and(
        eq(calls.status, "ended"),
        isNull(calls.processedAt),
        lt(calls.endedAt, now.minus({ minutes: 1 }).toJSDate()),
        or(isNull(calls.processingLeaseUntil), lt(calls.processingLeaseUntil, now.toJSDate())),
      ),
    )
    .limit(20);
}

export async function failStaleCalls(now: DateTime) {
  const stale = await db
    .update(calls)
    .set({ status: "failed", error: "No call result was received", endedAt: now.toJSDate() })
    .where(
      and(
        inArray(calls.status, ACTIVE_STATUSES),
        lt(calls.createdAt, now.minus({ minutes: STALE_CALL_MINUTES }).toJSDate()),
      ),
    )
    .returning();
  for (const call of stale) {
    log.warn(`Call '${call.id}' timed out without a result`);
    await handleUnansweredCall(call, now);
  }
  return stale.length;
}

export async function purgeExpiredTranscripts(now: DateTime) {
  const purged = await db
    .update(calls)
    .set({ transcript: null, transcriptExpiresAt: null })
    .where(lt(calls.transcriptExpiresAt, now.toJSDate()))
    .returning({ id: calls.id });
  return purged.length;
}
