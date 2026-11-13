import { describe, expect, it } from "vitest";
import { groupInbox, inboxEmptyState } from "./inbox";

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
