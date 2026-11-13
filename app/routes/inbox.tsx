import { Link, data } from "react-router";
import { Inbox as InboxIcon } from "lucide-react";
import type { Route } from "./+types/inbox";
import { getCurrentUserId } from "~/lib/session";
import { useInbox } from "~/components/inbox/inbox-provider";
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

export default function InboxPage() {
  const { enabled, loading, items } = useInbox();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold">Inbox</h1>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <InboxIcon className="size-12 text-muted-foreground/40" />
          <p className="font-medium">
            {enabled && loading ? "Loading…" : "Your inbox is empty"}
          </p>
          {!enabled && (
            <p className="text-sm text-muted-foreground">
              Notifications aren't set up here. Add the Knock keys to{" "}
              <code>.env</code> to see them.
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="px-6 py-4">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-2 size-2 shrink-0 rounded-full",
                    item.readAt === null ? "bg-primary" : "bg-transparent"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-4">
                    <p
                      className={cn(
                        "truncate",
                        item.readAt === null && "font-semibold"
                      )}
                    >
                      {item.title}
                    </p>
                    <time
                      dateTime={item.insertedAt}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {new Date(item.insertedAt).toLocaleString()}
                    </time>
                  </div>
                  {item.summary && (
                    <p className="text-sm text-muted-foreground">
                      {item.summary}
                    </p>
                  )}
                  <Link
                    to={item.url}
                    className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
                  >
                    {item.actionLabel}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
