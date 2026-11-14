import { z } from "zod";
import { ifMatchVersion, json, parseJson, requireUser, route, unlockProof } from "@/server/http";
import { setNotes } from "@/server/modules/planner/service";
import { weekKeyFromParams } from "@/server/validation";
import { envelopeLimit } from "@/lib/encryption";

// Plain-text limits are checked by the service; encrypted notes are longer than the text they hold.
const putSchema = z.object({ notes: z.string().max(envelopeLimit("week.notes")) });

/** Replaces the week's notes. `If-Match` carries `notesVersion`. */
export const PUT = route<RouteContext<"/api/v1/years/[isoYear]/weeks/[isoWeek]/notes">>(async (request, context) => {
  const user = await requireUser();
  const key = weekKeyFromParams(await context.params);
  const { notes } = await parseJson(request, putSchema);
  const saved = await setNotes(user.id, key, notes, ifMatchVersion(request), unlockProof(request));
  return json(saved);
});
