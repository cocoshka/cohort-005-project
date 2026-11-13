import { describe, expect, it } from "vitest";
import { groupInbox, inboxEmptyState, loadEveryPage } from "./inbox";

// Thursday 12 November 2026, 15:00 local time.
const NOW = new Date(2026, 10, 12, 15, 0, 0);

function at(day: number, hour: number) {
  return new Date(2026, 10, day, hour, 0, 0).toISOString();
}

function notification(id: string, insertedAt: string, read = false) {
  return { id, insertedAt, readAt: read ? insertedAt : null };
}

describe("groupInbox", () => {
  it("puts Notifications under Today, Yesterday and Earlier, newest first", () => {
    const items = [
      notification("last-week", at(5, 9)),
      notification("this-morning", at(12, 8)),
      notification("yesterday-night", at(11, 23)),
      notification("just-after-midnight", at(12, 0)),
      notification("two-days-ago", at(10, 23)),
      notification("yesterday-morning", at(11, 0)),
    ];

    const groups = groupInbox(items, "all", NOW);

    expect(
      groups.map((group) => [group.heading, group.items.map((item) => item.id)])
    ).toEqual([
      ["Today", ["this-morning", "just-after-midnight"]],
      ["Yesterday", ["yesterday-night", "yesterday-morning"]],
      ["Earlier", ["two-days-ago", "last-week"]],
    ]);
  });

  it("shows only unread Notifications under the Unread filter", () => {
    const items = [
      notification("read-today", at(12, 9), true),
      notification("unread-today", at(12, 10)),
      notification("read-earlier", at(1, 9), true),
      notification("unread-earlier", at(2, 9)),
    ];

    const groups = groupInbox(items, "unread", NOW);

    expect(
      groups.map((group) => [group.heading, group.items.map((item) => item.id)])
    ).toEqual([
      ["Today", ["unread-today"]],
      ["Earlier", ["unread-earlier"]],
    ]);
  });
});

describe("inboxEmptyState", () => {
  it("says the inbox is empty for someone who has never had a Notification", () => {
    expect(inboxEmptyState([], "all")).toBe("Your inbox is empty");
    expect(inboxEmptyState([], "unread")).toBe("Your inbox is empty");
  });

  it("says Nothing here when the filter matches none of their Notifications", () => {
    const allRead = [notification("read", at(12, 9), true)];

    expect(inboxEmptyState(allRead, "unread")).toBe("Nothing here");
  });

  it("says nothing when there are Notifications to show", () => {
    const items = [notification("unread", at(12, 9))];

    expect(inboxEmptyState(items, "all")).toBeNull();
    expect(inboxEmptyState(items, "unread")).toBeNull();
  });
});

/** A fake Knock feed: pages of ids, linked by `after` cursors. */
function pagedFeed(pages: string[][]) {
  let loaded: string[] = [];
  let after: string | null = null;
  const calls: Array<{ after?: string } | undefined> = [];
  return {
    calls,
    loaded: () => loaded,
    async fetch(options?: { after?: string }): Promise<unknown> {
      calls.push(options);
      const index = options?.after ? Number(options.after) : 0;
      const page = pages[index] ?? [];
      loaded = options?.after ? [...loaded, ...page] : page;
      after = index + 1 < pages.length ? String(index + 1) : null;
      return { status: "ok" };
    },
    getState() {
      return { pageInfo: { after } };
    },
  };
}

describe("loadEveryPage", () => {
  it("loads every page of Notifications, not just the first", async () => {
    const feed = pagedFeed([["a", "b"], ["c", "d"], ["e"]]);

    await loadEveryPage(feed);

    expect(feed.loaded()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("stops when Knock skips a fetch because one is already in flight", async () => {
    const feed = pagedFeed([["a"], ["b"]]);
    feed.fetch = async (options?: { after?: string }) => {
      feed.calls.push(options);
      return undefined;
    };

    await loadEveryPage(feed);

    expect(feed.calls).toHaveLength(1);
  });
});
