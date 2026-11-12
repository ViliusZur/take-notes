import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, type Executor, type Transaction } from "@/server/db";
import { calls, planningSchedules, user, userEncryption, type UserEncryption } from "@/server/db/schema";
import { EncryptionOff, HttpError, NotebookLocked, notFound } from "@/server/http";
import { log } from "@/server/log";
import * as plannerRepo from "@/server/modules/planner/repository";
import type { EncryptionKeysDto, EncryptionStatusDto, NotebookContentDto } from "@/lib/api-types";
import { DEFAULT_LOCK_TIMEOUT } from "@/lib/encryption";
import { contentValue, type ContentMode } from "./content";

/*
 * The server never sees the encryption password or the data key. It keeps the wrapped key for
 * the browser, and the SHA-256 of an unlock proof derived from the password. Every planner request
 * of an encrypted notebook must carry that proof, so a signed-in but locked session can neither
 * read nor change content, nor turn encryption off.
 */

export function hashProof(proof: string) {
  return createHash("sha256").update(proof).digest("hex");
}

function proofMatches(row: UserEncryption, proof: string | null | undefined) {
  if (!proof) return false;
  const expected = Buffer.from(row.proofHash, "hex");
  const actual = Buffer.from(hashProof(proof), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function requireProof(row: UserEncryption, userId: string, proof: string | null | undefined) {
  if (proofMatches(row, proof)) return;
  if (proof) log.warn(`Rejected a wrong unlock proof for user '${userId}'`);
  throw new NotebookLocked();
}

export async function findEncryption(ex: Executor, userId: string) {
  const [row] = await ex.select().from(userEncryption).where(eq(userEncryption.userId, userId));
  return row;
}

export async function isEncrypted(ex: Executor, userId: string) {
  return (await findEncryption(ex, userId)) !== undefined;
}

/**
 * Locks the owner's row until the transaction ends and returns their encryption settings.
 * Content reads and writes take a shared lock; turning encryption on or off, or changing its
 * password, takes an exclusive one. So no write can land mid-conversion in the wrong form.
 */
export async function lockOwner(tx: Transaction, userId: string, strength: "share" | "no key update") {
  const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for(strength);
  if (!owner) throw notFound("User");
  return findEncryption(tx, userId);
}

/**
 * Runs planner reads and writes in one transaction with the content mode the owner has now.
 * Encrypted notebooks need a valid unlock proof. A proof sent for a plain notebook means the
 * client still thinks encryption is on, so it is told to reload rather than sending ciphertext.
 */
export async function withContentAccess<T>(
  userId: string,
  proof: string | null | undefined,
  run: (tx: Transaction, mode: ContentMode) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const encryption = await lockOwner(tx, userId, "share");
    if (encryption) {
      requireProof(encryption, userId, proof);
      return run(tx, "encrypted");
    }
    if (proof) throw new EncryptionOff();
    return run(tx, "plain");
  });
}

function toStatus(row: UserEncryption | undefined): EncryptionStatusDto {
  if (!row) return { enabled: false, lockTimeoutMinutes: DEFAULT_LOCK_TIMEOUT, keys: null };
  return {
    enabled: true,
    lockTimeoutMinutes: row.lockTimeoutMinutes,
    keys: {
      kdf: "PBKDF2-SHA256",
      iterations: row.kdfIterations,
      salt: row.kdfSalt,
      wrappedKey: row.wrappedKey,
      wrapIv: row.wrapIv,
    },
  };
}

function keyColumns(keys: EncryptionKeysDto, proof: string) {
  return {
    kdf: keys.kdf,
    kdfIterations: keys.iterations,
    kdfSalt: keys.salt,
    wrappedKey: keys.wrappedKey,
    wrapIv: keys.wrapIv,
    proofHash: hashProof(proof),
  };
}

export async function getEncryptionStatus(userId: string): Promise<EncryptionStatusDto> {
  return toStatus(await findEncryption(db, userId));
}

/** The whole notebook in its stored form, for the browser to convert. */
export async function getNotebookContent(userId: string, proof: string | null): Promise<NotebookContentDto> {
  return withContentAccess(userId, proof, async (tx) => ({
    weeks: await plannerRepo.listWeekContent(tx, userId),
    tasks: await plannerRepo.listTaskContent(tx, userId),
  }));
}

const notebookChanged = () =>
  new HttpError(409, "Your notebook changed while it was being converted. Try again.", { code: "notebook_changed" });

function sameRows(current: { id: string }[], submitted: { id: string }[]) {
  const ids = new Set(current.map((row) => row.id));
  const submittedIds = new Set(submitted.map((row) => row.id));
  return (
    current.length === submitted.length &&
    submittedIds.size === submitted.length &&
    submitted.every((row) => ids.has(row.id))
  );
}

/**
 * Replaces every week's and task's content with the converted values, all or nothing.
 * The submission must cover exactly the rows that exist, at the versions they have, so no
 * content is left behind in the old form and no newer edit is overwritten.
 */
async function rewriteNotebook(tx: Transaction, userId: string, content: NotebookContentDto, mode: ContentMode) {
  const [weeksNow, tasksNow] = [
    await plannerRepo.listWeekContent(tx, userId),
    await plannerRepo.listTaskContent(tx, userId),
  ];
  if (!sameRows(weeksNow, content.weeks) || !sameRows(tasksNow, content.tasks)) throw notebookChanged();

  for (const week of content.weeks) {
    const replaced = await plannerRepo.replaceWeekContent(tx, {
      ...week,
      bigPictureDirection: contentValue(mode, "week.direction", week.bigPictureDirection),
      notes: contentValue(mode, "week.notes", week.notes),
    });
    if (!replaced) throw notebookChanged();
  }
  for (const task of content.tasks) {
    const replaced = await plannerRepo.replaceTaskContent(tx, {
      ...task,
      title: contentValue(mode, "task.title", task.title),
      skippedReason: task.skippedReason === null ? null : contentValue(mode, "task.skippedReason", task.skippedReason),
    });
    if (!replaced) throw notebookChanged();
  }
}

/**
 * Planning calls read the plan aloud to the voice provider and write it back in plain text, so they
 * stop while encryption is on, and what earlier calls kept (transcripts, extracted plans, summaries,
 * the text an import appended) is deleted.
 */
async function forgetCallContent(tx: Transaction, userId: string) {
  await tx
    .update(calls)
    .set({ transcript: null, transcriptExpiresAt: null, extractedPlan: null, summary: null, importResult: null })
    .where(eq(calls.userId, userId));
  await tx
    .update(planningSchedules)
    .set({ channel: "email" })
    .where(and(eq(planningSchedules.userId, userId), eq(planningSchedules.channel, "call")));
}

export type EnableInput = {
  keys: EncryptionKeysDto;
  proof: string;
  lockTimeoutMinutes: number;
  /** The whole notebook, already encrypted in the browser. */
  content: NotebookContentDto;
};

export async function enableEncryption(userId: string, input: EnableInput): Promise<EncryptionStatusDto> {
  const status = await db.transaction(async (tx) => {
    if (await lockOwner(tx, userId, "no key update")) {
      throw new HttpError(409, "Encryption is already on", { code: "encryption_on" });
    }
    await rewriteNotebook(tx, userId, input.content, "encrypted");
    await forgetCallContent(tx, userId);
    const [row] = await tx
      .insert(userEncryption)
      .values({ userId, ...keyColumns(input.keys, input.proof), lockTimeoutMinutes: input.lockTimeoutMinutes })
      .returning();
    return toStatus(row);
  });
  log.debug(`Turned on encryption for user '${userId}'`, {
    weeks: input.content.weeks.length,
    tasks: input.content.tasks.length,
  });
  return status;
}

export type ChangePasswordInput = {
  keys: EncryptionKeysDto;
  /** Proof for the new password. */
  proof: string;
  /** The whole notebook, re-encrypted with the new data key. */
  content: NotebookContentDto;
};

/** New password and a new data key; needs the current proof, so only an unlocked notebook can do it. */
export async function changeEncryptionPassword(
  userId: string,
  currentProof: string | null,
  input: ChangePasswordInput,
): Promise<EncryptionStatusDto> {
  const status = await db.transaction(async (tx) => {
    const encryption = await lockOwner(tx, userId, "no key update");
    if (!encryption) throw new EncryptionOff();
    requireProof(encryption, userId, currentProof);
    await rewriteNotebook(tx, userId, input.content, "encrypted");
    const [row] = await tx
      .update(userEncryption)
      .set(keyColumns(input.keys, input.proof))
      .where(eq(userEncryption.userId, userId))
      .returning();
    return toStatus(row);
  });
  log.debug(`Changed the encryption password for user '${userId}'`);
  return status;
}

/** Stores the notebook in plain text again; needs the current proof. */
export async function disableEncryption(
  userId: string,
  currentProof: string | null,
  content: NotebookContentDto,
): Promise<EncryptionStatusDto> {
  await db.transaction(async (tx) => {
    const encryption = await lockOwner(tx, userId, "no key update");
    if (!encryption) throw new EncryptionOff();
    requireProof(encryption, userId, currentProof);
    await rewriteNotebook(tx, userId, content, "plain");
    await tx.delete(userEncryption).where(eq(userEncryption.userId, userId));
  });
  log.warn(`Turned off encryption for user '${userId}'; notes and tasks are stored in plain text again`);
  return toStatus(undefined);
}

export async function updateEncryptionSettings(
  userId: string,
  currentProof: string | null,
  settings: { lockTimeoutMinutes: number },
): Promise<EncryptionStatusDto> {
  const encryption = await findEncryption(db, userId);
  if (!encryption) throw new EncryptionOff();
  requireProof(encryption, userId, currentProof);
  const [row] = await db
    .update(userEncryption)
    .set({ lockTimeoutMinutes: settings.lockTimeoutMinutes })
    .where(eq(userEncryption.userId, userId))
    .returning();
  return toStatus(row);
}
