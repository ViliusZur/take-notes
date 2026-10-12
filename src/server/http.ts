import "server-only";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { log } from "@/server/log";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);

/** Thrown when an `If-Match` version does not match; carries the current resource. */
export class VersionConflict extends HttpError {
  constructor(current: unknown) {
    super(412, "This item was changed elsewhere", { current });
  }
}

export type SessionUser = { id: string; email: string; name: string };

export async function requireUser(): Promise<SessionUser> {
  const requestHeaders = await headers();
  const result = await auth().api.getSession({ headers: requestHeaders });
  if (!result) throw new HttpError(401, "Sign in required");
  const { id, email, name } = result.user;
  return { id, email, name };
}

export async function parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(422, "Invalid request", { issues: z.treeifyError(parsed.error) });
  }
  return parsed.data;
}

/** Reads `If-Match: "3"` (or `3`). Returns undefined when absent. */
export function ifMatchVersion(request: Request): number | undefined {
  const header = request.headers.get("if-match");
  if (!header) return undefined;
  const version = Number(header.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(version)) throw new HttpError(400, "If-Match must be a version number");
  return version;
}

/**
 * API responses are per-user and change constantly, so browsers and Vercel's CDN must never store them.
 * (Vercel's default `public, max-age=0, must-revalidate` lets a browser revalidate and reuse an old body.)
 * Versions for `If-Match` travel in the JSON body, not in an ETag.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(data: unknown, init?: ResponseInit) {
  const response = Response.json(data, init);
  for (const [name, value] of Object.entries(NO_STORE)) response.headers.set(name, value);
  return response;
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return json({ error: error.message, ...error.body }, { status: error.status });
  }
  log.error("Unhandled API error", error);
  return json({ error: "Something went wrong" }, { status: 500 });
}

type Handler<Ctx> = (request: Request, context: Ctx) => Promise<Response>;

/** Wraps a route handler so thrown `HttpError`s become JSON responses. */
export function route<Ctx>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      // Let Next.js handle its own control-flow errors (prerender interruptions, redirects).
      unstable_rethrow(error);
      return errorResponse(error);
    }
  };
}
