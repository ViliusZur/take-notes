import { z } from "zod";
import { SCHEDULE_CHANNELS } from "@/server/db/schema";
import { json, parseJson, requireUser, route } from "@/server/http";
import { getSchedule, putSchedule } from "@/server/modules/schedules/service";

const scheduleSchema = z.object({
  enabled: z.boolean(),
  channel: z.enum(SCHEDULE_CHANNELS),
  dayOfWeek: z.number().int().min(1).max(7),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1),
  emailFallback: z.boolean(),
  callConsent: z.boolean().optional(),
});

export const GET = route(async () => {
  const user = await requireUser();
  return json(await getSchedule(user.id));
});

export const PUT = route(async (request) => {
  const user = await requireUser();
  const input = await parseJson(request, scheduleSchema);
  return json(await putSchedule(user.id, input));
});
