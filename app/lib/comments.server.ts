import { eq } from "drizzle-orm";
import {
  comments,
  courses,
  lessons,
  modules,
  users,
  UserRole,
} from "~/db/schema";
import type { Db } from "~/lib/refunds.server";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import { notificationPerson, type Notification } from "~/lib/notifier.server";

// ─── Lesson comments ───
// Posting a comment on a lesson saves it and builds the Notification it
// causes, which the caller sends in the background (see notifier.server.ts):
// a Student's top-level comment is a New Question for the course's
// Instructor, and a reply is a New Reply for the top-level comment's author
// only. Nobody is notified about their own comment.
//
// Takes the database first, so tests can hand in an in-memory one.

export type PostCommentResult = {
  comment: typeof comments.$inferSelect;
  /** Null when the comment notifies nobody. */
  notification: Notification | null;
};

function getLessonWithCourse(db: Db, lessonId: number) {
  return db
    .select({
      lessonTitle: lessons.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

function getUser(db: Db, userId: number | null) {
  if (userId === null) return undefined;
  return db.select().from(users).where(eq(users.id, userId)).get();
}

function assertValidBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }
  return trimmed;
}

const EXCERPT_LENGTH = 140;

/** A short, single-line quote of a comment for the Inbox. */
function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const short =
    flat.length > EXCERPT_LENGTH
      ? `${flat.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`
      : flat;
  return `“${short}”`;
}

/**
 * Saves a comment, or a reply when `parentId` is set, and builds the
 * Notification it causes. Throws an Error with a message for the person when
 * the comment isn't valid.
 */
export function postComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string
): PostCommentResult {
  const trimmed = assertValidBody(body);

  const lesson = getLessonWithCourse(db, lessonId);
  if (!lesson) {
    throw new Error("Lesson not found");
  }

  const parent = parentId === null ? null : getComment(db, parentId);
  if (parent === undefined) {
    throw new Error("Parent comment not found");
  }
  if (parent && parent.lessonId !== lessonId) {
    throw new Error("Parent comment belongs to a different lesson");
  }
  if (parent && parent.parentId !== null) {
    throw new Error("Replies can only be one level deep");
  }

  const author = getUser(db, userId);
  if (!author) {
    throw new Error("User not found");
  }

  const comment = db
    .insert(comments)
    .values({ userId, lessonId, parentId, body: trimmed })
    .returning()
    .get();

  const context: NotificationContext = {
    author,
    lessonTitle: lesson.lessonTitle,
    summary: excerpt(trimmed),
    url: `/courses/${lesson.courseSlug}/lessons/${lessonId}#comment-${comment.id}`,
    commentId: comment.id,
  };

  const notification = parent
    ? newReply(context, getUser(db, parent.userId), lesson.instructorId)
    : newQuestion(context, getUser(db, lesson.instructorId));

  return { comment, notification };
}

type Person = typeof users.$inferSelect;

type NotificationContext = {
  author: Person;
  lessonTitle: string;
  summary: string;
  url: string;
  commentId: number;
};

function getComment(db: Db, commentId: number) {
  return db.select().from(comments).where(eq(comments.id, commentId)).get();
}

/** A Student's top-level comment, for the course's Instructor. */
function newQuestion(
  { author, lessonTitle, summary, url, commentId }: NotificationContext,
  instructor: Person | undefined
): Notification | null {
  // Staff asking on a course isn't a question for its Instructor, matching
  // the Questions page.
  if (!instructor || author.role === UserRole.Admin) return null;

  return {
    workflow: "new-question",
    idempotencyKey: `new-question:${commentId}`,
    actor: notificationPerson(author),
    recipients: [notificationPerson(instructor)],
    data: {
      title: `${author.name} asked a question on “${lessonTitle}”`,
      summary,
      url,
      actionLabel: "Answer the question",
    },
  };
}

/** A reply, for the author of the top-level comment only. */
function newReply(
  { author, lessonTitle, summary, url, commentId }: NotificationContext,
  parentAuthor: Person | undefined,
  instructorId: number | null
): Notification | null {
  if (!parentAuthor) return null;

  const replierRole =
    author.role === UserRole.Admin
      ? "Platform Admin"
      : author.id === instructorId
        ? "Instructor"
        : null;
  const replier = replierRole ? `${author.name} (${replierRole})` : author.name;

  return {
    workflow: "new-reply",
    idempotencyKey: `new-reply:${commentId}`,
    actor: notificationPerson(author),
    recipients: [notificationPerson(parentAuthor)],
    data: {
      title: `${replier} replied to your comment on “${lessonTitle}”`,
      summary,
      url,
      actionLabel: "Go to the reply",
      replierRole,
    },
  };
}
