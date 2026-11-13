import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { postComment } from "./comments.server";
import { deliverNotification, recordingNotifier } from "./notifier.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lesson: typeof schema.lessons.$inferSelect;
let admin: typeof schema.users.$inferSelect;

function addPerson(name: string, role: UserRole = UserRole.Student) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/ /g, ".")}@example.com`,
      role,
    })
    .returning()
    .get();
}

async function notificationsFor(
  result: ReturnType<typeof postComment>
): Promise<ReturnType<typeof recordingNotifier>["triggers"]> {
  const notifier = recordingNotifier();
  if (result.notification) {
    await deliverNotification(result.notification, notifier);
  }
  return notifier.triggers;
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  admin = addPerson("Alex Rivera", UserRole.Admin);
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  lesson = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Hello World", position: 1 })
    .returning()
    .get();
});

describe("New Question", () => {
  it("a Student's top-level comment notifies the course's Instructor", async () => {
    const result = postComment(
      db,
      base.user.id,
      lesson.id,
      null,
      "  How do I run the tests?  "
    );

    expect(await notificationsFor(result)).toEqual([
      {
        workflow: "new-question",
        idempotencyKey: `new-question:${result.comment.id}`,
        actor: {
          id: String(base.user.id),
          name: "Test User",
          email: "test@example.com",
        },
        recipients: [
          {
            id: String(base.instructor.id),
            name: "Test Instructor",
            email: "instructor@example.com",
          },
        ],
        data: {
          title: "Test User asked a question on “Hello World”",
          summary: "“How do I run the tests?”",
          url: `/courses/test-course/lessons/${lesson.id}#comment-${result.comment.id}`,
          actionLabel: "Answer the question",
        },
      },
    ]);
  });

  it("the Instructor commenting on their own lesson notifies nobody", async () => {
    const result = postComment(
      db,
      base.instructor.id,
      lesson.id,
      null,
      "Welcome!"
    );

    expect(await notificationsFor(result)).toEqual([]);
  });

  it("a Platform Admin's top-level comment is not a New Question", async () => {
    const result = postComment(db, admin.id, lesson.id, null, "Heads up");

    expect(result.notification).toBeNull();
  });
});

describe("New Reply", () => {
  it("a reply notifies only the top-level comment's author", async () => {
    const emma = addPerson("Emma Wilson");
    const james = addPerson("James Park");
    const question = postComment(db, emma.id, lesson.id, null, "Why?").comment;
    postComment(db, base.user.id, lesson.id, question.id, "Me too");

    const result = postComment(
      db,
      james.id,
      lesson.id,
      question.id,
      "Because the docs say so."
    );

    expect(await notificationsFor(result)).toEqual([
      {
        workflow: "new-reply",
        idempotencyKey: `new-reply:${result.comment.id}`,
        actor: {
          id: String(james.id),
          name: "James Park",
          email: "james.park@example.com",
        },
        recipients: [
          {
            id: String(emma.id),
            name: "Emma Wilson",
            email: "emma.wilson@example.com",
          },
        ],
        data: {
          title: "James Park replied to your comment on “Hello World”",
          summary: "“Because the docs say so.”",
          url: `/courses/test-course/lessons/${lesson.id}#comment-${result.comment.id}`,
          actionLabel: "Go to the reply",
          replierRole: null,
        },
      },
    ]);
  });

  it("says when the reply came from the course's Instructor", async () => {
    const question = postComment(db, base.user.id, lesson.id, null, "Why?");

    const result = postComment(
      db,
      base.instructor.id,
      lesson.id,
      question.comment.id,
      "Good question."
    );

    const [trigger] = await notificationsFor(result);
    expect(trigger?.data).toMatchObject({
      title:
        "Test Instructor (Instructor) replied to your comment on “Hello World”",
      replierRole: "Instructor",
    });
  });

  it("says when the reply came from a Platform Admin", async () => {
    const question = postComment(db, base.user.id, lesson.id, null, "Why?");

    const result = postComment(
      db,
      admin.id,
      lesson.id,
      question.comment.id,
      "Looking into it."
    );

    const [trigger] = await notificationsFor(result);
    expect(trigger?.data).toMatchObject({
      title:
        "Alex Rivera (Platform Admin) replied to your comment on “Hello World”",
      replierRole: "Platform Admin",
    });
  });

  it("replying to your own comment notifies nobody", async () => {
    const question = postComment(db, base.user.id, lesson.id, null, "Why?");

    const result = postComment(
      db,
      base.user.id,
      lesson.id,
      question.comment.id,
      "Never mind, found it."
    );

    expect(await notificationsFor(result)).toEqual([]);
  });

  it("does not reply to a reply", () => {
    const question = postComment(db, base.user.id, lesson.id, null, "Why?");
    const reply = postComment(
      db,
      admin.id,
      lesson.id,
      question.comment.id,
      "Because."
    );

    expect(() =>
      postComment(db, base.user.id, lesson.id, reply.comment.id, "Thanks")
    ).toThrow("Replies can only be one level deep");
  });
});

describe("when Knock fails", () => {
  it("the comment is still posted", async () => {
    const result = postComment(db, base.user.id, lesson.id, null, "Why?");
    const errors: unknown[] = [];

    await deliverNotification(
      result.notification ?? fail(),
      {
        async trigger() {
          throw new Error("Knock is down");
        },
      },
      { sleep: async () => {}, logError: (...args) => errors.push(args) }
    );

    expect(errors).toHaveLength(1);
    expect(
      db
        .select()
        .from(schema.comments)
        .all()
        .map((c) => c.body)
    ).toEqual(["Why?"]);
  });
});

function fail(): never {
  throw new Error("Expected a Notification");
}
