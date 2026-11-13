import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { claimSeat } from "./seats.server";
import { deliverNotification, recordingNotifier } from "./notifier.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/ /g, ".")}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

function buyTeamLicence(buyerId: number, seats: number) {
  const team = db.insert(schema.teams).values({}).returning().get();
  db.insert(schema.teamMembers)
    .values({
      teamId: team.id,
      userId: buyerId,
      role: schema.TeamMemberRole.Admin,
    })
    .run();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: buyerId,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
    })
    .returning()
    .get();
  return Array.from({ length: seats }, (_, i) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  teamAdmin = addStudent("Bossy McBossface");
});

describe("claimSeat", () => {
  it("enrolls the Student and tells the Team Admin their Seat was claimed", async () => {
    const seats = buyTeamLicence(teamAdmin.id, 3);
    const student = addStudent("Emma Wilson");
    const notifier = recordingNotifier();

    const result = claimSeat(db, seats[0].code, student.id, "", NOW);
    if (!result.ok) throw new Error(result.error);
    await deliverNotification(result.notification, notifier);

    expect(result.enrollment.userId).toBe(student.id);
    expect(notifier.triggers).toEqual([
      {
        workflow: "seat-claimed",
        idempotencyKey: `seat-claimed:${seats[0].id}`,
        actor: {
          id: String(student.id),
          name: "Emma Wilson",
          email: "emma.wilson@example.com",
        },
        recipients: [
          {
            id: String(teamAdmin.id),
            name: "Bossy McBossface",
            email: "bossy.mcbossface@example.com",
          },
        ],
        data: {
          title:
            "Emma Wilson claimed a Seat on your Team Licence for Test Course",
          summary: "1 of 3 Seats claimed",
          url: "/team",
          actionLabel: "Manage your Team",
        },
      },
    ]);
  });

  it("counts every Seat claimed so far on that Team Licence", async () => {
    const seats = buyTeamLicence(teamAdmin.id, 3);
    claimSeat(db, seats[0].code, addStudent("Emma Wilson").id, "", NOW);
    const notifier = recordingNotifier();

    const result = claimSeat(
      db,
      seats[1].code,
      addStudent("James Park").id,
      "",
      NOW
    );
    if (!result.ok) throw new Error(result.error);
    await deliverNotification(result.notification, notifier);

    expect(notifier.triggers[0]?.data.summary).toBe("2 of 3 Seats claimed");
  });

  it("does not notify the Team Admin about a Seat they claimed themselves", async () => {
    const seats = buyTeamLicence(teamAdmin.id, 3);
    const notifier = recordingNotifier();

    const result = claimSeat(db, seats[0].code, teamAdmin.id, "", NOW);
    if (!result.ok) throw new Error(result.error);
    await deliverNotification(result.notification, notifier);

    expect(notifier.triggers).toEqual([]);
  });

  it("makes no Notification when the Seat cannot be claimed", () => {
    const seats = buyTeamLicence(teamAdmin.id, 1);
    claimSeat(db, seats[0].code, addStudent("Emma Wilson").id, "", NOW);

    const result = claimSeat(
      db,
      seats[0].code,
      addStudent("James Park").id,
      "",
      NOW
    );

    expect(result).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
  });
});
