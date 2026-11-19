import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLandingPage } from "../index.server";

let db: TestDb;
let instructorId: number;
let categoryId: number;
let baseCourseId: number;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  instructorId = base.instructor.id;
  categoryId = base.category.id;
  baseCourseId = base.course.id;
  db.update(schema.courses)
    .set({ createdAt: "2026-01-01T00:00:00.000Z" })
    .run();
});

// ─── Fixtures ───
// The landing page only reads, so rows go in directly. Kept in one place so a
// schema change touches only this block.

let slugCounter = 0;

function addCourse(
  title: string,
  createdAt: string,
  status: CourseStatus = CourseStatus.Published
) {
  slugCounter += 1;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `course-${slugCounter}`,
      description: `${title} description`,
      salesCopy: markdown(`## ${title}`),
      instructorId,
      categoryId,
      status,
      createdAt,
    })
    .returning()
    .get();
}

function addLessons(courseId: number, perModule: number[]) {
  perModule.forEach((lessonCount, moduleIndex) => {
    const mod = db
      .insert(schema.modules)
      .values({
        courseId,
        title: `Module ${moduleIndex}`,
        position: moduleIndex,
      })
      .returning()
      .get();
    for (let i = 0; i < lessonCount; i++) {
      db.insert(schema.lessons)
        .values({ moduleId: mod.id, title: `Lesson ${i}`, position: i })
        .run();
    }
  });
}

function addCategory(name: string) {
  db.insert(schema.categories).values({ name, slug: name.toLowerCase() }).run();
}

function get(signedIn = false) {
  return createLandingPage(db).get({ signedIn });
}

describe("landingPage.get", () => {
  it("puts the newest published course in the spotlight and the next three in the grid", () => {
    addCourse("Second", "2026-02-01T00:00:00.000Z");
    addCourse("Third", "2026-03-01T00:00:00.000Z");
    addCourse("Fourth", "2026-04-01T00:00:00.000Z");
    addCourse("Fifth", "2026-05-01T00:00:00.000Z");

    const page = get();

    expect(page.spotlight?.title).toBe("Fifth");
    expect(page.featuredCourses.map((c) => c.title)).toEqual([
      "Fourth",
      "Third",
      "Second",
    ]);
  });

  it("leaves drafts and archived courses out of the spotlight, the grid and the count", () => {
    addCourse("Draft", "2026-06-01T00:00:00.000Z", CourseStatus.Draft);
    addCourse("Archived", "2026-07-01T00:00:00.000Z", CourseStatus.Archived);

    const page = get();

    expect(page.spotlight?.title).toBe("Test Course");
    expect(page.featuredCourses).toEqual([]);
    expect(page.totalCourses).toBe(1);
  });

  it("has no spotlight when nothing is published", () => {
    db.update(schema.courses).set({ status: CourseStatus.Draft }).run();

    const page = get();

    expect(page.spotlight).toBeNull();
    expect(page.featuredCourses).toEqual([]);
    expect(page.totalCourses).toBe(0);
  });

  it("counts every published course, not only the ones it shows", () => {
    for (let i = 0; i < 6; i++) {
      addCourse(`Course ${i}`, `2026-02-0${i + 1}T00:00:00.000Z`);
    }

    const page = get();

    expect(page.featuredCourses).toHaveLength(3);
    expect(page.totalCourses).toBe(7);
  });

  it("counts categories", () => {
    addCategory("Design");
    addCategory("Data");

    expect(get().totalCategories).toBe(3);
  });

  it("counts lessons across all of a course's modules", () => {
    const newer = addCourse("Newer", "2026-02-01T00:00:00.000Z");
    addLessons(newer.id, [2, 3]);
    addLessons(baseCourseId, [1]);

    const page = get();

    expect(page.spotlight).toMatchObject({ title: "Newer", lessonCount: 5 });
    expect(page.featuredCourses[0]).toMatchObject({
      title: "Test Course",
      lessonCount: 1,
    });
  });

  it("gives a course with no lessons a count of zero", () => {
    expect(get().spotlight?.lessonCount).toBe(0);
  });

  it("carries the instructor and category names", () => {
    expect(get().spotlight).toMatchObject({
      instructorName: "Test Instructor",
      categoryName: "Programming",
      slug: "test-course",
      description: "A test course",
    });
  });

  it("offers a signed-out visitor an account", () => {
    expect(get(false).secondaryAction).toEqual({
      label: "Create a free account",
      to: "/signup",
    });
  });

  it("sends a signed-in visitor to their dashboard", () => {
    expect(get(true).secondaryAction).toEqual({
      label: "Go to Dashboard",
      to: "/dashboard",
    });
  });
});
