// How the Inbox page arranges a person's Notifications. Knock holds the
// Notifications and their read state (ADR 0013); this only decides what the
// page shows.

export type InboxFilter = "all" | "unread";

export type InboxDayHeading = "Today" | "Yesterday" | "Earlier";

/** The fields the Inbox page needs to place a Notification. */
type Placeable = { insertedAt: string; readAt: string | null };

export type InboxGroup<T> = { heading: InboxDayHeading; items: T[] };

const DAY_HEADINGS: InboxDayHeading[] = ["Today", "Yesterday", "Earlier"];

/** Today and Yesterday follow the person's local calendar days. */
function dayHeading(insertedAt: string, now: Date): InboxDayHeading {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const time = new Date(insertedAt).getTime();
  if (time >= startOfToday.getTime()) return "Today";
  if (time >= startOfYesterday.getTime()) return "Yesterday";
  return "Earlier";
}

/**
 * The Notifications the filter lets through, newest first, under
 * Today / Yesterday / Earlier headings. Headings with nothing under them are
 * left out.
 */
export function groupInbox<T extends Placeable>(
  items: T[],
  filter: InboxFilter,
  now: Date
): InboxGroup<T>[] {
  const shown = items
    .filter((item) => passesFilter(item, filter))
    .sort((a, b) => b.insertedAt.localeCompare(a.insertedAt));

  return DAY_HEADINGS.map((heading) => ({
    heading,
    items: shown.filter((item) => dayHeading(item.insertedAt, now) === heading),
  })).filter((group) => group.items.length > 0);
}

export type InboxEmptyState = "Your inbox is empty" | "Nothing here";

/**
 * What the list says when it has no rows. "Your inbox is empty" is only for
 * someone who has never had a Notification; a filter that matches none of
 * theirs says "Nothing here".
 */
export function inboxEmptyState(
  items: Placeable[],
  filter: InboxFilter
): InboxEmptyState | null {
  if (items.length === 0) return "Your inbox is empty";
  return items.some((item) => passesFilter(item, filter))
    ? null
    : "Nothing here";
}

function passesFilter(item: Placeable, filter: InboxFilter): boolean {
  return filter === "all" || item.readAt === null;
}

/** The part of Knock's feed client that loading pages needs. */
export type PagedFeed = {
  /** Resolves to undefined when Knock skips the fetch (one is in flight). */
  fetch(options?: { after?: string }): Promise<unknown>;
  getState(): { pageInfo: { after: string | null } };
};

/**
 * Loads the first page of the feed, then every older page, so the Inbox (and
 * its Unread filter) has every past Notification. Knock pages the feed and
 * a plain `fetch()` only brings the newest page.
 */
export async function loadEveryPage(feed: PagedFeed): Promise<void> {
  if ((await feed.fetch()) === undefined) return;
  let after = feed.getState().pageInfo.after;
  while (after !== null) {
    if ((await feed.fetch({ after })) === undefined) return;
    const next = feed.getState().pageInfo.after;
    // Guard against a cursor that doesn't move, so this always ends.
    if (next === after) return;
    after = next;
  }
}
