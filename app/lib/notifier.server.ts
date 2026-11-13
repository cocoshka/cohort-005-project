import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Knock from "@knocklabs/node";
import { db as appDb } from "~/db";
import { idsWithNotificationsOff } from "~/lib/preferences.server";
import type { Db } from "~/lib/refunds.server";

// ─── Notifications ───
// Knock stores and delivers the in-app feed (ADR 0013). Every kind goes
// through `sendNotification` (or `notifyInBackground` from a route), which
// leaves out people with Inbox Notifications off and hands the rest to
// `deliverNotification`, which talks to a `Notifier`. Knock is used when
// KNOCK_API_KEY is set. Without a key (tests, local dev without Knock) a fake
// is used instead.

export type NotificationPerson = {
  id: number;
  name: string;
  email: string;
};

/** Picks what Knock needs from a Cadence user row. */
export function notificationPerson(
  user: NotificationPerson
): NotificationPerson {
  return { id: user.id, name: user.name, email: user.email };
}

/**
 * Flat data every Notification carries, so the Inbox can render any kind
 * without dashboard templates. Kinds may add their own flat fields.
 */
export type NotificationData = {
  title: string;
  summary?: string;
  url: string;
  actionLabel: string;
  [field: string]: string | number | boolean | null | undefined;
};

export type Notification = {
  /** Knock workflow key, e.g. "seat-claimed". */
  workflow: string;
  /** Same key on every retry, so Knock never creates the Notification twice. */
  idempotencyKey: string;
  /** The person who acted. Never notified about their own action. */
  actor: NotificationPerson;
  recipients: NotificationPerson[];
  data: NotificationData;
};

export type KnockRecipient = { id: string; name: string; email: string };

export type NotifierTrigger = {
  workflow: string;
  idempotencyKey: string;
  actor: KnockRecipient;
  recipients: KnockRecipient[];
  data: NotificationData;
};

export interface Notifier {
  trigger(trigger: NotifierTrigger): Promise<void>;
}

export type RecordingNotifier = Notifier & { triggers: NotifierTrigger[] };

/** In-memory fake for tests: every trigger is kept in `triggers`. */
export function recordingNotifier(): RecordingNotifier {
  const triggers: NotifierTrigger[] = [];
  return {
    triggers,
    async trigger(trigger) {
      triggers.push(trigger);
    },
  };
}

/**
 * Fake for local dev without a Knock key: each trigger is written to
 * `.notifications/` as a JSON file, like emails go to `.outbox/`.
 */
export function outboxNotifier(directory: string): Notifier {
  return {
    async trigger(trigger) {
      mkdirSync(directory, { recursive: true });
      const file = join(
        directory,
        `${Date.now()}-${trigger.idempotencyKey.replace(/[^\w-]/g, "_")}.json`
      );
      writeFileSync(file, JSON.stringify(trigger, null, 2));
    },
  };
}

/** Knock's workflow trigger API. Our own retry loop replaces the SDK's. */
export function knockNotifier(apiKey: string): Notifier {
  const knock = new Knock({ apiKey, maxRetries: 0, timeout: 10_000 });
  return {
    async trigger({ workflow, idempotencyKey, actor, recipients, data }) {
      await knock.workflows.trigger(
        workflow,
        { actor, recipients, data },
        { idempotencyKey }
      );
    },
  };
}

let sharedNotifier: Notifier | undefined;

/** Knock when KNOCK_API_KEY is set, otherwise the `.notifications/` fake. */
export function defaultNotifier(): Notifier {
  if (!sharedNotifier) {
    const apiKey = process.env.KNOCK_API_KEY;
    sharedNotifier = apiKey
      ? knockNotifier(apiKey)
      : outboxNotifier(".notifications");
  }
  return sharedNotifier;
}

function toKnockRecipient(person: NotificationPerson): KnockRecipient {
  return { id: String(person.id), name: person.name, email: person.email };
}

/** Everyone to notify: no duplicates, and never the person who acted. */
function recipientsOtherThanActor(
  notification: Notification
): NotificationPerson[] {
  const seen = new Set<number>([notification.actor.id]);
  return notification.recipients.filter((person) => {
    if (seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
}

/**
 * Waits between attempts after a failed send. They add up to one minute, after
 * which the Notification is logged and dropped. There is no queue table.
 */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 15_000, 15_000];

export type DeliveryOptions = {
  sleep?: (ms: number) => Promise<void>;
  logError?: (...args: unknown[]) => void;
};

function sleepFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends one Notification as one trigger. Leaves out the person who acted, and
 * skips the call when nobody is left. Retries a failure for about a minute
 * with the same idempotency key, then logs and drops it. Never throws.
 */
export async function deliverNotification(
  notification: Notification,
  notifier: Notifier,
  {
    sleep = sleepFor,
    logError = (...args) => console.error(...args),
  }: DeliveryOptions = {}
): Promise<void> {
  const recipients = recipientsOtherThanActor(notification);
  if (recipients.length === 0) return;

  const trigger: NotifierTrigger = {
    workflow: notification.workflow,
    idempotencyKey: notification.idempotencyKey,
    actor: toKnockRecipient(notification.actor),
    recipients: recipients.map(toKnockRecipient),
    data: notification.data,
  };

  for (let attempt = 0; ; attempt++) {
    try {
      await notifier.trigger(trigger);
      return;
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        logError(
          `Dropped the ${trigger.workflow} Notification (${trigger.idempotencyKey}) after retrying for a minute:`,
          error
        );
        return;
      }
      await sleep(delay);
    }
  }
}

/**
 * Sends one Notification to everyone in it who has Inbox Notifications on.
 * People who turned them off are left out of the trigger, so nothing is
 * created for them (turning them back on doesn't bring it back). If nobody is
 * left, Knock isn't called. Never throws.
 */
export async function sendNotification(
  db: Db,
  notification: Notification,
  notifier: Notifier,
  options: DeliveryOptions = {}
): Promise<void> {
  const logError = options.logError ?? ((...args) => console.error(...args));
  let optedOut: Set<number>;
  try {
    optedOut = idsWithNotificationsOff(
      db,
      notification.recipients.map((person) => person.id)
    );
  } catch (error) {
    logError(
      `Dropped the ${notification.workflow} Notification (${notification.idempotencyKey}): could not read preferences:`,
      error
    );
    return;
  }
  await deliverNotification(
    {
      ...notification,
      recipients: notification.recipients.filter(
        (person) => !optedOut.has(person.id)
      ),
    },
    notifier,
    options
  );
}

/**
 * For routes: call after Cadence has saved its own change. Sends in the
 * background so the person's action never waits for, or fails because of,
 * Knock.
 */
export function notifyInBackground(
  notification: Notification,
  notifier: Notifier = defaultNotifier(),
  db: Db = appDb
): void {
  void sendNotification(db, notification, notifier);
}
