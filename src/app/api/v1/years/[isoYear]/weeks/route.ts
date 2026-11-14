import { json, requireUser, route, unlockProof } from "@/server/http";
import { listWeekSummaries } from "@/server/modules/planner/service";
import { isoYearFromParam } from "@/server/validation";

export const GET = route<RouteContext<"/api/v1/years/[isoYear]/weeks">>(async (request, context) => {
  const user = await requireUser();
  const { isoYear } = await context.params;
  return json(await listWeekSummaries(user.id, isoYearFromParam(isoYear), unlockProof(request)));
});
