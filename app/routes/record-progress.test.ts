import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { addStudent, buyAndEnroll } from "~/test/students";
import { setCurrentUserId, setDevCountry } from "~/lib/session";

// The routes read the app's `db`. Point it at a fresh in-memory database for
// each test.
const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("~/db", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const target = testDb.current as object;
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }
  ),
}));

const { action: lessonAction } = await import(
  "./courses.$slug.lessons.$lessonId"
);
const { action: videoTrackingAction } = await import("./api.video-tracking");

// A discounted (Tier 3) country and a full-price one, so a Purchase made in
// the first and used from the second trips the purchasing-power check.
const DISCOUNTED = "IN";
const FULL_PRICE = "US";

let db: TestDb;
let courseSlug: string;
let courseId: number;
let lessonId: number;
let quizId: number;
let moduleId: number;

/** A session cookie for `userId`, browsing from `country`. */
async function sessionCookie(userId: number, country: string) {
  const first = await setCurrentUserId(new Request("http://test/"), userId);
  const withUser = new Request("http://test/", {
    headers: { Cookie: first.split(";")[0] },
  });
  return (await setDevCountry(withUser, country)).split(";")[0];
}

const STUDENTS = {
  "Student with no Enrollment": async () =>
    sessionCookie(addStudent(db, "Nora None"), FULL_PRICE),
  "Student blocked by the purchasing-power check": async () => {
    const userId = addStudent(db, "Bea Blocked");
    buyAndEnroll(db, userId, courseId, DISCOUNTED);
    return sessionCookie(userId, FULL_PRICE);
  },
};

async function enrolledStudent() {
  const userId = addStudent(db, "Sam Student");
  buyAndEnroll(db, userId, courseId, DISCOUNTED);
  return sessionCookie(userId, DISCOUNTED);
}

function postLessonIntent(cookie: string, fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  const request = new Request(
    `http://test/courses/${courseSlug}/lessons/${lessonId}`,
    { method: "POST", headers: { Cookie: cookie }, body }
  );
  return lessonAction({
    request,
    params: { slug: courseSlug, lessonId: String(lessonId) },
    context: {},
  } as Parameters<typeof lessonAction>[0]);
}

function postWatchEvent(cookie: string, forLessonId: number) {
  const request = new Request("http://test/api/video-tracking", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      lessonId: forLessonId,
      eventType: "play",
      positionSeconds: 12,
    }),
  });
  return videoTrackingAction({
    request,
    params: {},
    context: {},
  } as Parameters<typeof videoTrackingAction>[0]);
}

/** The status of the Response the action threw, or 200 if it returned. */
async function statusOf(result: Promise<unknown>) {
  try {
    await result;
    return 200;
  } catch (error) {
    if (error instanceof Response) return error.status;
    const init = (error as { init?: { status?: number } }).init;
    if (init?.status) return init.status;
    throw error;
  }
}

beforeEach(() => {
  db = createTestDb();
  testDb.current = db;
  const base = seedBaseData(db);
  courseId = base.course.id;
  courseSlug = base.course.slug;
  // Priced and PPP-enabled, so the purchasing-power check is in play.
  db.update(schema.courses).set({ price: 10000, pppEnabled: true }).run();

  const mod = db
    .insert(schema.modules)
    .values({ courseId, title: "Module 1", position: 1 })
    .returning()
    .get();
  moduleId = mod.id;
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
  quizId = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Quiz 1", passingScore: 0.7 })
    .returning()
    .get().id;
});

describe("Record progress gate", () => {
  it("gives a signed-out watch event the guard's 401", async () => {
    const request = new Request("http://test/api/video-tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, eventType: "play", positionSeconds: 1 }),
    });
    await expect(
      videoTrackingAction({
        request,
        params: {},
        context: {},
      } as Parameters<typeof videoTrackingAction>[0])
    ).rejects.toMatchObject({
      data: "You must be logged in.",
      init: { status: 401 },
    });
  });

  describe.each(Object.entries(STUDENTS))("%s", (_name, makeStudent) => {
    it("gets a 403 for mark complete", async () => {
      const cookie = await makeStudent();
      expect(
        await statusOf(postLessonIntent(cookie, { intent: "mark-complete" }))
      ).toBe(403);
    });

    it("gets a 403 for quiz submission", async () => {
      const cookie = await makeStudent();
      expect(
        await statusOf(
          postLessonIntent(cookie, {
            intent: "submit-quiz",
            quizId: String(quizId),
          })
        )
      ).toBe(403);
    });

    it("gets a 403 for watch events", async () => {
      const cookie = await makeStudent();
      expect(await statusOf(postWatchEvent(cookie, lessonId))).toBe(403);
    });
  });

  describe("enrolled, unblocked Student", () => {
    it("can mark a lesson complete", async () => {
      const cookie = await enrolledStudent();
      expect(
        await postLessonIntent(cookie, { intent: "mark-complete" })
      ).toEqual({ success: true });
    });

    it("can submit a quiz", async () => {
      const cookie = await enrolledStudent();
      const result = await postLessonIntent(cookie, {
        intent: "submit-quiz",
        quizId: String(quizId),
      });
      expect(result).toHaveProperty("quizResult");
    });

    it("can send watch events", async () => {
      const cookie = await enrolledStudent();
      expect(await postWatchEvent(cookie, lessonId)).toEqual({ success: true });
    });

    it("gets a 404 for a quiz that belongs to another lesson", async () => {
      const cookie = await enrolledStudent();
      const otherLessonId = db
        .insert(schema.lessons)
        .values({ moduleId: moduleId, title: "Lesson 2", position: 2 })
        .returning()
        .get().id;
      const foreignQuizId = db
        .insert(schema.quizzes)
        .values({ lessonId: otherLessonId, title: "Quiz 2", passingScore: 0.7 })
        .returning()
        .get().id;
      expect(
        await statusOf(
          postLessonIntent(cookie, {
            intent: "submit-quiz",
            quizId: String(foreignQuizId),
          })
        )
      ).toBe(404);
    });

    it("gets a 404 for watch events on an unknown lesson", async () => {
      const cookie = await enrolledStudent();
      expect(await statusOf(postWatchEvent(cookie, 9999))).toBe(404);
    });
  });
});
