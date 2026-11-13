import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { getUserPreferences, saveUserPreferences } from "./preferences.server";
import {
  notificationPerson,
  recordingNotifier,
  sendNotification,
  type Notification,
} from "./notifier.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("getUserPreferences", () => {
  it("has every preference on for someone who never saved any", () => {
    expect(getUserPreferences(db, base.user.id)).toEqual({
      notificationsEnabled: true,
      playNotificationSound: true,
    });
  });
});

describe("saveUserPreferences", () => {
  it("turns Inbox Notifications off and back on", () => {
    saveUserPreferences(db, base.user.id, { notificationsEnabled: false });
    expect(getUserPreferences(db, base.user.id)).toEqual({
      notificationsEnabled: false,
      playNotificationSound: true,
    });

    saveUserPreferences(db, base.user.id, { notificationsEnabled: true });
    expect(getUserPreferences(db, base.user.id)).toEqual({
      notificationsEnabled: true,
      playNotificationSound: true,
    });
  });

  it("only changes the preference being saved", () => {
    saveUserPreferences(db, base.user.id, { playNotificationSound: false });
    saveUserPreferences(db, base.user.id, { notificationsEnabled: false });

    expect(getUserPreferences(db, base.user.id)).toEqual({
      notificationsEnabled: false,
      playNotificationSound: false,
    });
  });

  it("keeps each person's preferences separate", () => {
    saveUserPreferences(db, base.user.id, { notificationsEnabled: false });

    expect(
      getUserPreferences(db, base.instructor.id).notificationsEnabled
    ).toBe(true);
  });
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/ /g, ".")}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

function someNotification(
  actor: typeof schema.users.$inferSelect,
  recipients: (typeof schema.users.$inferSelect)[]
): Notification {
  return {
    workflow: "any-kind",
    idempotencyKey: "any-kind:1",
    actor: notificationPerson(actor),
    recipients: recipients.map(notificationPerson),
    data: { title: "Something happened", url: "/", actionLabel: "Open" },
  };
}

describe("sendNotification", () => {
  it("leaves out everyone who turned Inbox Notifications off", async () => {
    const emma = addStudent("Emma Wilson");
    const james = addStudent("James Park");
    saveUserPreferences(db, james.id, { notificationsEnabled: false });
    const notifier = recordingNotifier();

    await sendNotification(
      db,
      someNotification(base.user, [emma, james, base.instructor]),
      notifier
    );

    expect(notifier.triggers.map((t) => t.recipients)).toEqual([
      [
        {
          id: String(emma.id),
          name: "Emma Wilson",
          email: "emma.wilson@example.com",
        },
        {
          id: String(base.instructor.id),
          name: "Test Instructor",
          email: "instructor@example.com",
        },
      ],
    ]);
  });

  it("doesn't call Knock when everyone left has Inbox Notifications off", async () => {
    saveUserPreferences(db, base.instructor.id, {
      notificationsEnabled: false,
    });
    const notifier = recordingNotifier();

    await sendNotification(
      db,
      someNotification(base.user, [base.instructor]),
      notifier
    );

    expect(notifier.triggers).toEqual([]);
  });

  it("notifies again once Inbox Notifications are back on", async () => {
    saveUserPreferences(db, base.instructor.id, {
      notificationsEnabled: false,
    });
    saveUserPreferences(db, base.instructor.id, { notificationsEnabled: true });
    const notifier = recordingNotifier();

    await sendNotification(
      db,
      someNotification(base.user, [base.instructor]),
      notifier
    );

    expect(notifier.triggers).toHaveLength(1);
  });

  it("still notifies someone who only turned the sound off", async () => {
    saveUserPreferences(db, base.instructor.id, {
      playNotificationSound: false,
    });
    const notifier = recordingNotifier();

    await sendNotification(
      db,
      someNotification(base.user, [base.instructor]),
      notifier
    );

    expect(notifier.triggers).toHaveLength(1);
  });
});
