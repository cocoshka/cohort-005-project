import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  deliverNotification,
  fileOutboxNotifier,
  recordingNotifier,
  type Notification,
  type Notifier,
  type NotifierTrigger,
} from "./notifier.server";

const student = { id: 1, name: "Emma Wilson", email: "emma@example.com" };
const teamAdmin = {
  id: 2,
  name: "Bossy McBossface",
  email: "boss@example.com",
};

function seatClaimed(overrides: Partial<Notification> = {}): Notification {
  return {
    workflow: "seat-claimed",
    idempotencyKey: "seat-claimed:7",
    actor: student,
    recipients: [teamAdmin],
    data: {
      title: "Emma Wilson claimed a Seat on your Team Licence for Test Course",
      summary: "3 of 10 Seats claimed",
      url: "/team",
      actionLabel: "Manage your Team",
    },
    ...overrides,
  };
}

describe("deliverNotification", () => {
  it("makes one trigger with the recipients as objects, the actor and the idempotency key", async () => {
    const notifier = recordingNotifier();

    await deliverNotification(seatClaimed(), notifier);

    expect(notifier.triggers).toEqual([
      {
        workflow: "seat-claimed",
        idempotencyKey: "seat-claimed:7",
        actor: { id: "1", name: "Emma Wilson", email: "emma@example.com" },
        recipients: [
          { id: "2", name: "Bossy McBossface", email: "boss@example.com" },
        ],
        data: {
          title:
            "Emma Wilson claimed a Seat on your Team Licence for Test Course",
          summary: "3 of 10 Seats claimed",
          url: "/team",
          actionLabel: "Manage your Team",
        },
      },
    ]);
  });

  it("leaves out the person who acted", async () => {
    const notifier = recordingNotifier();

    await deliverNotification(
      seatClaimed({ recipients: [teamAdmin, student] }),
      notifier
    );

    expect(notifier.triggers[0]?.recipients.map((r) => r.id)).toEqual(["2"]);
  });

  it("names each recipient once", async () => {
    const notifier = recordingNotifier();

    await deliverNotification(
      seatClaimed({ recipients: [teamAdmin, teamAdmin] }),
      notifier
    );

    expect(notifier.triggers[0]?.recipients.map((r) => r.id)).toEqual(["2"]);
  });

  it("does not call the notifier when nobody is left to notify", async () => {
    const notifier = recordingNotifier();

    await deliverNotification(seatClaimed({ recipients: [student] }), notifier);
    await deliverNotification(seatClaimed({ recipients: [] }), notifier);

    expect(notifier.triggers).toEqual([]);
  });

  describe("when Knock fails", () => {
    function failingNotifier(failures: number) {
      const attempts: NotifierTrigger[] = [];
      const notifier: Notifier = {
        async trigger(trigger) {
          attempts.push(trigger);
          if (attempts.length <= failures) throw new Error("Knock is down");
        },
      };
      return { notifier, attempts };
    }

    function fakeClock() {
      const waits: number[] = [];
      return {
        waits,
        sleep: async (ms: number) => {
          waits.push(ms);
        },
      };
    }

    it("retries with the same idempotency key until Knock accepts", async () => {
      const { notifier, attempts } = failingNotifier(2);
      const clock = fakeClock();
      const errors: unknown[] = [];

      await deliverNotification(seatClaimed(), notifier, {
        sleep: clock.sleep,
        logError: (...args) => errors.push(args),
      });

      expect(attempts).toHaveLength(3);
      expect(new Set(attempts.map((a) => a.idempotencyKey))).toEqual(
        new Set(["seat-claimed:7"])
      );
      expect(errors).toEqual([]);
    });

    it("gives up after about a minute, logs it and does not throw", async () => {
      const { notifier, attempts } = failingNotifier(Infinity);
      const clock = fakeClock();
      const errors: unknown[] = [];

      await expect(
        deliverNotification(seatClaimed(), notifier, {
          sleep: clock.sleep,
          logError: (...args) => errors.push(args),
        })
      ).resolves.toBeUndefined();

      const waited = clock.waits.reduce((sum, ms) => sum + ms, 0);
      expect(waited).toBeGreaterThanOrEqual(55_000);
      expect(waited).toBeLessThanOrEqual(65_000);
      expect(attempts.length).toBe(clock.waits.length + 1);
      expect(new Set(attempts.map((a) => a.idempotencyKey))).toEqual(
        new Set(["seat-claimed:7"])
      );
      expect(errors).toHaveLength(1);
    });
  });
});

describe("fileOutboxNotifier", () => {
  it("writes each trigger to a folder when there is no Knock key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));

    await deliverNotification(seatClaimed(), fileOutboxNotifier(directory));

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const written = JSON.parse(
      readFileSync(join(directory, files[0] ?? ""), "utf8")
    );
    expect(written).toMatchObject({
      workflow: "seat-claimed",
      idempotencyKey: "seat-claimed:7",
      recipients: [{ id: "2" }],
    });
  });
});
