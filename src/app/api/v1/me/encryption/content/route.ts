import { json, requireUser, route, unlockProof } from "@/server/http";
import { getNotebookContent } from "@/server/modules/encryption/service";

/** Every week's and task's content, as stored, for the browser to encrypt or decrypt in bulk. */
export const GET = route(async (request) => {
  const user = await requireUser();
  return json(await getNotebookContent(user.id, unlockProof(request)));
});
