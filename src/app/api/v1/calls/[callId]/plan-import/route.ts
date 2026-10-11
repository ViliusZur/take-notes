import { json, requireUser, route } from "@/server/http";
import { undoImport } from "@/server/modules/calls/service";

/** Undo: removes everything this call added to the planner. */
export const DELETE = route<RouteContext<"/api/v1/calls/[callId]/plan-import">>(async (_request, context) => {
  const user = await requireUser();
  const { callId } = await context.params;
  return json(await undoImport(user.id, callId));
});
