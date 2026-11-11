// PROTOTYPE — throwaway (see data.ts).
// Variant A: "Sidebar bell + popover".
// - Bell lives in the sidebar header, next to the Cadence wordmark.
// - Count = UNREAD. Clicking a row marks it read and navigates to the source.
// - Popover: one flat list, newest first. Announcements are rows like any other,
//   but tinted amber and carrying their scope + author.
// - No toast on arrival; the bell wiggles once.
// - No separate inbox page: the popover IS the inbox (scrolls).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, BellOff, Check, CircleDot } from "lucide-react";
import { cn } from "~/lib/utils";
import { useProtoNotifications } from "./state";
import { timeAgo } from "./data";
import { CountBadge, KindIcon } from "./shared";

export function VariantABell() {
  const { unread, lastArrivalId } = useProtoNotifications();
  const [open, setOpen] = useState(false);
  const [wiggle, setWiggle] = useState(false);

  useEffect(() => {
    if (!lastArrivalId) return;
    setWiggle(true);
    const t = setTimeout(() => setWiggle(false), 1000);
    return () => clearTimeout(t);
  }, [lastArrivalId]);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className={cn(
          "relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          open && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <Bell className={cn("size-5", wiggle && "animate-bounce")} />
        <CountBadge n={unread} className="absolute -right-1 -top-1" />
      </button>
      {open && <Popover onClose={() => setOpen(false)} />}
    </>
  );
}

function Popover({ onClose }: { onClose: () => void }) {
  const { items, unread, markRead, markUnread, markAllRead } = useProtoNotifications();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (ref.current?.contains(el) || el.closest("[title='Notifications']")) return;
      if (el.closest(".fixed.bottom-4")) return; // prototype bar
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed left-[14.5rem] top-2 z-50 flex max-h-[75vh] w-[24rem] flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="font-semibold">
          Notifications{" "}
          {unread > 0 && (
            <span className="text-sm font-normal text-muted-foreground">· {unread} unread</span>
          )}
        </div>
        <button
          onClick={markAllRead}
          disabled={unread === 0}
          className="text-xs font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          Mark all as read
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <BellOff className="size-8 text-muted-foreground/50" />
          <div className="font-medium">You're all caught up</div>
          <div className="text-sm text-muted-foreground">
            Replies, Refund Request decisions and Announcements will show up here.
          </div>
        </div>
      ) : (
        <ul className="flex-1 divide-y overflow-y-auto">
          {items.map((n) => {
            const isAnn = n.kind === "announcement";
            return (
              <li
                key={n.id}
                className={cn(
                  "group relative flex cursor-pointer gap-3 px-4 py-3 hover:bg-accent",
                  isAnn && "bg-amber-50/70 dark:bg-amber-950/20"
                )}
                onClick={() => {
                  markRead(n.id);
                  onClose();
                  navigate(n.href);
                }}
              >
                <KindIcon kind={n.kind} />
                <div className="min-w-0 flex-1">
                  {isAnn && (
                    <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      Announcement · {n.scope === "everyone" ? "Everyone on Cadence" : n.course}
                    </div>
                  )}
                  <div className={cn("text-sm leading-snug", !n.readAt ? "font-semibold" : "text-muted-foreground")}>
                    {n.title}
                  </div>
                  {n.detail && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{n.detail}</div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {isAnn ? `${n.actor}, ${n.actorRole} · ` : n.course ? `${n.course} · ` : ""}
                    {timeAgo(n.createdAt)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {!n.readAt && <span className="mt-1.5 size-2 rounded-full bg-blue-600" />}
                  <button
                    title={n.readAt ? "Mark as unread" : "Mark as read"}
                    onClick={(e) => {
                      e.stopPropagation();
                      n.readAt ? markUnread(n.id) : markRead(n.id);
                    }}
                    className="invisible rounded p-1 text-muted-foreground hover:bg-background group-hover:visible"
                  >
                    {n.readAt ? <CircleDot className="size-3.5" /> : <Check className="size-3.5" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
