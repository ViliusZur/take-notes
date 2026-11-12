"use client";

import { api, ApiError } from "@/lib/api-client";
import type { EncryptionStatusDto, NotebookContentDto } from "@/lib/api-types";
import { convertNotebook } from "@/lib/content-codec";
import { createVault, plainCodec, vaultCodec, type Vault } from "@/lib/encryption";

/*
 * Turning encryption on or off, and changing its password, converts the whole notebook in the
 * browser and sends it back in one request. The server applies it all or nothing, and refuses it
 * if anything changed in between (another tab saving), in which case it is read and converted again.
 */

const ATTEMPTS = 3;
const ENDPOINT = "/api/v1/me/encryption";

async function convertAndSave<T>(
  convert: (content: NotebookContentDto) => Promise<NotebookContentDto>,
  save: (content: NotebookContentDto) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const content = await api<NotebookContentDto>(`${ENDPOINT}/content`);
    try {
      return await save(await convert(content));
    } catch (error) {
      if (attempt < ATTEMPTS && error instanceof ApiError && error.code === "notebook_changed") continue;
      throw error;
    }
  }
}

export async function turnOnEncryption(password: string, lockTimeoutMinutes: number) {
  const { vault, keys } = await createVault(password);
  const status = await convertAndSave(
    (content) => convertNotebook(content, plainCodec, vaultCodec(vault.key)),
    (content) =>
      api<EncryptionStatusDto>(ENDPOINT, {
        method: "POST",
        body: { keys, proof: vault.proof, lockTimeoutMinutes, content },
      }),
  );
  return { vault, status };
}

/** A new password gets a new data key too, so the old wrapped key (in backups, say) opens nothing new. */
export async function changePassword(current: Vault, newPassword: string) {
  const { vault, keys } = await createVault(newPassword);
  const status = await convertAndSave(
    (content) => convertNotebook(content, vaultCodec(current.key, { strict: true }), vaultCodec(vault.key)),
    (content) => api<EncryptionStatusDto>(ENDPOINT, { method: "PUT", body: { keys, proof: vault.proof, content } }),
  );
  return { vault, status };
}

export async function turnOffEncryption(current: Vault) {
  return convertAndSave(
    (content) => convertNotebook(content, vaultCodec(current.key, { strict: true }), plainCodec),
    (content) => api<EncryptionStatusDto>(ENDPOINT, { method: "DELETE", body: { content } }),
  );
}
