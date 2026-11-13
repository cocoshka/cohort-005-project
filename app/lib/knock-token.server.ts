import { signUserToken } from "@knocklabs/node";

// ─── Browser login for Knock ───
// Knock's "enhanced security mode" makes the browser client carry a signed
// user token. Cadence signs it (RS256) from the session, so nobody can read
// another person's Inbox. The browser refreshes it from /api/knock-token
// before it expires.

const USER_TOKEN_LIFETIME_SECONDS = 30 * 60;

export function signKnockUserToken(
  userId: number,
  signingKey: string
): Promise<string> {
  return signUserToken(String(userId), {
    signingKey,
    expiresInSeconds: USER_TOKEN_LIFETIME_SECONDS,
  });
}

/** What the browser needs to open the Inbox feed. */
export type KnockClientConfig = {
  publicApiKey: string;
  feedChannelId: string;
  userToken: string;
};

/**
 * The browser's Knock settings for this person, or null when Knock isn't set
 * up (tests, local dev without keys). Then the Inbox stays empty.
 */
export async function getKnockClientConfig(
  userId: number
): Promise<KnockClientConfig | null> {
  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  const signingKey = process.env.KNOCK_SIGNING_KEY;
  if (!publicApiKey || !feedChannelId || !signingKey) return null;

  return {
    publicApiKey,
    feedChannelId,
    userToken: await signKnockUserToken(userId, signingKey),
  };
}
