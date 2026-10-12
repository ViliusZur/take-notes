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
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Sent as `If-Match` for optimistic concurrency. */
  version?: number;
};

export async function api<T>(path: string, { method = "GET", body, version }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (version !== undefined) headers["If-Match"] = `"${version}"`;

  const response = await fetch(path, {
    method,
    // Always ask the server; never reuse a browser-cached copy of the user's data.
    cache: "no-store",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) throw new ApiError(response.status, data as ApiErrorBody);
  return data as T;
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
