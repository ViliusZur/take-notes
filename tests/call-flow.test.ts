import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { calls, user } from "@/server/db/schema";
import { handleVoiceEvent, processCall, undoImport } from "@/server/modules/calls/service";
import { runPlanningCron } from "@/server/modules/cron/service";
import type { ExtractedPlan, ExtractionInput } from "@/server/modules/extraction/schema";
import { setMailerForTests, type Email } from "@/server/modules/notifications/service";
import { createTask, getWeek, setDirection, setNotes, updateTask } from "@/server/modules/planner/service";
import { findSchedule, putSchedule } from "@/server/modules/schedules/service";
import { setVoiceProviderForTests, type StartCallInput, type VoiceProvider } from "@/server/modules/voice";
import { createUser } from "./helpers";

class FakeVoice implements VoiceProvider {
  readonly name = "fake";
  started: StartCallInput[] = [];
  deleted: string[] = [];

  async startCall(input: StartCallInput) {
    this.started.push(input);
    return { providerCallId: `fake-${input.callId}` };
  }

  async parseWebhook() {
    return [];
  }

  async deleteCallData(providerCallId: string) {
    this.deleted.push(providerCallId);
  }
}

const sent: Email[] = [];
let voice: FakeVoice;

beforeEach(() => {
  voice = new FakeVoice();
  setVoiceProviderForTests(voice);
  sent.length = 0;
  setMailerForTests({ send: async (email) => void sent.push(email) });
});

afterEach(() => {
  setVoiceProviderForTests(undefined);
  setMailerForTests(undefined);
});

// Thursday Oct 8 2026, so the first Sunday 18:00 Vilnius run is Oct 11 15:00 UTC.
const setupTime = DateTime.fromISO("2026-10-08T09:00:00Z");
const sundayRun = DateTime.fromISO("2026-10-11T15:00:30Z");
const thisWeek = { isoYear: 2026, isoWeek: 41 };
const nextWeek = { isoYear: 2026, isoWeek: 42 };

async function callableUser() {
  const owner = await createUser({ phoneE164: "+37061234567", phoneVerifiedAt: new Date() });
  await putSchedule(
    owner.id,
    {
      enabled: true,
      channel: "call",
      dayOfWeek: 7,
      localTime: "18:00",
      timezone: "Europe/Vilnius",
      emailFallback: true,
      callConsent: true,
    },
    setupTime,
  );
  return owner;
}

function planFrom(input: ExtractionInput): ExtractedPlan {
  const carried = input.unfinishedTasks.find((task) => task.title === "Write investor update");
  return {
    planCaptured: true,
    userAskedToStopCalls: false,
    bigPictureDirection: "Ship onboarding and sleep more",
    tasks: [
      { title: "Finish signup screens", day: "monday", carriedOverFromTaskId: null },
      { title: "Write investor update", day: null, carriedOverFromTaskId: carried?.id ?? null },
      { title: "Review pricing page with Anna", day: "tuesday", carriedOverFromTaskId: null },
    ],
    dayItems: [{ day: "thursday", text: "Dentist at 16:00" }],
    weekNotes: "Try the shorter standup format",
    callSummary: "Planned the onboarding launch week.",
  };
}

async function callsFor(userId: string) {
  return db.select().from(calls).where(eq(calls.userId, userId));
}

describe("Sunday planning call", () => {
  it("calls on schedule, extracts the plan, writes next week, and can be undone", async () => {
    const owner = await callableUser();
    const unfinished = await createTask(owner.id, thisWeek, { title: "Write investor update" });
    await setDirection(owner.id, thisWeek, "Prepare launch", 0);
    await setNotes(owner.id, thisWeek, "This week's notes stay untouched", 0);

    // Cron claims the due schedule once, even when runs overlap.
    const first = await runPlanningCron(sundayRun);
    const second = await runPlanningCron(sundayRun);
    expect(first).toMatchObject({ schedulesRun: 1, callsStarted: 1 });
    expect(second.schedulesRun).toBe(0);
    expect(voice.started).toHaveLength(1);
    expect(voice.started[0].systemPrompt).toContain("Write investor update");
    expect(voice.started[0].systemPrompt).toContain("Prepare launch");
    expect(voice.started[0].firstMessage).toContain("AI planning assistant");

    const schedule = await findSchedule(owner.id);
    expect(schedule?.nextRunAt?.toISOString()).toBe("2026-10-18T15:00:00.000Z");

    const [call] = await callsFor(owner.id);
    expect(call).toMatchObject({ status: "queued", targetIsoYear: 2026, targetIsoWeek: 42, trigger: "schedule" });

    await handleVoiceEvent({ kind: "status", providerCallId: `fake-${call.id}`, status: "in_progress" }, sundayRun);
    const ended = {
      kind: "ended" as const,
      providerCallId: `fake-${call.id}`,
      callId: call.id,
      outcome: "completed" as const,
      endedReason: "customer-ended-call",
      transcript: "AI: Hi Jane\nUser: Next week I ship onboarding.",
      costCents: 42,
    };
    const later = sundayRun.plus({ minutes: 4 });
    expect(await handleVoiceEvent(ended, later)).toEqual({ callId: call.id, process: true });
    // A replayed webhook is ignored.
    expect(await handleVoiceEvent(ended, later)).toEqual({ callId: call.id, process: false });

    let extractions = 0;
    const extractor = async (input: ExtractionInput) => {
      extractions++;
      expect(input.targetWeek.days[0]).toEqual({ weekday: "monday", date: "2026-10-12" });
      return planFrom(input);
    };
    await processCall(call.id, { extractor, now: later });
    await processCall(call.id, { extractor, now: later });
    expect(extractions).toBe(1);

    const planned = await getWeek(owner.id, nextWeek);
    expect(planned.bigPictureDirection).toBe("Ship onboarding and sleep more");
    expect(planned.tasks.map((task) => [task.title, task.kind, task.assignedDate])).toEqual([
      ["Finish signup screens", "weekly", "2026-10-12"],
      ["Write investor update", "weekly", null],
      ["Review pricing page with Anna", "weekly", "2026-10-13"],
      ["Dentist at 16:00", "ad_hoc", "2026-10-15"],
    ]);
    expect(planned.tasks[1].carriedOverFromTaskId).toBe(unfinished.id);
    expect(planned.tasks.every((task) => task.callId === call.id)).toBe(true);
    expect(planned.notes).toBe("From your planning call:\nTry the shorter standup format");
    expect((await getWeek(owner.id, thisWeek)).notes).toBe("This week's notes stay untouched");
    expect(planned.callImports).toEqual([expect.objectContaining({ callId: call.id, taskCount: 4 })]);

    const [processed] = await callsFor(owner.id);
    expect(processed).toMatchObject({ status: "processed", summary: "Planned the onboarding launch week.", costCents: 42 });
    expect(processed.transcriptExpiresAt?.toISOString()).toBe(later.plus({ days: 30 }).toJSDate().toISOString());
    expect(voice.deleted).toEqual([`fake-${call.id}`]);

    expect(sent.map((email) => email.subject)).toEqual(["Your plan for 2026-W42 is ready"]);
    expect(sent[0].text).not.toContain("onboarding");
    expect(sent[0].text).toContain("/week/2026/42");

    // The user edits one imported task, then undoes the whole import.
    await updateTask(owner.id, planned.tasks[0].id, { status: "done" }, undefined);
    await undoImport(owner.id, call.id);
    const undone = await getWeek(owner.id, nextWeek);
    expect(undone.tasks).toEqual([]);
    expect(undone.bigPictureDirection).toBe("");
    expect(undone.notes).toBe("");
    expect(undone.callImports).toEqual([]);
    await expect(undoImport(owner.id, call.id)).rejects.toMatchObject({ status: 409 });
  });

  it("never overwrites what the user already planned", async () => {
    const owner = await callableUser();
    await setDirection(owner.id, nextWeek, "My own direction", 0);
    await createTask(owner.id, nextWeek, { title: "Finish signup screens" });
    await setNotes(owner.id, nextWeek, "Bring X-rays", 0);

    await runPlanningCron(sundayRun);
    const [call] = await callsFor(owner.id);
    await handleVoiceEvent({
      kind: "ended",
      providerCallId: `fake-${call.id}`,
      outcome: "completed",
      endedReason: "customer-ended-call",
      transcript: "User: plan",
    });
    await processCall(call.id, { extractor: async (input) => planFrom(input) });

    const planned = await getWeek(owner.id, nextWeek);
    expect(planned.bigPictureDirection).toBe("My own direction");
    expect(planned.tasks.map((task) => task.title)).toEqual([
      "Finish signup screens",
      "Write investor update",
      "Review pricing page with Anna",
      "Dentist at 16:00",
    ]);
    expect(planned.tasks[0].callId).toBeNull();
    expect(planned.notes).toBe(
      "Bring X-rays\n\nFrom your planning call:\n" +
        "Direction from your call: Ship onboarding and sleep more\nTry the shorter standup format",
    );

    await undoImport(owner.id, call.id);
    const undone = await getWeek(owner.id, nextWeek);
    expect(undone.bigPictureDirection).toBe("My own direction");
    expect(undone.tasks.map((task) => task.title)).toEqual(["Finish signup screens"]);
    expect(undone.notes).toBe("Bring X-rays");
  });

  it("retries an unanswered call once, then emails", async () => {
    const owner = await callableUser();
    await runPlanningCron(sundayRun);
    const [first] = await callsFor(owner.id);
    await handleVoiceEvent(
      { kind: "ended", providerCallId: `fake-${first.id}`, outcome: "no_answer", endedReason: "voicemail", transcript: "" },
      sundayRun,
    );

    expect((await runPlanningCron(sundayRun.plus({ minutes: 10 }))).retriesStarted).toBe(0);
    expect((await runPlanningCron(sundayRun.plus({ minutes: 16 }))).retriesStarted).toBe(1);

    const retry = (await callsFor(owner.id)).find((call) => call.attempt === 2);
    expect(retry).toMatchObject({ trigger: "retry", status: "queued" });
    await handleVoiceEvent(
      {
        kind: "ended",
        providerCallId: `fake-${retry!.id}`,
        outcome: "no_answer",
        endedReason: "customer-did-not-answer",
        transcript: "",
      },
      sundayRun.plus({ minutes: 17 }),
    );

    expect(sent.map((email) => email.subject)).toEqual(["We missed you — plan 2026-W42 in the app"]);
    expect((await runPlanningCron(sundayRun.plus({ hours: 1 }))).retriesStarted).toBe(0);
  });

  it("falls back to an email reminder when the user cannot be called", async () => {
    const owner = await callableUser();
    // Phone removed after consent: the scheduled run sends an email instead of calling.
    await db.update(user).set({ phoneVerifiedAt: null }).where(eq(user.id, owner.id));

    const summary = await runPlanningCron(sundayRun);
    expect(summary).toMatchObject({ callsStarted: 0, remindersSent: 1 });
    expect(voice.started).toHaveLength(0);
    expect(sent.map((email) => email.subject)).toEqual(["Time to plan 2026-W42"]);
  });

  it("stops calls when the caller asks", async () => {
    const owner = await callableUser();
    await runPlanningCron(sundayRun);
    const [call] = await callsFor(owner.id);
    await handleVoiceEvent({
      kind: "ended",
      providerCallId: `fake-${call.id}`,
      outcome: "completed",
      endedReason: "customer-ended-call",
      transcript: "User: Please stop calling me.",
    });
    await processCall(call.id, {
      extractor: async () => ({
        planCaptured: false,
        userAskedToStopCalls: true,
        bigPictureDirection: null,
        tasks: [],
        dayItems: [],
        weekNotes: null,
        callSummary: "The caller asked to stop the weekly calls.",
      }),
    });
    const schedule = await findSchedule(owner.id);
    expect(schedule).toMatchObject({ channel: "email", callConsentAt: null, enabled: true });
  });

  it("retries extraction failures and gives up after three attempts", async () => {
    const owner = await callableUser();
    await runPlanningCron(sundayRun);
    const [call] = await callsFor(owner.id);
    await handleVoiceEvent(
      {
        kind: "ended",
        providerCallId: `fake-${call.id}`,
        outcome: "completed",
        endedReason: "customer-ended-call",
        transcript: "User: plan",
      },
      sundayRun,
    );
    const failing = async (): Promise<ExtractedPlan> => {
      throw new Error("model unavailable");
    };
    for (let minute = 2; minute <= 4; minute++) {
      await runPlanningCron(sundayRun.plus({ minutes: minute * 10 }), { extractor: failing });
    }
    const [failed] = await callsFor(owner.id);
    expect(failed).toMatchObject({ status: "failed", processingAttempts: 3 });
    expect(sent.map((email) => email.subject)).toEqual(["We missed you — plan 2026-W42 in the app"]);
  });
});
