import { data } from "react-router";
import type { Route } from "./+types/api.knock-token";
import { getCurrentUserId } from "~/lib/session";
import { signKnockUserToken } from "~/lib/knock-token.server";

// A fresh signed user token for Knock's browser client, for the person in the
// session. The Inbox calls this before its current token expires.
export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const signingKey = process.env.KNOCK_SIGNING_KEY;
  if (!signingKey) {
    throw data("Notifications are not set up.", { status: 404 });
  }

  return { token: await signKnockUserToken(currentUserId, signingKey) };
}
