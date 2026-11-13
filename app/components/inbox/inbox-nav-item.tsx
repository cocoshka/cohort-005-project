import { NavLink } from "react-router";
import { Inbox } from "lucide-react";
import { cn } from "~/lib/utils";
import { useInbox } from "~/components/inbox/inbox-provider";

/** The first sidebar item for every role, with the unread count. */
export function InboxNavItem() {
  const { unreadCount } = useInbox();

  return (
    <NavLink
      to="/inbox"
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
      {unreadCount > 0 && (
        <span
          className="ml-auto rounded-full bg-primary px-2 text-xs font-semibold leading-5 text-primary-foreground"
          aria-label={`${unreadCount} unread`}
        >
          {unreadCount}
        </span>
      )}
    </NavLink>
  );
}
