import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { calls, planningSchedules, tasks, userEncryption, weeks } from "@/server/db/schema";
import { handleVoiceEvent, processCall, startCall } from "@/server/modules/calls/service";
import {
  changeEncryptionPassword,
  disableEncryption,
  enableEncryption,
  getEncryptionStatus,
  getNotebookContent,
  updateEncryptionSettings,
} from "@/server/modules/encryption/service";
import {
  createTask,
  deleteTask,
  getWeek,
  listWeekSummaries,
  setDirection,
  setNotes,
  updateTask,
} from "@/server/modules/planner/service";
import { putSchedule } from "@/server/modules/schedules/service";
import { getMe } from "@/server/modules/users/service";
import { convertNotebook, decodeWeek } from "@/lib/content-codec";
import {
  CONTENT_LIMITS,
  createVault,
  decryptText,
  encryptText,
  envelopeLimit,
  isEnvelope,
  openVault,
  plainCodec,
  vaultCodec,
  WrongPasswordError,
  type ContentField,
} from "@/lib/encryption";
import { createUser } from "./helpers";

// Fewer PBKDF2 rounds keep the suite fast; the production count is covered once below.
const FAST = { iterations: 100_000 };
const week = { isoYear: 2026, isoWeek: 42 };
const PASSWORD = "correct horse battery staple";

describe("browser-side crypto", () => {
  it("unlocks only with the right password, and the proof does not depend on the salt alone", async () => {
    const { vault, keys } = await createVault(PASSWORD, FAST);
    const reopened = await openVault(PASSWORD, keys);
    expect(reopened.proof).toBe(vault.proof);
    expect(await decryptText(reopened.key, "week.notes", await encryptText(vault.key, "week.notes", "Hi"))).toBe("Hi");
    await expect(openVault("wrong password!!", keys)).rejects.toBeInstanceOf(WrongPasswordError);

    // The same password with a new salt gives an unrelated proof and key.
    const other = await createVault(PASSWORD, FAST);
    expect(other.vault.proof).not.toBe(vault.proof);
    await expect(decryptText(other.vault.key, "week.notes", await encryptText(vault.key, "week.notes", "x"))).rejects.toThrow();
  });

  it("uses the recommended PBKDF2 cost by default and keeps the data key non-extractable", async () => {
    const { vault, keys } = await createVault(PASSWORD);
    expect(keys).toMatchObject({ kdf: "PBKDF2-SHA256", iterations: 600_000 });
    expect(vault.key.extractable).toBe(false);
  });

  it("binds ciphertext to its field and leaves empty strings empty", async () => {
    const { vault } = await createVault(PASSWORD, FAST);
    const sealed = await encryptText(vault.key, "task.title", "Dentist");
    expect(isEnvelope(sealed)).toBe(true);
    expect(sealed).not.toContain("Dentist");
    // A random IV per value: the same text never looks the same twice.
    expect(await encryptText(vault.key, "task.title", "Dentist")).not.toBe(sealed);
    await expect(decryptText(vault.key, "week.notes", sealed)).rejects.toThrow();
    expect(await encryptText(vault.key, "week.notes", "")).toBe("");
    expect(await vaultCodec(vault.key).decode("week.notes", sealed)).toContain("could not be decrypted");
  });

  it("fits the longest allowed text in the stored limit", async () => {
    const { vault } = await createVault(PASSWORD, FAST);
    for (const field of Object.keys(CONTENT_LIMITS) as ContentField[]) {
      // "€" is one UTF-16 unit but three UTF-8 bytes: the worst case.
      const sealed = await encryptText(vault.key, field, "€".repeat(CONTENT_LIMITS[field]));
      expect(sealed.length).toBeLessThanOrEqual(envelopeLimit(field));
      expect(isEnvelope(sealed)).toBe(true);
    }
  });
});

async function seededUser() {
  const owner = await createUser();
  await setDirection(owner.id, week, "Ship onboarding", 0);
  await setNotes(owner.id, week, "Call Anna about the contract", 0);
  const task = await createTask(owner.id, week, { title: "Write investor update" });
  await updateTask(owner.id, task.id, { status: "skipped", skippedReason: "Waiting for numbers" }, undefined);
  return { owner, taskId: task.id };
}

async function encrypt(userId: string) {
  const { vault, keys } = await createVault(PASSWORD, FAST);
  const content = await convertNotebook(await getNotebookContent(userId, null), plainCodec, vaultCodec(vault.key));
  const status = await enableEncryption(userId, { keys, proof: vault.proof, lockTimeoutMinutes: 5, content });
  return { vault, keys, status };
}

/** Everything stored for the user, as one string, to search for leftover plain text. */
async function storedText(userId: string) {
  const weekRows = await db.select().from(weeks).where(eq(weeks.userId, userId));
  const taskRows = await db
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(weeks, eq(tasks.weekId, weeks.id))
    .where(eq(weeks.userId, userId));
  return JSON.stringify([weekRows, taskRows]);
}

describe("encrypted notebook", () => {
  it("stores no plain text once encryption is on, and decrypts in the browser", async () => {
    const { owner } = await seededUser();
    const { vault, status } = await encrypt(owner.id);
    expect(status).toMatchObject({ enabled: true, lockTimeoutMinutes: 5, keys: { kdf: "PBKDF2-SHA256" } });
    expect(await getMe(owner.id)).toMatchObject({ encryptionEnabled: true });

    const stored = await storedText(owner.id);
    for (const secret of ["Ship onboarding", "Call Anna", "investor", "Waiting for numbers"]) {
      expect(stored).not.toContain(secret);
    }

    const sealed = await getWeek(owner.id, week, vault.proof);
    expect(isEnvelope(sealed.notes)).toBe(true);
    const opened = await decodeWeek(vaultCodec(vault.key), sealed);
    expect(opened).toMatchObject({
      bigPictureDirection: "Ship onboarding",
      notes: "Call Anna about the contract",
      tasks: [{ title: "Write investor update", status: "skipped", skippedReason: "Waiting for numbers" }],
    });

    // The server never stores the password or the proof itself.
    const [row] = await db.select().from(userEncryption).where(eq(userEncryption.userId, owner.id));
    expect(JSON.stringify(row)).not.toContain(PASSWORD);
    expect(row.proofHash).not.toBe(vault.proof);
  });

  it("refuses to read or change content while locked", async () => {
    const { owner, taskId } = await seededUser();
    const { vault } = await encrypt(owner.id);
    const locked = { status: 423 };
    const wrong = (await createVault(PASSWORD, FAST)).vault.proof;

    await expect(getWeek(owner.id, week)).rejects.toMatchObject(locked);
    await expect(getWeek(owner.id, week, wrong)).rejects.toMatchObject(locked);
    await expect(listWeekSummaries(owner.id, 2026)).rejects.toMatchObject(locked);
    await expect(getNotebookContent(owner.id, null)).rejects.toMatchObject(locked);
    await expect(createTask(owner.id, week, { title: await encryptText(vault.key, "task.title", "x") })).rejects.toMatchObject(locked);
    await expect(updateTask(owner.id, taskId, { status: "done" }, undefined)).rejects.toMatchObject(locked);
    await expect(deleteTask(owner.id, taskId)).rejects.toMatchObject(locked);
    await expect(setNotes(owner.id, week, "", undefined)).rejects.toMatchObject(locked);

    // Settings stay reachable, but encryption itself can't be changed without unlocking.
    expect(await getEncryptionStatus(owner.id)).toMatchObject({ enabled: true });
    await expect(updateEncryptionSettings(owner.id, null, { lockTimeoutMinutes: 60 })).rejects.toMatchObject(locked);
    await expect(disableEncryption(owner.id, wrong, { weeks: [], tasks: [] })).rejects.toMatchObject(locked);
    const next = await createVault("another long password", FAST);
    await expect(
      changeEncryptionPassword(owner.id, null, { keys: next.keys, proof: next.vault.proof, content: { weeks: [], tasks: [] } }),
    ).rejects.toMatchObject(locked);

    expect(await updateEncryptionSettings(owner.id, vault.proof, { lockTimeoutMinutes: 60 })).toMatchObject({
      lockTimeoutMinutes: 60,
    });
  });

  it("accepts only encrypted content from an unlocked browser", async () => {
    const { owner, taskId } = await seededUser();
    const { vault } = await encrypt(owner.id);
    const plain = { status: 422 };

    await expect(createTask(owner.id, week, { title: "Plain text" }, vault.proof)).rejects.toMatchObject(plain);
    await expect(setNotes(owner.id, week, "Plain notes", undefined, vault.proof)).rejects.toMatchObject(plain);
    await expect(setDirection(owner.id, week, "Plain", undefined, vault.proof)).rejects.toMatchObject(plain);
    await expect(
      updateTask(owner.id, taskId, { status: "skipped", skippedReason: "Plain reason" }, undefined, vault.proof),
    ).rejects.toMatchObject(plain);

    const title = await encryptText(vault.key, "task.title", "Book flights");
    const created = await createTask(owner.id, week, { title, assignedDate: "2026-10-14" }, vault.proof);
    expect(created).toMatchObject({ title, kind: "ad_hoc" });
    const done = await updateTask(owner.id, created.id, { status: "done" }, created.version, vault.proof);
    expect(done.status).toBe("done");
    await deleteTask(owner.id, created.id, vault.proof);
  });

  it("converts all or nothing: a missing, stale, or plain row aborts", async () => {
    const { owner } = await seededUser();
    const { vault, keys } = await createVault(PASSWORD, FAST);
    const content = await convertNotebook(await getNotebookContent(owner.id, null), plainCodec, vaultCodec(vault.key));
    const enable = (changed: typeof content) =>
      enableEncryption(owner.id, { keys, proof: vault.proof, lockTimeoutMinutes: 15, content: changed });

    await expect(enable({ ...content, tasks: [] })).rejects.toMatchObject({ status: 409, body: { code: "notebook_changed" } });
    await expect(
      enable({ ...content, weeks: content.weeks.map((w) => ({ ...w, notes: "still plain" })) }),
    ).rejects.toMatchObject({ status: 422 });

    // Another tab saves after the browser read the notebook.
    await setNotes(owner.id, week, "Edited elsewhere", undefined);
    await expect(enable(content)).rejects.toMatchObject({ status: 409, body: { code: "notebook_changed" } });

    expect(await getEncryptionStatus(owner.id)).toMatchObject({ enabled: false });
    expect(await storedText(owner.id)).toContain("Edited elsewhere");
  });

  it("changes the password with a new key, so the old password and proof stop working", async () => {
    const { owner } = await seededUser();
    const { vault, keys } = await encrypt(owner.id);
    const next = await createVault("a brand new passphrase", FAST);
    const content = await convertNotebook(
      await getNotebookContent(owner.id, vault.proof),
      vaultCodec(vault.key, { strict: true }),
      vaultCodec(next.vault.key),
    );
    const status = await changeEncryptionPassword(owner.id, vault.proof, {
      keys: next.keys,
      proof: next.vault.proof,
      content,
    });
    expect(status.keys?.wrappedKey).toBe(next.keys.wrappedKey);

    await expect(getWeek(owner.id, week, vault.proof)).rejects.toMatchObject({ status: 423 });
    await expect(openVault(PASSWORD, status.keys!)).rejects.toBeInstanceOf(WrongPasswordError);
    // The old key can't read the re-encrypted content either.
    const sealed = await getWeek(owner.id, week, next.vault.proof);
    await expect(decryptText(vault.key, "week.notes", sealed.notes)).rejects.toThrow();
    expect((await decodeWeek(vaultCodec(next.vault.key), sealed)).notes).toBe("Call Anna about the contract");
    expect(keys.wrappedKey).not.toBe(next.keys.wrappedKey);
  });

  it("turns off with the proof and stores plain text again", async () => {
    const { owner } = await seededUser();
    const { vault } = await encrypt(owner.id);
    const content = await convertNotebook(
      await getNotebookContent(owner.id, vault.proof),
      vaultCodec(vault.key, { strict: true }),
      plainCodec,
    );
    expect(await disableEncryption(owner.id, vault.proof, content)).toMatchObject({ enabled: false, keys: null });

    expect(await getWeek(owner.id, week)).toMatchObject({
      bigPictureDirection: "Ship onboarding",
      notes: "Call Anna about the contract",
      tasks: [{ title: "Write investor update", skippedReason: "Waiting for numbers" }],
    });
    // A tab that still thinks the notebook is encrypted is told to reload instead of writing ciphertext.
    await expect(getWeek(owner.id, week, vault.proof)).rejects.toMatchObject({
      status: 409,
      body: { code: "encryption_off" },
    });
    expect(await db.select().from(userEncryption).where(eq(userEncryption.userId, owner.id))).toEqual([]);
  });

  it("stops planning calls and deletes what past calls kept", async () => {
    const setupTime = DateTime.fromISO("2026-10-08T09:00:00Z");
    const owner = await createUser({ phoneE164: "+37061234567", phoneVerifiedAt: new Date() });
    const callSchedule = {
      enabled: true,
      channel: "call" as const,
      dayOfWeek: 7,
      localTime: "18:00",
      timezone: "Europe/Vilnius",
      emailFallback: true,
      callConsent: true,
    };
    await putSchedule(owner.id, callSchedule, setupTime);
    await db.insert(calls).values({
      userId: owner.id,
      targetIsoYear: 2026,
      targetIsoWeek: 42,
      provider: "fake",
      trigger: "schedule",
      status: "processed",
      transcript: "User: I need to see the oncologist on Tuesday",
      summary: "Oncologist on Tuesday",
      extractedPlan: { tasks: [{ title: "Oncologist" }] },
      importResult: { taskIds: [], direction: null, notesAppended: "Oncologist" },
    });

    await encrypt(owner.id);

    const [call] = await db.select().from(calls).where(eq(calls.userId, owner.id));
    expect(call).toMatchObject({ transcript: null, summary: null, extractedPlan: null, importResult: null });
    const [schedule] = await db.select().from(planningSchedules).where(eq(planningSchedules.userId, owner.id));
    expect(schedule).toMatchObject({ channel: "email", enabled: true });

    await expect(
      startCall({ userId: owner.id, trigger: "manual", targetWeek: week, now: setupTime }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(putSchedule(owner.id, callSchedule, setupTime)).rejects.toMatchObject({ status: 422 });
  });

  it("discards a call that was still running when encryption was turned on", async () => {
    const owner = await createUser();
    const [running] = await db
      .insert(calls)
      .values({
        userId: owner.id,
        targetIsoYear: 2026,
        targetIsoWeek: 42,
        provider: "fake",
        providerCallId: `fake-running-${owner.id}`,
        trigger: "schedule",
        status: "in_progress",
      })
      .returning();
    const { vault } = await encrypt(owner.id);

    const ended = await handleVoiceEvent({
      kind: "ended",
      providerCallId: running.providerCallId!,
      callId: running.id,
      outcome: "completed",
      endedReason: "customer-ended-call",
      transcript: "User: Next week I see the lawyer.",
    });
    expect(ended.process).toBe(true);
    let extracted = false;
    await processCall(running.id, {
      extractor: async () => {
        extracted = true;
        throw new Error("must not run");
      },
    });

    expect(extracted).toBe(false);
    const [call] = await db.select().from(calls).where(eq(calls.id, running.id));
    expect(call).toMatchObject({ status: "processed", transcript: null, importResult: null, summary: null });
    expect((await getNotebookContent(owner.id, vault.proof)).tasks).toEqual([]);
  });
});
