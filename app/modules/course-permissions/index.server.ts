import {
  decideCoursePermissions as decide,
  type CoursePermissions,
  type Db,
  type Viewer,
} from "./lib/decide";

export type {
  CoursePermission,
  CoursePermissions,
  PurchasingPowerBlock,
  Viewer,
} from "./lib/decide";

/**
 * Every Course Permission one viewer has on one course, in a single call:
 * View content, Moderate discussions, Manage course, Record progress and
 * Rate course.
 *
 * Never throws. A signed-out viewer, a user who doesn't exist, or an unknown
 * course gets no Course Permissions, so callers keep their own 404s. When View
 * content is refused because of the purchasing-power check,
 * `purchasingPowerBlock` carries the country of purchase and the viewer's
 * current country.
 *
 * To check one permission from a route and throw on refusal, use the guards
 * in `./guards.server`.
 */
export function decideCoursePermissions(
  db: Db,
  viewer: Viewer,
  courseId: number
): CoursePermissions {
  return decide(db, viewer, courseId);
}
