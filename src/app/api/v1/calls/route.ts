import { json, requireUser, route } from "@/server/http";
import { listCalls, requestTestCall } from "@/server/modules/calls/service";

export const maxDuration = 60;

export const GET = route(async () => {
  const user = await requireUser();
  return json(await listCalls(user.id));
});

/** Starts a call right now ("call me now" test call). */
export const POST = route(async () => {
  const user = await requireUser();
  return json(await requestTestCall(user.id), { status: 201 });
});
