import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { UserRole, courses, purchases, users } from "~/db/schema";
import { isEnrolled } from "~/lib/enrollments.server";
import { checkPppAccess } from "~/lib/ppp";

export type Db = BetterSQLite3Database<typeof schema>;

/** Who is asking: a signed-in user, or `userId: null` when signed out. */
export type Viewer = { userId: number | null; country: string | null };

export type CoursePermission =
  | "viewContent"
  | "moderateDiscussions"
  | "manageCourse"
  | "recordProgress"
  | "rateCourse";

export type PurchasingPowerBlock = {
  /** Where the discounted Purchase was made. */
  purchaseCountry: string;
  /** Where the viewer is now. */
  currentCountry: string;
};

export type CoursePermissions = Record<CoursePermission, boolean> & {
  /** Set only when View content is refused by the purchasing-power check. */
  purchasingPowerBlock: PurchasingPowerBlock | null;
};

export const NO_PERMISSIONS: CoursePermissions = {
  viewContent: false,
  moderateDiscussions: false,
  manageCourse: false,
  recordProgress: false,
  rateCourse: false,
  purchasingPowerBlock: null,
};

// Purchase selection is unchanged from the old access module: the viewer's first
// Purchase of the course, whatever kind it is.
function findPurchase(db: Db, userId: number, courseId: number) {
  return db
    .select({ country: purchases.country })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .get();
}

export function decideCoursePermissions(
  db: Db,
  viewer: Viewer,
  courseId: number
): CoursePermissions {
  if (viewer.userId === null) return NO_PERMISSIONS;
  const userId = viewer.userId;

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return NO_PERMISSIONS;

  const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  if (!course) return NO_PERMISSIONS;

  const isOwner = course.instructorId === userId;
  const isOwnerOrPlatformAdmin = isOwner || user.role === UserRole.Admin;
  const enrolled = isEnrolled(db, userId, courseId);

  // The purchasing-power check only applies to enrolled Students. The owning
  // Instructor and Platform Admins are exempt.
  let block: PurchasingPowerBlock | null = null;
  if (enrolled && !isOwnerOrPlatformAdmin) {
    const ppp = checkPppAccess(
      course.price,
      course.pppEnabled,
      findPurchase(db, userId, courseId)?.country ?? null,
      viewer.country
    );
    if (ppp.blocked && ppp.purchaseCountry && ppp.blockedCountry) {
      block = {
        purchaseCountry: ppp.purchaseCountry,
        currentCountry: ppp.blockedCountry,
      };
    }
  }

  const studying = enrolled && block === null;

  return {
    viewContent: isOwnerOrPlatformAdmin || studying,
    moderateDiscussions: isOwnerOrPlatformAdmin,
    manageCourse: isOwnerOrPlatformAdmin,
    recordProgress: studying,
    rateCourse: studying && !isOwner,
    purchasingPowerBlock: block,
  };
}
