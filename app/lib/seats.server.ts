import { and, count, eq, isNotNull } from "drizzle-orm";
import { coupons, courses, enrollments, purchases, users } from "~/db/schema";
import { getSeatAvailability, type Db } from "~/lib/refunds.server";
import { notificationPerson, type Notification } from "~/lib/notifier.server";

// ─── Seats ───
// A Student claims a Seat on a Team Licence with its code. Claiming enrolls
// them and builds a Seat Claimed Notification for the Team Admin, which the
// caller sends in the background (see notifier.server.ts).
//
// Takes the database first, so tests can hand in an in-memory one.

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type ClaimSeatResult =
  | {
      ok: true;
      enrollment: typeof enrollments.$inferSelect;
      notification: Notification;
    }
  | { ok: false; error: string };

export function claimSeat(
  db: Db,
  code: string,
  userId: number,
  userCountry: string,
  now: Date
): ClaimSeatResult {
  const seat = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!seat) {
    return { ok: false, error: "Coupon not found" };
  }

  if (seat.redeemedByUserId !== null) {
    return { ok: false, error: "Coupon has already been redeemed" };
  }

  const availability = getSeatAvailability(db, seat);
  if (availability === "on_hold") {
    return { ok: false, error: SEAT_ON_HOLD };
  }
  if (availability === "refunded") {
    return { ok: false, error: SEAT_REFUNDED };
  }

  const existingEnrollment = db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, seat.courseId)
      )
    )
    .get();

  if (existingEnrollment) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  if (!purchase) {
    return { ok: false, error: "Coupon not found" };
  }

  if (purchase.country && purchase.country !== userCountry) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  const claimer = db.select().from(users).where(eq(users.id, userId)).get();
  const teamAdmin = db
    .select()
    .from(users)
    .where(eq(users.id, purchase.userId))
    .get();
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  if (!claimer || !teamAdmin || !course) {
    return { ok: false, error: "Coupon not found" };
  }

  const enrollment = db.transaction((tx) => {
    tx.update(coupons)
      .set({ redeemedByUserId: userId, redeemedAt: now.toISOString() })
      .where(eq(coupons.id, seat.id))
      .run();

    return tx
      .insert(enrollments)
      .values({ userId, courseId: seat.courseId })
      .returning()
      .get();
  });

  const seatCount = countSeats(db, purchase.id, false);
  const claimedCount = countSeats(db, purchase.id, true);

  return {
    ok: true,
    enrollment,
    notification: {
      workflow: "seat-claimed",
      idempotencyKey: `seat-claimed:${seat.id}`,
      actor: notificationPerson(claimer),
      recipients: [notificationPerson(teamAdmin)],
      data: {
        title: `${claimer.name} claimed a Seat on your Team Licence for ${course.title}`,
        summary: `${claimedCount} of ${seatCount} Seats claimed`,
        url: "/team",
        actionLabel: "Manage your Team",
      },
    },
  };
}

function countSeats(db: Db, purchaseId: number, claimedOnly: boolean): number {
  const row = db
    .select({ value: count() })
    .from(coupons)
    .where(
      claimedOnly
        ? and(
            eq(coupons.purchaseId, purchaseId),
            isNotNull(coupons.redeemedByUserId)
          )
        : eq(coupons.purchaseId, purchaseId)
    )
    .get();
  return row?.value ?? 0;
}
