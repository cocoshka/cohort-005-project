import { useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/settings";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Switch } from "~/components/ui/switch";
import { UserRole, RefundStatus, users } from "~/db/schema";
import { AlertTriangle, Bell } from "lucide-react";
import { playChime } from "~/components/inbox/notification-sound";
import { data, isRouteErrorResponse, Link } from "react-router";
import { db } from "~/db";
import { eq } from "drizzle-orm";
import { formatPrice } from "~/lib/utils";
import { listRefundRequestsForBuyer } from "~/lib/refunds.server";
import {
  getUserPreferences,
  saveUserPreferences,
} from "~/lib/preferences.server";

const settingsSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("profile"),
    name: z.string().trim().min(1, "Name cannot be empty."),
    bio: z.string().trim().optional(),
  }),
  z.object({
    intent: z.literal("notifications"),
    notificationsEnabled: z.enum(["on", "off"]),
  }),
  z.object({
    intent: z.literal("sound"),
    playNotificationSound: z.enum(["on", "off"]),
  }),
]);

export function meta() {
  return [
    { title: "Settings — Cadence" },
    { name: "description", content: "Edit your profile details" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to edit your details.", {
      status: 401,
    });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser) {
    throw data("User not found.", { status: 404 });
  }

  const refundRequests = listRefundRequestsForBuyer(db, currentUserId);

  return {
    user: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      bio: currentUser.bio,
      role: currentUser.role,
    },
    refundRequests,
    preferences: getUserPreferences(db, currentUserId),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();
  if (!currentUser) {
    throw data("User not found.", { status: 404 });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, settingsSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  if (parsed.data.intent === "notifications") {
    const notificationsEnabled = parsed.data.notificationsEnabled === "on";
    saveUserPreferences(db, currentUser.id, { notificationsEnabled });
    return { success: true, notificationsEnabled };
  }

  if (parsed.data.intent === "sound") {
    const playNotificationSound = parsed.data.playNotificationSound === "on";
    saveUserPreferences(db, currentUser.id, { playNotificationSound });
    return { success: true, playNotificationSound };
  }

  const { name, bio } = parsed.data;

  db
    .update(users)
    .set({ name, email: currentUser.email, bio: bio || null })
    .where(eq(users.id, currentUser.id))
    .returning()
    .get();
  return { success: true };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { user, refundRequests, preferences } = loaderData;
  const openCount = refundRequests.filter(
    (refundRequest) => refundRequest.status === RefundStatus.Open
  ).length;
  const fetcher = useFetcher();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      toast.success("Profile updated successfully.");
    }
    if (fetcher.state === "idle" && fetcher.data?.errors) {
      const firstError = Object.values(fetcher.data.errors)[0] as string | undefined;
      if (firstError) toast.error(firstError);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Settings</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Update your profile details
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <h2 className="text-lg font-semibold">Profile</h2>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="profile" />
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                ref={nameInputRef}
                id="name"
                name="name"
                type="text"
                defaultValue={user.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed.
              </p>
            </div>
            {user.role === UserRole.Instructor && (
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  name="bio"
                  rows={4}
                  defaultValue={user.bio ?? ""}
                  placeholder="Tell students about yourself..."
                />
                <p className="text-xs text-muted-foreground">
                  Your bio is shown on your course pages.
                </p>
              </div>
            )}
            <Button
              type="submit"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "Saving..." : "Save Changes"}
            </Button>
          </fetcher.Form>
        </CardContent>
      </Card>

      <NotificationsCard
        notificationsEnabled={preferences.notificationsEnabled}
        playNotificationSound={preferences.playNotificationSound}
      />

      {refundRequests.length > 0 && (
        <Card className="mt-8 max-w-md">
          <CardHeader>
            <h2 className="text-lg font-semibold">Refund Requests</h2>
            {openCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {openCount === 1
                  ? "One refund request is waiting on us."
                  : `${openCount} refund requests are waiting on us.`}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {refundRequests.map((refundRequest) => (
              <div key={refundRequest.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to={`/courses/${refundRequest.courseSlug}`}
                    className="font-medium hover:underline"
                  >
                    {refundRequest.courseTitle}
                  </Link>
                  <RefundStatusBadge status={refundRequest.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatPrice(refundRequest.amountPaid)} · raised{" "}
                  {new Date(refundRequest.requestedAt).toLocaleDateString()}
                  {refundRequest.resolvedAt && (
                    <>
                      {" "}
                      · decided{" "}
                      {new Date(refundRequest.resolvedAt).toLocaleDateString()}
                    </>
                  )}
                </p>
                <p className="mt-2 text-sm">{refundRequest.reason}</p>
                {refundRequest.decisionNote && (
                  <p className="mt-2 rounded-md bg-muted p-2 text-sm">
                    <span className="font-medium">Our note: </span>
                    {refundRequest.decisionNote}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NotificationsCard({
  notificationsEnabled,
  playNotificationSound,
}: {
  notificationsEnabled: boolean;
  playNotificationSound: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const pending = fetcher.formData?.get("notificationsEnabled");
  const checked =
    typeof pending === "string" ? pending === "on" : notificationsEnabled;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if ("notificationsEnabled" in fetcher.data) {
      toast.success(
        fetcher.data.notificationsEnabled
          ? "Inbox notifications turned on."
          : "Inbox notifications turned off."
      );
    } else if ("errors" in fetcher.data) {
      toast.error("Couldn't save your notification settings.");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Card id="notifications" className="mt-8 max-w-md scroll-mt-6">
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell className="size-4" /> Notifications
        </h2>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="notifications-enabled">Inbox notifications</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              When this is off, nothing new reaches your Inbox. Refund emails
              still arrive.
            </p>
          </div>
          <Switch
            id="notifications-enabled"
            checked={checked}
            onCheckedChange={(on) =>
              fetcher.submit(
                {
                  intent: "notifications",
                  notificationsEnabled: on ? "on" : "off",
                },
                { method: "post" }
              )
            }
          />
        </div>
        {/* Stays usable when Inbox notifications are off: it keeps its own
            value either way. */}
        <SoundSwitch playNotificationSound={playNotificationSound} />
      </CardContent>
    </Card>
  );
}

function SoundSwitch({
  playNotificationSound,
}: {
  playNotificationSound: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const pending = fetcher.formData?.get("playNotificationSound");
  const checked =
    typeof pending === "string" ? pending === "on" : playNotificationSound;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if ("playNotificationSound" in fetcher.data) {
      toast.success(
        fetcher.data.playNotificationSound
          ? "Notification sound turned on."
          : "Notification sound turned off."
      );
    } else if ("errors" in fetcher.data) {
      toast.error("Couldn't save your sound setting.");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="mt-6 flex items-start justify-between gap-4">
      <div>
        <Label htmlFor="play-notification-sound">
          Play a sound for new Notifications
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          A short chime while Cadence is open in a visible tab.
        </p>
        <button
          type="button"
          onClick={playChime}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          Play a test sound
        </button>
      </div>
      <Switch
        id="play-notification-sound"
        checked={checked}
        onCheckedChange={(on) =>
          fetcher.submit(
            { intent: "sound", playNotificationSound: on ? "on" : "off" },
            { method: "post" }
          )
        }
      />
    </div>
  );
}

const REFUND_STATUS_BADGES: Record<
  RefundStatus,
  { label: string; className: string }
> = {
  [RefundStatus.Open]: {
    label: "Open",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  [RefundStatus.Approved]: {
    label: "Approved",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  [RefundStatus.Declined]: {
    label: "Declined",
    className: "bg-muted text-muted-foreground",
  },
};

function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const badge = REFUND_STATUS_BADGES[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 404) {
      title = "User not found";
      message =
        typeof error.data === "string" ? error.data : "User not found.";
    } else {
      title = `Error ${error.status}`;
      message =
        typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
