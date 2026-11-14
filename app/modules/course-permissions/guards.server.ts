import { data } from "react-router";
import { db } from "~/db";
import { getCurrentUserId } from "~/lib/session";
import { resolveCountry } from "~/lib/country.server";
import {
  decideCoursePermissions,
  type CoursePermission,
  type CoursePermissions,
  type Viewer,
} from "./lib/decide";

const SIGNED_OUT_MESSAGE = "Select a user from the DevUI panel.";

const DEFAULT_REFUSALS: Record<CoursePermission, string> = {
  viewContent: "You must be enrolled in this course.",
  moderateDiscussions: "Only this course's instructor can do that.",
  manageCourse: "Only this course's instructor can do that.",
  recordProgress: "You must be enrolled in this course to record progress.",
  rateCourse: "You must be enrolled in this course to rate it.",
};

/** The viewer behind a Request: the session's user and their country. */
export async function readViewer(request: Request): Promise<Viewer> {
  const [userId, country] = await Promise.all([
    getCurrentUserId(request),
    resolveCountry(request),
  ]);
  return { userId, country };
}

/**
 * The viewer's Course Permissions on a course, read from the Request. Never
 * throws: for loaders that render something to everyone, such as the lesson
 * paywall preview.
 */
export async function getCoursePermissions(
  request: Request,
  courseId: number
): Promise<{ viewer: Viewer; permissions: CoursePermissions }> {
  const viewer = await readViewer(request);
  return { viewer, permissions: decideCoursePermissions(db, viewer, courseId) };
}

/**
 * Throws 401 when signed out, and 403 unless the viewer has `permission` on
 * the course. Pass `message` to word the 403 yourself; otherwise a default
 * for that permission is used. Use in actions too: loader guards don't
 * protect actions.
 */
export async function requireCoursePermission(
  request: Request,
  courseId: number,
  permission: CoursePermission,
  message?: string
): Promise<{ userId: number; permissions: CoursePermissions }> {
  const { viewer, permissions } = await getCoursePermissions(request, courseId);

  if (viewer.userId === null) {
    throw data(SIGNED_OUT_MESSAGE, { status: 401 });
  }

  if (!permissions[permission]) {
    throw data(message ?? DEFAULT_REFUSALS[permission], { status: 403 });
  }

  return { userId: viewer.userId, permissions };
}
