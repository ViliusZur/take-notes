import { json, requireUser, route } from "@/server/http";
import { revokeCallConsent } from "@/server/modules/schedules/service";
import { removePhone } from "@/server/modules/users/service";

export const DELETE = route(async () => {
  const user = await requireUser();
  await revokeCallConsent(user.id);
  return json(await removePhone(user.id));
});
