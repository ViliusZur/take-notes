import { z } from "zod";
import { json, parseJson, requireUser, route } from "@/server/http";
import { startVerification } from "@/server/modules/phone/service";

const schema = z.object({ phone: z.string().min(8).max(32) });

export const POST = route(async (request) => {
  const user = await requireUser();
  const { phone } = await parseJson(request, schema);
  return json(await startVerification(user.id, phone), { status: 201 });
});
