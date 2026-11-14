import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";

// The route reads the app's `db`; point it at a fresh in-memory database.
const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("~/db", () => ({
  get db() {
    return holder.db;
  },
}));

const { action, loader } = await import("./courses.$slug");

// A discounted (Tier 3) country and a full-price one, so a Purchase made in
// the first and viewed from the second trips the purchasing-power check.
const DISCOUNTED = "IN";
const FULL_PRICE = "US";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  holder.db = db;
  base = seedBaseData(db);
  // Priced and PPP-enabled, so the purchasing-power check is in play.
  db.update(schema.courses).set({ price: 10000, pppEnabled: true }).run();
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get().id;
}

function buyAndEnroll(userId: number, country: string) {
  db.insert(schema.purchases)
    .values({ userId, courseId: base.course.id, amountPaid: 2500, country })
    .run();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
}

async function requestAs(
  userId: number,
  country: string,
  body?: Record<string, string>
) {
  const setCookie = await setCurrentUserId(
    new Request("http://localhost/"),
    userId
  );
  const url = `http://localhost/courses/${base.course.slug}`;
  const headers = {
    Cookie: setCookie.split(";")[0],
    "CF-IPCountry": country,
  };
  return body
    ? new Request(url, {
        method: "POST",
        headers,
        body: new URLSearchParams(body),
      })
    : new Request(url, { headers });
}

async function rate(userId: number, country: string, rating: number) {
  const request = await requestAs(userId, country, { rating: String(rating) });
  return action({
    request,
    params: { slug: base.course.slug },
    context: {},
  } as Parameters<typeof action>[0]);
}

async function ratingSeenBy(userId: number, country: string) {
  const request = await requestAs(userId, country);
  const result = await loader({
    request,
    params: { slug: base.course.slug },
    context: {},
  } as Parameters<typeof loader>[0]);
  return result.userRating;
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (thrown) {
    const { data, init } = thrown as {
      data: unknown;
      init: { status: number };
    };
    return { status: init.status, message: data };
  }
  throw new Error("Expected the action to refuse");
}

describe("rating a course", () => {
  it("lets an enrolled, unblocked Student rate it", async () => {
    const studentId = addStudent("Sam Student");
    buyAndEnroll(studentId, DISCOUNTED);

    expect(await rate(studentId, DISCOUNTED, 4)).toEqual({
      ok: true,
      error: null,
    });
    expect(await ratingSeenBy(studentId, DISCOUNTED)).toBe(4);
  });

  it("refuses an enrolled Student blocked by the purchasing-power check", async () => {
    const studentId = addStudent("Bea Blocked");
    buyAndEnroll(studentId, DISCOUNTED);

    expect(await refusal(rate(studentId, FULL_PRICE, 5))).toEqual({
      status: 403,
      message: "You must be enrolled in this course to rate it.",
    });
    expect(await ratingSeenBy(studentId, DISCOUNTED)).toBeNull();
  });

  it("refuses the owning Instructor, even when enrolled", async () => {
    const instructorId = base.instructor.id;
    buyAndEnroll(instructorId, FULL_PRICE);

    expect(await refusal(rate(instructorId, FULL_PRICE, 5))).toEqual({
      status: 403,
      message: "You can't rate your own course.",
    });
    expect(await ratingSeenBy(instructorId, FULL_PRICE)).toBeNull();
  });
});
