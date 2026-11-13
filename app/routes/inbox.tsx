import { useState } from "react";
import { Link, data } from "react-router";
import { ArrowRight, Inbox as InboxIcon, Mail, MailOpen } from "lucide-react";
import type { Route } from "./+types/inbox";
import { getCurrentUserId } from "~/lib/session";
import {
  groupInbox,
  inboxEmptyState,
  type InboxFilter,
} from "~/lib/inbox";
import { useInbox, type InboxItem } from "~/components/inbox/inbox-provider";
import { KindIcon, kindLabel } from "~/components/inbox/kind-icon";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Inbox — Cadence" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }
  return null;
}

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function timeAgo(insertedAt: string, now: Date): string {
  const elapsed = now.getTime() - new Date(insertedAt).getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  return `${Math.floor(elapsed / DAY)}d`;
}

export default function InboxPage() {
  // Opening the page marks nothing: only reading a Notification lowers the
  // unread count.
  const { enabled, loading, items, unreadCount, feedClient } = useInbox();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const now = new Date();
  const groups = groupInbox(items, filter, now);
  const emptyState = inboxEmptyState(items, filter);
  // The selected Notification stays open even when the Unread filter hides
  // it after it's read.
  const selected = items.find((item) => item.id === selectedId) ?? null;

  function open(item: InboxItem) {
    setSelectedId(item.id);
    if (item.readAt === null) void feedClient?.markAsRead(item.feedItem);
  }

  function toggleRead(item: InboxItem) {
    if (item.readAt === null) void feedClient?.markAsRead(item.feedItem);
    else void feedClient?.markAsUnread(item.feedItem);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b px-6 py-4">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <div
          role="group"
          aria-label="Filter Notifications"
          className="flex rounded-md bg-muted p-0.5 text-sm"
        >
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded px-3 py-1",
                filter === value
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              {label}
              {value === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void feedClient?.markAllAsRead()}
          disabled={unreadCount === 0}
          className="ml-auto text-sm font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          Mark all as read
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <InboxIcon className="size-12 text-muted-foreground/40" />
          {enabled && loading ? (
            <p className="font-medium">Loading…</p>
          ) : (
            <>
              <p className="text-lg font-semibold">{emptyState}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {enabled ? (
                  "When someone replies to your comment or a Refund Request is decided, it lands here."
                ) : (
                  <>
                    Notifications aren't set up here. Add the Knock keys to{" "}
                    <code>.env</code> to see them.
                  </>
                )}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-[26rem] shrink-0 overflow-y-auto border-r">
            {emptyState && (
              <p className="p-6 text-sm text-muted-foreground">{emptyState}</p>
            )}
            {groups.map((group) => (
              <section key={group.heading}>
                <h2 className="sticky top-0 bg-background/95 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {group.heading}
                </h2>
                <ul>
                  {group.items.map((item) => (
                    <InboxRow
                      key={item.id}
                      item={item}
                      now={now}
                      selected={item.id === selectedId}
                      onOpen={() => open(item)}
                      onToggleRead={() => toggleRead(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto p-8">
            {selected === null ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a Notification to read it.
              </div>
            ) : (
              <ReadingPane
                item={selected}
                onToggleRead={() => toggleRead(selected)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InboxRow({
  item,
  now,
  selected,
  onOpen,
  onToggleRead,
}: {
  item: InboxItem;
  now: Date;
  selected: boolean;
  onOpen: () => void;
  onToggleRead: () => void;
}) {
  const unread = item.readAt === null;

  return (
    <li
      className={cn(
        "group relative flex border-l-2 hover:bg-accent",
        selected ? "border-primary bg-accent" : "border-transparent"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        className="flex min-w-0 flex-1 gap-3 py-3 pl-4 text-left"
      >
        <KindIcon kind={item.kind} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">
              {kindLabel(item.kind)}
            </span>
            <time
              dateTime={item.insertedAt}
              className="ml-auto text-xs text-muted-foreground"
            >
              {timeAgo(item.insertedAt, now)}
            </time>
          </div>
          <p className={cn("truncate text-sm", unread && "font-semibold")}>
            {item.title}
          </p>
        </div>
      </button>
      <div className="flex w-10 shrink-0 items-start justify-center pt-3">
        {unread && (
          <span
            className="mt-1 size-2 rounded-full bg-primary group-focus-within:hidden group-hover:hidden"
            aria-label="Unread"
          />
        )}
        <button
          type="button"
          onClick={onToggleRead}
          title={unread ? "Mark as read" : "Mark as unread"}
          aria-label={
            unread ? `Mark as read: ${item.title}` : `Mark as unread: ${item.title}`
          }
          className={cn(
            "rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground",
            "hidden group-focus-within:block group-hover:block"
          )}
        >
          {unread ? (
            <MailOpen className="size-3.5" />
          ) : (
            <Mail className="size-3.5" />
          )}
        </button>
      </div>
    </li>
  );
}

function ReadingPane({
  item,
  onToggleRead,
}: {
  item: InboxItem;
  onToggleRead: () => void;
}) {
  const unread = item.readAt === null;

  return (
    <article className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <KindIcon kind={item.kind} />
        <p className="text-sm text-muted-foreground">
          {kindLabel(item.kind)} ·{" "}
          <time dateTime={item.insertedAt}>
            {new Date(item.insertedAt).toLocaleString()}
          </time>
        </p>
        <button
          type="button"
          onClick={onToggleRead}
          className="ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
        >
          {unread ? (
            <MailOpen className="size-3.5" />
          ) : (
            <Mail className="size-3.5" />
          )}
          {unread ? "Mark as read" : "Mark as unread"}
        </button>
      </div>
      <h2 className="text-xl font-bold">{item.title}</h2>
      {item.summary && (
        <blockquote className="mt-6 whitespace-pre-line border-l-4 pl-4 text-muted-foreground">
          {item.summary}
        </blockquote>
      )}
      <Link
        to={item.url}
        className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {item.actionLabel} <ArrowRight className="size-4" />
      </Link>
    </article>
  );
}
