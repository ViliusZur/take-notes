import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { env, isProduction } from "@/server/env";
import { HttpError, route } from "@/server/http";
import { log } from "@/server/log";
import { runPlanningCron } from "@/server/modules/cron/service";

export const maxDuration = 300;

function authorized(request: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) return !isProduction();
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Vercel Cron always calls with GET and `Authorization: Bearer $CRON_SECRET`. Internal only. */
export const GET = route(async (request) => {
  await connection();
  if (!authorized(request)) {
    log.error("Cron request verification failed");
    throw new HttpError(401, "Unauthorized");
  }
  return Response.json(await runPlanningCron());
});
