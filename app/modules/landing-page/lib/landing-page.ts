import { count, desc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  CourseStatus,
  categories,
  courses,
  lessons,
  modules,
  users,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export const FEATURED_COURSE_LIMIT = 3;

export type LandingCourse = {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  instructorName: string;
  categoryName: string;
  lessonCount: number;
};

export type LandingAction = { label: string; to: string };

export type LandingPage = {
  spotlight: LandingCourse | null;
  featuredCourses: LandingCourse[];
  totalCourses: number;
  totalCategories: number;
  secondaryAction: LandingAction;
};

function newestPublishedCourses(db: Db, limit: number) {
  return db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      coverImageUrl: courses.coverImageUrl,
      instructorName: users.name,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(courses.status, CourseStatus.Published))
    .orderBy(desc(courses.createdAt), desc(courses.id))
    .limit(limit)
    .all();
}

function lessonCountsByCourse(db: Db, courseIds: number[]) {
  const rows = db
    .select({ courseId: modules.courseId, lessonCount: count(lessons.id) })
    .from(modules)
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, courseIds))
    .groupBy(modules.courseId)
    .all();
  return new Map(rows.map((row) => [row.courseId, row.lessonCount]));
}

function countPublishedCourses(db: Db) {
  const [{ total }] = db
    .select({ total: count() })
    .from(courses)
    .where(eq(courses.status, CourseStatus.Published))
    .all();
  return total;
}

function countCategories(db: Db) {
  const [{ total }] = db.select({ total: count() }).from(categories).all();
  return total;
}

export function secondaryActionFor(signedIn: boolean): LandingAction {
  return signedIn
    ? { label: "Go to Dashboard", to: "/dashboard" }
    : { label: "Create a free account", to: "/signup" };
}

export function getLandingPage(db: Db, signedIn: boolean): LandingPage {
  const newest = newestPublishedCourses(db, FEATURED_COURSE_LIMIT + 1);
  const lessonCounts = lessonCountsByCourse(
    db,
    newest.map((course) => course.id)
  );
  const withLessons = newest.map((course) => ({
    ...course,
    lessonCount: lessonCounts.get(course.id) ?? 0,
  }));
  const [spotlight = null, ...featuredCourses] = withLessons;

  return {
    spotlight,
    featuredCourses,
    totalCourses: countPublishedCourses(db),
    totalCategories: countCategories(db),
    secondaryAction: secondaryActionFor(signedIn),
  };
}
