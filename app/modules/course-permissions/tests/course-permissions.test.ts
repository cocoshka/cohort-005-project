import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  decideCoursePermissions,
  type CoursePermissions,
  type Viewer,
} from "../index.server";

// A discounted (Tier 3) country and a full-price one, so a Purchase made in
// the first and viewed from the second trips the purchasing-power check.
const DISCOUNTED = "IN";
const FULL_PRICE = "US";

let db: TestDb;
let courseId: number;
let instructorId: number;

const NONE: CoursePermissions = {
  viewContent: false,
  moderateDiscussions: false,
  manageCourse: false,
  recordProgress: false,
  rateCourse: false,
  purchasingPowerBlock: null,
};

function addUser(name: string, role = UserRole.Student) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
      role,
    })
    .returning()
    .get().id;
}

function enroll(userId: number) {
  db.insert(schema.enrollments).values({ userId, courseId }).run();
}

function purchase(userId: number, country: string) {
  return db
    .insert(schema.purchases)
    .values({ userId, courseId, amountPaid: 2500, country })
    .returning()
    .get().id;
}

type Case = {
  viewer: string;
  setup: () => Viewer;
  expected: CoursePermissions;
};

const cases: Case[] = [
  {
    viewer: "signed out",
    setup: () => ({ userId: null, country: FULL_PRICE }),
    expected: NONE,
  },
  {
    viewer: "Platform Admin",
    setup: () => ({
      userId: addUser("Pat Admin", UserRole.Admin),
      country: FULL_PRICE,
    }),
    expected: {
      ...NONE,
      viewContent: true,
      moderateDiscussions: true,
      manageCourse: true,
    },
  },
  {
    viewer: "owning Instructor",
    setup: () => ({ userId: instructorId, country: FULL_PRICE }),
    expected: {
      ...NONE,
      viewContent: true,
      moderateDiscussions: true,
      manageCourse: true,
    },
  },
  {
    // Owning the course is the rule, whatever the owner's role is now.
    viewer: "owner whose role is now Student",
    setup: () => {
      db.update(schema.users)
        .set({ role: UserRole.Student })
        .where(eq(schema.users.id, instructorId))
        .run();
      return { userId: instructorId, country: FULL_PRICE };
    },
    expected: {
      ...NONE,
      viewContent: true,
      moderateDiscussions: true,
      manageCourse: true,
    },
  },
  {
    viewer: "other Instructor",
    setup: () => ({
      userId: addUser("Olive Other", UserRole.Instructor),
      country: FULL_PRICE,
    }),
    expected: NONE,
  },
  {
    viewer: "enrolled Student",
    setup: () => {
      const userId = addUser("Sam Student");
      purchase(userId, DISCOUNTED);
      enroll(userId);
      return { userId, country: DISCOUNTED };
    },
    expected: {
      ...NONE,
      viewContent: true,
      recordProgress: true,
      rateCourse: true,
    },
  },
  {
    viewer: "enrolled Student blocked by the purchasing-power check",
    setup: () => {
      const userId = addUser("Bea Blocked");
      purchase(userId, DISCOUNTED);
      enroll(userId);
      return { userId, country: FULL_PRICE };
    },
    expected: {
      ...NONE,
      purchasingPowerBlock: {
        purchaseCountry: DISCOUNTED,
        currentCountry: FULL_PRICE,
      },
    },
  },
  {
    viewer: "Student with no Enrollment",
    setup: () => ({ userId: addUser("Nora None"), country: FULL_PRICE }),
    expected: NONE,
  },
  {
    viewer: "Student on a Claimed Seat",
    setup: () => {
      // The Team Admin bought the Team Licence at a discount. The Seat's
      // Student has no Purchase of their own, so the check doesn't apply.
      const teamAdmin = addUser("Tess Team");
      const purchaseId = purchase(teamAdmin, DISCOUNTED);
      const team = db.insert(schema.teams).values({}).returning().get();
      const userId = addUser("Cole Claimed");
      db.insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId,
          code: "SEAT-1",
          purchaseId,
          redeemedByUserId: userId,
          redeemedAt: new Date().toISOString(),
        })
        .run();
      enroll(userId);
      return { userId, country: FULL_PRICE };
    },
    expected: {
      ...NONE,
      viewContent: true,
      recordProgress: true,
      rateCourse: true,
    },
  },
];

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  instructorId = base.instructor.id;
  courseId = base.course.id;
  // Priced and PPP-enabled, so the purchasing-power check is in play.
  db.update(schema.courses).set({ price: 10000, pppEnabled: true }).run();
});

describe("decideCoursePermissions", () => {
  it.each(cases)("decides for $viewer", ({ setup, expected }) => {
    const viewer = setup();
    expect(decideCoursePermissions(db, viewer, courseId)).toEqual(expected);
  });

  it("gives no Course Permissions on an unknown course", () => {
    const userId = addUser("Pat Admin", UserRole.Admin);
    expect(
      decideCoursePermissions(db, { userId, country: FULL_PRICE }, 9999)
    ).toEqual(NONE);
  });

  it("gives no Course Permissions to a user who no longer exists", () => {
    expect(
      decideCoursePermissions(
        db,
        { userId: 9999, country: FULL_PRICE },
        courseId
      )
    ).toEqual(NONE);
  });
});
