// PROTOTYPE — throwaway (see data.ts).
// Variant C: "Top bar bell + drawer, split by type".
// - Adds a slim top bar over the page with the bell at the top right.
// - Count = UNSEEN, not unread: opening the drawer clears the badge, but rows
//   stay highlighted until clicked (Knock's seen vs read).
// - Drawer slides in from the right, in two sections:
//     1. Announcements: cards with a 3-line Markdown preview + author.
//     2. Activity: similar events are collapsed ("2 new questions on 'Lesson'"),
//        and you can expand them.
// - When a Notification arrives while the drawer is open, a "New" pill shows at
//   the top. No toast.
// - Footer links to Notification settings (where the preferences page might live).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { marked } from "marked";
import { Bell, ChevronDown, ChevronRight, Settings, X } from "lucide-react";
import { cn } from "~/lib/utils";
import { useProtoNotifications } from "./state";
import { timeAgo, type ProtoNotification } from "./data";
import { CountBadge, KindIcon } from "./shared";

export function VariantCTopBar() {
  const { unseen, markAllSeen, lastArrivalId } = useProtoNotifications();
  const [open, setOpen] = useState(false);
  const [ping, setPing] = useState(false);

  useEffect(() => {
    if (!lastArrivalId) return;
    setPing(true);
    const t = setTimeout(() => setPing(false), 1500);
    return () => clearTimeout(t);
  }, [lastArrivalId]);

  // Opening marks everything seen (badge clears); read state is untouched.
  useEffect(() => {
    if (open) markAllSeen();
  }, [open, lastArrivalId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-end border-b bg-background/90 px-4 backdrop-blur">
        <button
          onClick={() => setOpen(true)}
          className="relative rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Notifications"
        >
          <Bell className="size-5" />
          {ping && unseen > 0 && (
            <span className="absolute right-0.5 top-0.5 size-4 animate-ping rounded-full bg-red-500" />
          )}
          <CountBadge n={unseen} className="absolute -right-0.5 -top-0.5" />
        </button>
      </div>
      {open && <Drawer onClose={() => setOpen(false)} />}
    </>
  );
}

interface Group {
  key: string;
  items: ProtoNotification[];
}

function groupActivity(items: ProtoNotification[]): Group[] {
  const map = new Map<string, Group>();
  for (const n of items) {
    const key = `${n.kind}|${n.href}`;
    const g = map.get(key) ?? { key, items: [] };
    g.items.push(n);
    map.set(key, g);
  }
  return [...map.values()];
}

const PLURAL: Partial<Record<ProtoNotification["kind"], string>> = {
  "new-question": "new questions",
  "new-reply": "new replies",
  "new-refund-request": "new Refund Requests",
  "seat-claimed": "Seats claimed",
  "refund-request-decided": "Refund Request decisions",
};

function Drawer({ onClose }: { onClose: () => void }) {
  const { items, unread, markRead, markAllRead, lastArrivalId } = useProtoNotifications();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openedAt] = useState(() => Date.now());

  const announcements = items.filter((n) => n.kind === "announcement");
  const activity = useMemo(
    () => groupActivity(items.filter((n) => n.kind !== "announcement")),
    [items]
  );
  const arrivedSinceOpen = items.filter((n) => n.createdAt > openedAt).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const go = (n: ProtoNotification) => {
    markRead(n.id);
    onClose();
    navigate(n.href);
  };

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-[28rem] flex-col border-l bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <button
            onClick={markAllRead}
            disabled={unread === 0}
            className="ml-auto text-xs font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            Mark all as read
          </button>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        {arrivedSinceOpen > 0 && lastArrivalId && (
          <div className="mx-5 mt-3 rounded-full bg-primary px-3 py-1 text-center text-xs font-medium text-primary-foreground">
            {arrivedSinceOpen} new since you opened this
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <section className="px-5 pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Announcements
            </h3>
            {announcements.length === 0 ? (
              <p className="pb-2 text-sm text-muted-foreground">No Announcements.</p>
            ) : (
              <div className="space-y-3">
                {announcements.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => go(n)}
                    className={cn(
                      "block w-full rounded-lg border p-4 text-left transition-colors hover:border-amber-400",
                      !n.readAt
                        ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                        : "bg-card"
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                        {n.scope === "everyone" ? "Everyone on Cadence" : n.course}
                      </span>
                      <span className="text-muted-foreground">{timeAgo(n.createdAt)}</span>
                      {!n.readAt && <span className="ml-auto size-2 rounded-full bg-amber-500" />}
                    </div>
                    <div className="mt-2 font-semibold">{n.title}</div>
                    {n.body && (
                      <div
                        className="prose prose-sm mt-1 line-clamp-3 max-w-none text-muted-foreground dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: marked.parse(n.body, { async: false }) as string }}
                      />
                    )}
                    <div className="mt-2 text-xs text-muted-foreground">
                      {n.actor}, {n.actorRole}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="px-5 py-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Activity
            </h3>
            {activity.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No activity yet. Replies, questions and Refund Request updates show up here.
              </div>
            ) : (
              <ul className="divide-y rounded-lg border">
                {activity.map((g) => {
                  const first = g.items[0];
                  const groupUnread = g.items.some((n) => !n.readAt);
                  if (g.items.length === 1) {
                    return (
                      <ActivityRow key={g.key} n={first} onClick={() => go(first)} />
                    );
                  }
                  const isOpen = expanded[g.key];
                  return (
                    <li key={g.key}>
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [g.key]: !isOpen }))}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent"
                      >
                        <KindIcon kind={first.kind} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className={cn("text-sm", groupUnread && "font-semibold")}>
                            {g.items.length} {PLURAL[first.kind]}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {first.course} · latest {timeAgo(first.createdAt)}
                          </div>
                        </div>
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                      {isOpen && (
                        <ul className="border-t bg-muted/30 pl-6">
                          {g.items.map((n) => (
                            <ActivityRow key={n.id} n={n} onClick={() => go(n)} compact />
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="border-t px-5 py-3">
          <Link
            to="/settings"
            onClick={onClose}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-4" /> Notification settings
          </Link>
        </div>
      </aside>
    </div>
  );
}

function ActivityRow({
  n,
  onClick,
  compact,
}: {
  n: ProtoNotification;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-3 px-3 text-left hover:bg-accent",
          compact ? "py-2" : "py-3",
          !n.readAt && "bg-blue-50/60 dark:bg-blue-950/20"
        )}
      >
        {!compact && <KindIcon kind={n.kind} size="sm" />}
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm", !n.readAt ? "font-semibold" : "text-muted-foreground")}>
            {n.title}
          </div>
          {n.detail && <div className="truncate text-xs text-muted-foreground">{n.detail}</div>}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
      </button>
    </li>
  );
}
