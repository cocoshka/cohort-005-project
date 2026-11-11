// PROTOTYPE — throwaway (see data.ts).
// Variant B: "Inbox page in the nav".
// - No bell. "Inbox" is the first sidebar nav item, with the UNREAD count as a pill.
// - It opens a full page (/prototype/inbox): filter tabs, list grouped by day,
//   and a reading pane. Selecting a row marks it read and shows it on the right;
//   the source is one button away ("Go to lesson", "Review Refund Request"…).
// - Announcements are read IN the inbox: the reading pane renders the full
//   Markdown body, so there's no need to leave.
// - A toast pops on arrival (sonner, bottom-right) with a "View" action.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { toast } from "sonner";
import { marked } from "marked";
import { ArrowRight, Inbox, MailOpen, Mail } from "lucide-react";
import { cn } from "~/lib/utils";
import { useProtoNotifications } from "./state";
import { dayBucket, KIND_LABEL, timeAgo, type ProtoNotification } from "./data";
import { KindIcon } from "./shared";
import { InboxSoundControl } from "./sound-switch"; // PROTOTYPE sound switch

const INBOX_PATH = "/prototype/inbox";

export function VariantBNavItem() {
  const { unread } = useProtoNotifications();
  return (
    <NavLink
      to={INBOX_PATH}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Inbox className="size-4" />
      Inbox
      {unread > 0 && (
        <span className="ml-auto rounded-full bg-primary px-2 text-xs font-semibold leading-5 text-primary-foreground">
          {unread}
        </span>
      )}
    </NavLink>
  );
}

/** Mounted in the layout while variant B is active: toasts new arrivals. */
export function VariantBToaster() {
  const { lastArrivalId, items } = useProtoNotifications();
  const navigate = useNavigate();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!lastArrivalId || shown.current === lastArrivalId) return;
    shown.current = lastArrivalId;
    const n = items.find((x) => x.id === lastArrivalId);
    if (!n) return;
    toast(n.title, {
      description: n.kind === "announcement" ? `Announcement · ${n.course}` : KIND_LABEL[n.kind],
      action: { label: "View", onClick: () => navigate(`${INBOX_PATH}?open=${n.id}`) },
    });
  }, [lastArrivalId, items, navigate]);
  return null;
}

const ACTION_LABEL: Record<ProtoNotification["kind"], string> = {
  "refund-request-decided": "View course",
  "new-refund-request": "Review Refund Request",
  "new-reply": "Go to the reply",
  "new-question": "Answer the question",
  "seat-claimed": "Manage your Team",
  announcement: "Open course page",
};

type Filter = "all" | "unread" | "announcements";

export function VariantBInboxPage({ openId }: { openId: string | null }) {
  const { items, unread, markRead, markUnread, markAllRead } = useProtoNotifications();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(openId);

  useEffect(() => {
    if (openId) {
      setSelectedId(openId);
      markRead(openId);
    }
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = items.filter((n) =>
    filter === "unread" ? !n.readAt : filter === "announcements" ? n.kind === "announcement" : true
  );
  const groups = useMemo(() => {
    const g: Record<string, ProtoNotification[]> = {};
    for (const n of shown) (g[dayBucket(n.createdAt)] ??= []).push(n);
    return Object.entries(g);
  }, [shown]);
  const selected = items.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b px-6 py-4">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <div className="flex rounded-md bg-muted p-0.5 text-sm">
          {(["all", "unread"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded px-3 py-1 capitalize",
                filter === f ? "bg-background font-medium shadow-sm" : "text-muted-foreground"
              )}
            >
              {f}
              {f === "unread" && unread > 0 ? ` (${unread})` : ""}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <InboxSoundControl />
        <button
          onClick={markAllRead}
          disabled={unread === 0}
          className="text-sm font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          Mark all as read
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Inbox className="size-12 text-muted-foreground/40" />
          <div className="text-lg font-semibold">Your inbox is empty</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            When someone replies to your comment or a Refund Request is decided, it lands here.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-[26rem] shrink-0 overflow-y-auto border-r">
            {groups.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">Nothing here.</div>
            )}
            {groups.map(([label, ns]) => (
              <div key={label}>
                <div className="sticky top-0 bg-background/95 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {label}
                </div>
                {ns.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setSelectedId(n.id);
                      markRead(n.id);
                    }}
                    className={cn(
                      "flex w-full gap-3 border-l-2 px-4 py-3 text-left hover:bg-accent",
                      selectedId === n.id ? "border-primary bg-accent" : "border-transparent"
                    )}
                  >
                    <KindIcon kind={n.kind} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-muted-foreground">{KIND_LABEL[n.kind]}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <div className={cn("truncate text-sm", !n.readAt && "font-semibold")}>
                        {n.title}
                      </div>
                    </div>
                    {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto p-8">
            {!selected ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a Notification to read it.
              </div>
            ) : (
              <article className="mx-auto max-w-2xl">
                <div className="mb-4 flex items-center gap-3">
                  <KindIcon kind={selected.kind} />
                  <div className="text-sm text-muted-foreground">
                    {KIND_LABEL[selected.kind]}
                    {selected.kind === "announcement" &&
                      ` · ${selected.scope === "everyone" ? "Everyone on Cadence" : selected.course}`}
                    {" · "}
                    {new Date(selected.createdAt).toLocaleString()}
                  </div>
                  <button
                    onClick={() => (selected.readAt ? markUnread(selected.id) : markRead(selected.id))}
                    className="ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                  >
                    {selected.readAt ? <Mail className="size-3.5" /> : <MailOpen className="size-3.5" />}
                    {selected.readAt ? "Mark as unread" : "Mark as read"}
                  </button>
                </div>
                <h2 className="text-xl font-bold">{selected.title}</h2>
                <div className="mt-1 text-sm text-muted-foreground">
                  {selected.actor}
                  {selected.actorRole ? `, ${selected.actorRole}` : ""}
                </div>
                {selected.body ? (
                  <div
                    className="prose prose-sm mt-6 max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: marked.parse(selected.body, { async: false }) as string }}
                  />
                ) : (
                  selected.detail && (
                    <blockquote className="mt-6 border-l-4 pl-4 text-muted-foreground">
                      {selected.detail}
                    </blockquote>
                  )
                )}
                {selected.scope !== "everyone" && (
                  <Link
                    to={selected.href}
                    className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {ACTION_LABEL[selected.kind]} <ArrowRight className="size-4" />
                  </Link>
                )}
              </article>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
