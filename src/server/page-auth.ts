import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getMe } from "@/server/modules/users/service";

/** For Server Components behind a Suspense boundary: the signed-in user or a redirect. */
export async function requirePageUser() {
  // Read the request first: during prerendering this suspends before auth is created.
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in");
  return getMe(session.user.id);
}
