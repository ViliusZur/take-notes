import type { ApiErrorBody } from "@/lib/api-types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.error);
  }

  get isConflict() {
    return this.status === 412;
  }

  get code() {
    return this.body.code;
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Sent as `If-Match` for optimistic concurrency. */
  version?: number;
};

/**
 * Set while an encrypted notebook is unlocked in this tab. The server checks it on every planner
 * request; it proves the password is known but cannot decrypt anything.
 */
let unlockProof: string | null = null;

export function setUnlockProof(proof: string | null) {
  unlockProof = proof;
}

/** `locked`: the server refused the unlock proof. `encryption_off`: encryption was turned off elsewhere. */
export type EncryptionSignal = "locked" | "encryption_off";

let signalListener: ((signal: EncryptionSignal) => void) | null = null;

export function onEncryptionSignal(listener: (signal: EncryptionSignal) => void) {
  signalListener = listener;
  return () => {
    if (signalListener === listener) signalListener = null;
  };
}

export async function api<T>(path: string, { method = "GET", body, version }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (version !== undefined) headers["If-Match"] = `"${version}"`;
  if (unlockProof) headers["X-Unlock-Proof"] = unlockProof;

  const response = await fetch(path, {
    method,
    // Always ask the server; never reuse a browser-cached copy of the user's data.
    cache: "no-store",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) {
    const error = new ApiError(response.status, data as ApiErrorBody);
    if (error.status === 423) signalListener?.("locked");
    if (error.code === "encryption_off") signalListener?.("encryption_off");
    throw error;
  }
  return data as T;
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 413) return "That's more data than the server accepts in one request.";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
