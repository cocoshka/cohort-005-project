import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  KnockFeedProvider,
  KnockProvider,
  useKnockFeed,
} from "@knocklabs/react";
import { z } from "zod";

// Knock's own types, taken from @knocklabs/react so Cadence doesn't depend on
// @knocklabs/client directly.
type Feed = ReturnType<typeof useKnockFeed>["feedClient"];
type FeedItem = ReturnType<Feed["getState"]>["items"][number];

// ─── Inbox ───
// The person's Notifications live in Knock (ADR 0013). This provider opens
// Knock's feed once for the whole app layout and hands the rest of Cadence a
// plain `useInbox()`. Without Knock settings (tests, local dev without keys)
// the Inbox is simply empty and nothing talks to Knock.

/** The browser's Knock settings, from the layout loader. */
export type InboxConfig = {
  publicApiKey: string;
  feedChannelId: string;
  userToken: string;
};

/** One Notification as the Inbox shows it. */
export type InboxItem = {
  id: string;
  /** Knock workflow key, e.g. "seat-claimed". */
  kind: string;
  title: string;
  summary: string | null;
  url: string;
  actionLabel: string;
  insertedAt: string;
  readAt: string | null;
  /** Knock's item, for marking it read or unread through `feedClient`. */
  feedItem: FeedItem;
};

export type InboxState = {
  /** False when Knock isn't set up; the Inbox then stays empty. */
  enabled: boolean;
  loading: boolean;
  /** Newest first. */
  items: InboxItem[];
  /** Knock's *read* state, not *seen*. */
  unreadCount: number;
  feedClient: Feed | null;
};

const disabledInbox: InboxState = {
  enabled: false,
  loading: false,
  items: [],
  unreadCount: 0,
  feedClient: null,
};

const InboxContext = createContext<InboxState>(disabledInbox);

export function useInbox(): InboxState {
  return useContext(InboxContext);
}

// Mirrors NotificationData in app/lib/notifier.server.ts.
const notificationDataSchema = z.object({
  title: z.string(),
  summary: z.string().nullish(),
  url: z.string(),
  actionLabel: z.string(),
});

function toInboxItem(feedItem: FeedItem): InboxItem | null {
  const parsed = notificationDataSchema.safeParse(feedItem.data);
  if (!parsed.success) return null;
  return {
    id: feedItem.id,
    kind: feedItem.source.key,
    title: parsed.data.title,
    summary: parsed.data.summary ?? null,
    url: parsed.data.url,
    actionLabel: parsed.data.actionLabel,
    insertedAt: feedItem.inserted_at,
    readAt: feedItem.read_at,
    feedItem,
  };
}

const tokenResponseSchema = z.object({ token: z.string() });

async function fetchFreshUserToken(): Promise<string | void> {
  const response = await fetch("/api/knock-token");
  if (!response.ok) return;
  const parsed = tokenResponseSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.token : undefined;
}

export function InboxProvider({
  userId,
  config,
  children,
}: {
  userId: number | null;
  config: InboxConfig | null;
  children: React.ReactNode;
}) {
  if (userId === null || config === null) {
    return (
      <InboxContext.Provider value={disabledInbox}>
        {children}
      </InboxContext.Provider>
    );
  }

  return (
    <KnockInbox key={userId} userId={userId} config={config}>
      {children}
    </KnockInbox>
  );
}

function KnockInbox({
  userId,
  config,
  children,
}: {
  userId: number;
  config: InboxConfig;
  children: React.ReactNode;
}) {
  // Keep the first token: the layout loader signs a new one on every
  // revalidation, and swapping it would reconnect Knock. Knock asks for a
  // fresh one through onUserTokenExpiring instead.
  const [userToken] = useState(config.userToken);
  const user = useMemo(() => ({ id: String(userId) }), [userId]);

  return (
    <KnockProvider
      apiKey={config.publicApiKey}
      user={user}
      // Cadence identifies people when it triggers a workflow.
      identificationStrategy="skip"
      userToken={userToken}
      onUserTokenExpiring={fetchFreshUserToken}
    >
      {/* `auto_manage_socket_connection` is gone from @knocklabs/client
          (removed in 0.21.2): it now always drops a hidden tab's socket after
          a short delay and reconnects when the tab is shown again. */}
      <KnockFeedProvider feedId={config.feedChannelId}>
        <KnockInboxState>{children}</KnockInboxState>
      </KnockFeedProvider>
    </KnockProvider>
  );
}

function KnockInboxState({ children }: { children: React.ReactNode }) {
  const { feedClient, useFeedStore } = useKnockFeed();
  const feedItems = useFeedStore((state) => state.items);
  const unreadCount = useFeedStore((state) => state.metadata.unread_count);
  const loading = useFeedStore((state) => state.loading);

  useEffect(() => {
    // The feed listens for live updates on its own but doesn't load the
    // first page. Reload when a hidden tab is shown, so it catches up.
    void feedClient.fetch();
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void feedClient.fetch();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [feedClient]);

  const value = useMemo<InboxState>(() => {
    const items = feedItems
      .map(toInboxItem)
      .filter((item): item is InboxItem => item !== null)
      .sort((a, b) => b.insertedAt.localeCompare(a.insertedAt));
    return { enabled: true, loading, items, unreadCount, feedClient };
  }, [feedItems, loading, unreadCount, feedClient]);

  return (
    <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
  );
}
