import { z } from "zod";
import { ifMatchVersion, json, parseJson, requireUser, route } from "@/server/http";
import { setNotes } from "@/server/modules/planner/service";
import { weekKeyFromParams } from "@/server/validation";

const putSchema = z.object({ notes: z.string().max(100_000) });

/** Replaces the week's notes. `If-Match` carries `notesVersion`. */
export const PUT = route<RouteContext<"/api/v1/years/[isoYear]/weeks/[isoWeek]/notes">>(async (request, context) => {
  const user = await requireUser();
  const key = weekKeyFromParams(await context.params);
  const { notes } = await parseJson(request, putSchema);
  const saved = await setNotes(user.id, key, notes, ifMatchVersion(request));
  return json(saved, { version: saved.notesVersion });
});
