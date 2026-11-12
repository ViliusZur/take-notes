import { z } from "zod";
import { json, parseJson, requireUser, route, unlockProof } from "@/server/http";
import {
  changeEncryptionPassword,
  disableEncryption,
  enableEncryption,
  getEncryptionStatus,
  updateEncryptionSettings,
} from "@/server/modules/encryption/service";
import { encryptionKeys, lockTimeout, notebookContent, proofValue } from "@/server/validation";

// Converting a large notebook rewrites every week and task in one transaction.
export const maxDuration = 60;

/** Encryption status, and the wrapped key the browser unlocks with. */
export const GET = route(async () => {
  const user = await requireUser();
  return json(await getEncryptionStatus(user.id));
});

/** Turns encryption on. The body carries the whole notebook, already encrypted in the browser. */
export const POST = route(async (request) => {
  const user = await requireUser();
  const input = await parseJson(
    request,
    z.object({ keys: encryptionKeys, proof: proofValue, lockTimeoutMinutes: lockTimeout, content: notebookContent }),
  );
  return json(await enableEncryption(user.id, input), { status: 201 });
});

/** Changes the password (and the data key); the notebook comes re-encrypted. Needs the current unlock proof. */
export const PUT = route(async (request) => {
  const user = await requireUser();
  const input = await parseJson(
    request,
    z.object({ keys: encryptionKeys, proof: proofValue, content: notebookContent }),
  );
  return json(await changeEncryptionPassword(user.id, unlockProof(request), input));
});

/** Changes the lock timeout. Needs the current unlock proof. */
export const PATCH = route(async (request) => {
  const user = await requireUser();
  const input = await parseJson(request, z.object({ lockTimeoutMinutes: lockTimeout }));
  return json(await updateEncryptionSettings(user.id, unlockProof(request), input));
});

/** Turns encryption off. The body carries the whole notebook, decrypted in the browser. Needs the current unlock proof. */
export const DELETE = route(async (request) => {
  const user = await requireUser();
  const { content } = await parseJson(request, z.object({ content: notebookContent }));
  return json(await disableEncryption(user.id, unlockProof(request), content));
});
