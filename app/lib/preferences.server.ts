import { and, eq, inArray } from "drizzle-orm";
import { userPreferences } from "~/db/schema";
import type { Db } from "~/lib/refunds.server";

// ─── Preferences ───
// One row per person, created the first time they save. A missing row means
// every preference is on, so creating a user never has to insert one.
//
// Takes the database first, so tests can hand in an in-memory one.

export type UserPreferences = {
  /** Inbox Notifications. Off leaves the person out of every Knock trigger. */
  notificationsEnabled: boolean;
  playNotificationSound: boolean;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  notificationsEnabled: true,
  playNotificationSound: true,
};

export function getUserPreferences(db: Db, userId: number): UserPreferences {
  const row = db
    .select({
      notificationsEnabled: userPreferences.notificationsEnabled,
      playNotificationSound: userPreferences.playNotificationSound,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .get();
  return row ?? DEFAULT_PREFERENCES;
}

/** Saves the given preferences; the others keep their current value. */
export function saveUserPreferences(
  db: Db,
  userId: number,
  changes: Partial<UserPreferences>
): void {
  if (Object.keys(changes).length === 0) return;
  db.insert(userPreferences)
    .values({ userId, ...changes })
    .onConflictDoUpdate({ target: userPreferences.userId, set: changes })
    .run();
}

/** Ids, out of `userIds`, of the people who turned Inbox Notifications off. */
export function idsWithNotificationsOff(
  db: Db,
  userIds: number[]
): Set<number> {
  if (userIds.length === 0) return new Set();
  const rows = db
    .select({ userId: userPreferences.userId })
    .from(userPreferences)
    .where(
      and(
        inArray(userPreferences.userId, userIds),
        eq(userPreferences.notificationsEnabled, false)
      )
    )
    .all();
  return new Set(rows.map((row) => row.userId));
}
