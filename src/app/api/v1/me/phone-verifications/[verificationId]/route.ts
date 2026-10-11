import { z } from "zod";
import { json, notFound, parseJson, requireUser, route } from "@/server/http";
import { confirmVerification } from "@/server/modules/phone/service";

const schema = z.object({ code: z.string().regex(/^\d{4,10}$/) });

export const PATCH = route<RouteContext<"/api/v1/me/phone-verifications/[verificationId]">>(
  async (request, context) => {
    const user = await requireUser();
    const { verificationId } = await context.params;
    if (!z.uuid().safeParse(verificationId).success) throw notFound("Verification");
    const { code } = await parseJson(request, schema);
    return json(await confirmVerification(user.id, verificationId, code));
  },
);
