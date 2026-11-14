/**
 * End-to-end encryption of planner content (task titles, skip reasons, big picture, notes).
 *
 * Runs in the browser with WebCrypto; the server only ever stores what this module produces.
 *
 * - The user's encryption password goes through PBKDF2-SHA256 into a master secret.
 * - HKDF splits that secret into a key-encryption key (never leaves the browser) and an
 *   unlock proof (sent to the server, which stores only its SHA-256 to check unlocked writes).
 * - A random AES-256-GCM data key encrypts the content. It is stored on the server wrapped
 *   with the key-encryption key, so without the password nobody can unwrap it.
 */
import type { EncryptionKeysDto } from "@/lib/api-types";

export const KDF = "PBKDF2-SHA256" as const;
/** OWASP's 2023+ recommendation for PBKDF2-HMAC-SHA256. */
export const KDF_ITERATIONS = 600_000;
/** Short passwords are allowed, but anyone with the database can try guesses offline, so longer is safer. */
export const MIN_PASSWORD_LENGTH = 4;
export const MAX_PASSWORD_LENGTH = 1024;

/** Minutes without user activity before an unlocked notebook locks itself. */
export const LOCK_TIMEOUT_OPTIONS = [1, 5, 15, 30, 60, 240, 480] as const;
export const DEFAULT_LOCK_TIMEOUT = 15;

export function formatLockTimeout(minutes: number) {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export type ContentField = "task.title" | "task.skippedReason" | "week.direction" | "week.notes";

/** Plaintext limits in UTF-16 code units, the same limits the editors and the plain-text API use. */
export const CONTENT_LIMITS: Record<ContentField, number> = {
  "task.title": 200,
  "task.skippedReason": 500,
  "week.direction": 2000,
  "week.notes": 100_000,
};

/** Upper bound of the stored form: at most 3 UTF-8 bytes per code unit, a 16-byte tag, base64, IV and prefix. */
export function envelopeLimit(field: ContentField) {
  return Math.ceil(((CONTENT_LIMITS[field] * 3 + 16) * 4) / 3) + 64;
}

/** `enc1.<iv>.<ciphertext>`, both base64url. Empty strings are stored as empty strings. */
const ENVELOPE = /^enc1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;

export function isEnvelope(value: string) {
  return ENVELOPE.test(value);
}

export class WrongPasswordError extends Error {
  constructor() {
    super("That password didn't work");
  }
}

export class NotebookLockedError extends Error {
  constructor() {
    super("Your notebook is locked");
  }
}

/** An unlocked notebook: the data key (non-extractable) and the proof the server checks. */
export type Vault = { key: CryptoKey; proof: string; wrappedKey: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function subtle() {
  return globalThis.crypto.subtle;
}

function randomBytes(length: number) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string) {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const WRAP_AAD = encoder.encode("take-notes/data-key/v1");

function fieldAad(field: ContentField) {
  return encoder.encode(`take-notes/${field}/v1`);
}

async function deriveSecrets(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  // NFKC so the same password typed on another keyboard or OS gives the same bytes.
  const passwordKey = await subtle().importKey("raw", encoder.encode(password.normalize("NFKC")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const master = await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, passwordKey, 256);
  const hkdf = await subtle().importKey("raw", master, "HKDF", false, ["deriveKey", "deriveBits"]);
  const hkdfParams = (info: string) => ({
    name: "HKDF",
    hash: "SHA-256",
    salt: new Uint8Array(),
    info: encoder.encode(info),
  });
  const kek = await subtle().deriveKey(
    hkdfParams("take-notes/key-encryption-key/v1"),
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
  const proof = await subtle().deriveBits(hkdfParams("take-notes/unlock-proof/v1"), hkdf, 256);
  return { kek, proof: toBase64Url(new Uint8Array(proof)) };
}

async function unwrapDataKey(kek: CryptoKey, keys: EncryptionKeysDto) {
  return subtle().unwrapKey(
    "raw",
    fromBase64Url(keys.wrappedKey),
    kek,
    { name: "AES-GCM", iv: fromBase64Url(keys.wrapIv), additionalData: WRAP_AAD },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Sets up encryption for a new password: a fresh data key, wrapped for the server. */
export async function createVault(
  password: string,
  { iterations = KDF_ITERATIONS }: { iterations?: number } = {},
): Promise<{ vault: Vault; keys: EncryptionKeysDto }> {
  const salt = randomBytes(16);
  const { kek, proof } = await deriveSecrets(password, salt, iterations);
  const dataKey = await subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const wrapIv = randomBytes(12);
  const wrapped = await subtle().wrapKey("raw", dataKey, kek, { name: "AES-GCM", iv: wrapIv, additionalData: WRAP_AAD });
  const keys: EncryptionKeysDto = {
    kdf: KDF,
    iterations,
    salt: toBase64Url(salt),
    wrappedKey: toBase64Url(new Uint8Array(wrapped)),
    wrapIv: toBase64Url(wrapIv),
  };
  // Keep only a non-extractable copy of the data key in memory.
  const key = await unwrapDataKey(kek, keys);
  return { vault: { key, proof, wrappedKey: keys.wrappedKey }, keys };
}

/** Unlocks with the password. Throws `WrongPasswordError` when it does not unwrap the data key. */
export async function openVault(password: string, keys: EncryptionKeysDto): Promise<Vault> {
  const { kek, proof } = await deriveSecrets(password, fromBase64Url(keys.salt), keys.iterations);
  try {
    const key = await unwrapDataKey(kek, keys);
    return { key, proof, wrappedKey: keys.wrappedKey };
  } catch {
    throw new WrongPasswordError();
  }
}

export async function encryptText(key: CryptoKey, field: ContentField, plaintext: string) {
  if (plaintext === "") return "";
  const iv = randomBytes(12);
  const ciphertext = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: fieldAad(field) },
    key,
    encoder.encode(plaintext),
  );
  return `enc1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** Decrypts an envelope. Anything that is not an envelope (an empty string) is returned as is. */
export async function decryptText(key: CryptoKey, field: ContentField, stored: string) {
  if (!isEnvelope(stored)) return stored;
  const [, iv, ciphertext] = stored.split(".");
  const plaintext = await subtle().decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv), additionalData: fieldAad(field) },
    key,
    fromBase64Url(ciphertext),
  );
  return decoder.decode(plaintext);
}

/** Turns planner content into what is stored, and back. Plain text when encryption is off. */
export type ContentCodec = {
  encrypted: boolean;
  encode(field: ContentField, text: string): Promise<string>;
  decode(field: ContentField, stored: string): Promise<string>;
};

export const plainCodec: ContentCodec = {
  encrypted: false,
  encode: async (_field, text) => text,
  decode: async (_field, stored) => stored,
};

export const UNREADABLE_TEXT = "⚠ This text could not be decrypted";

/**
 * Encrypts with the vault's data key. For display, a damaged value decodes to a placeholder so it
 * does not hide the rest of the week; `strict` (used when converting the notebook) throws instead.
 */
export function vaultCodec(key: CryptoKey, { strict = false }: { strict?: boolean } = {}): ContentCodec {
  return {
    encrypted: true,
    encode: (field, text) => encryptText(key, field, text),
    decode: async (field, stored) => {
      try {
        return await decryptText(key, field, stored);
      } catch (error) {
        if (strict) throw new Error("Some of your notebook could not be decrypted, so nothing was changed", { cause: error });
        return UNREADABLE_TEXT;
      }
    },
  };
}
