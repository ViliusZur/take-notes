import { z } from "zod";
import { ifMatchVersion, json, parseJson, requireUser, route } from "@/server/http";
import { getWeek, setDirection } from "@/server/modules/planner/service";
import { weekKeyFromParams } from "@/server/validation";

type Context = RouteContext<"/api/v1/years/[isoYear]/weeks/[isoWeek]">;

const putSchema = z.object({ bigPictureDirection: z.string().max(2000) });

export const GET = route<Context>(async (_request, context) => {
  const user = await requireUser();
  const week = await getWeek(user.id, weekKeyFromParams(await context.params));
  return json(week);
});

export const PUT = route<Context>(async (request, context) => {
  const user = await requireUser();
  const key = weekKeyFromParams(await context.params);
  const { bigPictureDirection } = await parseJson(request, putSchema);
  const week = await setDirection(user.id, key, bigPictureDirection, ifMatchVersion(request));
  return json(week);
});
