import { z } from "zod";
import { json, parseJson, requireUser, route } from "@/server/http";
import { deleteAccount, getMe, updateMe } from "@/server/modules/users/service";
import { isValidTimezone } from "@/lib/weeks";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone").optional(),
});

export const GET = route(async () => {
  const user = await requireUser();
  return json(await getMe(user.id));
});

export const PATCH = route(async (request) => {
  const user = await requireUser();
  const patch = await parseJson(request, patchSchema);
  return json(await updateMe(user.id, patch));
});

export const DELETE = route(async () => {
  const user = await requireUser();
  await deleteAccount(user.id);
  return new Response(null, { status: 204 });
});
