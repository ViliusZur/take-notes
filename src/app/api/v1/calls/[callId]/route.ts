import { json, requireUser, route } from "@/server/http";
import { getCall } from "@/server/modules/calls/service";

export const GET = route<RouteContext<"/api/v1/calls/[callId]">>(async (_request, context) => {
  const user = await requireUser();
  const { callId } = await context.params;
  return json(await getCall(user.id, callId));
});
