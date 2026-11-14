import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  findNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./bookmarks-notes.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfter(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("toggling a Bookmark", () => {
  it("bookmarks a Lesson with no Bookmark, and un-bookmarks it on the second press", () => {
    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on the same Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lessonIds[0] })
        .run()
    ).toThrow();
    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });
});

describe("saving a Note", () => {
  it("creates a Note with the body trimmed", () => {
    expect(
      saveNote(
        db,
        base.user.id,
        lessonIds[0],
        "  Remember the edge case  ",
        NOW
      )
    ).toEqual({
      ok: true,
      note: { body: "Remember the edge case", updatedAt: NOW.toISOString() },
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First draft", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second draft", minutesAfter(5));

    expect(findNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second draft",
      updatedAt: minutesAfter(5).toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("keeps the created time on a re-save", () => {
    saveNote(db, base.user.id, lessonIds[0], "First draft", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second draft", minutesAfter(5));

    const row = db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.userId, base.user.id))
      .get();
    expect(row?.createdAt).toBe(NOW.toISOString());
  });

  it("accepts a Note of exactly 2000 characters", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(2000),
      NOW
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a Note over 2000 characters and stores nothing", () => {
    expect(
      saveNote(db, base.user.id, lessonIds[0], "a".repeat(2001), NOW)
    ).toEqual({ ok: false, error: "A note must be 2000 characters or fewer." });
    expect(findNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("removes the Note when saved empty", () => {
    saveNote(db, base.user.id, lessonIds[0], "Something", NOW);
    expect(saveNote(db, base.user.id, lessonIds[0], "   ", NOW)).toEqual({
      ok: true,
      note: null,
    });
    expect(findNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });
});

describe("the Saved lists", () => {
  it("lists only the Student's own Bookmarks, newest first, with Lesson and Course", () => {
    const other = addStudent("Other");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[1], minutesAfter(1));
    toggleBookmark(db, other.id, lessonIds[2], minutesAfter(2));

    expect(listBookmarks(db, base.user.id)).toEqual([
      expect.objectContaining({
        lessonId: lessonIds[1],
        lessonTitle: "Lesson 2",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({
        lessonId: lessonIds[0],
        lessonTitle: "Lesson 1",
      }),
    ]);
  });

  it("lists only the Student's own Notes, most recently edited first, with Lesson and Course", () => {
    const other = addStudent("Other");
    saveNote(db, base.user.id, lessonIds[0], "Older", NOW);
    saveNote(db, base.user.id, lessonIds[1], "Newer", minutesAfter(1));
    saveNote(db, other.id, lessonIds[2], "Not yours", minutesAfter(2));
    // Editing the older Note brings it back to the top.
    saveNote(db, base.user.id, lessonIds[0], "Older, edited", minutesAfter(3));

    expect(listNotes(db, base.user.id)).toEqual([
      expect.objectContaining({
        body: "Older, edited",
        lessonId: lessonIds[0],
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({ body: "Newer", lessonId: lessonIds[1] }),
    ]);
  });
});

describe("approving a Refund", () => {
  it("leaves the Student's Bookmarks and Notes in place", async () => {
    const notifications = fakeNotifications();
    const admin = db
      .insert(schema.users)
      .values({
        name: "Pat Admin",
        email: "pat@example.com",
        role: UserRole.Admin,
      })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: NOW.toISOString(),
      })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();

    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[0], "Keep me", NOW);

    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "It was not what I expected.",
      NOW,
      notifications
    );
    if (!raised.ok) throw new Error(raised.error);
    const approved = await approveRefundRequest(
      db,
      raised.refundRequestId,
      admin.id,
      null,
      NOW,
      notifications
    );
    expect(approved.ok).toBe(true);

    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(findNote(db, base.user.id, lessonIds[0])?.body).toBe("Keep me");
  });
});
