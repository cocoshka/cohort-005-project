import { describe, expect, it } from "vitest";
import { createChimeGate, type UnreadObservation } from "./notification-sound";

const SECOND = 1000;

function seen(
  unreadCount: number,
  at: number,
  overrides: Partial<UnreadObservation> = {}
): UnreadObservation {
  return {
    unreadCount,
    at,
    loading: false,
    visible: true,
    soundOn: true,
    markedUnread: 0,
    ...overrides,
  };
}

describe("the Notification sound", () => {
  it("plays once when the unread count goes up live in a visible tab", () => {
    const gate = createChimeGate();
    expect(gate.observe(seen(2, 0))).toBe(false);
    expect(gate.observe(seen(3, 60 * SECOND))).toBe(true);
  });

  it("plays at most once for a burst of Notifications a few seconds apart", () => {
    const gate = createChimeGate();
    gate.observe(seen(0, 0));
    const chimes = [
      gate.observe(seen(1, 60 * SECOND)),
      gate.observe(seen(2, 62 * SECOND)),
      gate.observe(seen(3, 65 * SECOND)),
      gate.observe(seen(5, 68 * SECOND)),
    ];
    expect(chimes).toEqual([true, false, false, false]);
  });

  it("plays again once the burst is over", () => {
    const gate = createChimeGate();
    gate.observe(seen(0, 0));
    gate.observe(seen(1, 60 * SECOND));
    gate.observe(seen(2, 62 * SECOND));
    expect(gate.observe(seen(3, 70 * SECOND))).toBe(true);
  });

  it("doesn't play when the Inbox loads, or catches up after the tab is shown again", () => {
    const gate = createChimeGate();
    gate.observe(seen(0, 0));
    gate.observe(seen(0, 1 * SECOND, { loading: true }));
    expect(gate.observe(seen(4, 2 * SECOND))).toBe(false);

    gate.observe(seen(4, 60 * SECOND, { loading: true }));
    expect(gate.observe(seen(6, 61 * SECOND))).toBe(false);
  });

  it("doesn't play when the person marks a Notification as unread themselves", () => {
    const gate = createChimeGate();
    gate.observe(seen(2, 0));
    expect(gate.observe(seen(3, 60 * SECOND, { markedUnread: 1 }))).toBe(false);
  });

  it("doesn't play when the mark as unread is noticed before the count goes up", () => {
    const gate = createChimeGate();
    gate.observe(seen(2, 0));
    gate.observe(seen(2, 60 * SECOND, { markedUnread: 1 }));
    expect(gate.observe(seen(3, 60 * SECOND, { markedUnread: 1 }))).toBe(false);
  });

  it("still plays for a live Notification after a mark as unread", () => {
    const gate = createChimeGate();
    gate.observe(seen(2, 0));
    gate.observe(seen(3, 60 * SECOND, { markedUnread: 1 }));
    expect(gate.observe(seen(4, 120 * SECOND, { markedUnread: 1 }))).toBe(true);
  });

  it("never plays in a hidden tab", () => {
    const gate = createChimeGate();
    gate.observe(seen(2, 0, { visible: false }));
    expect(gate.observe(seen(3, 60 * SECOND, { visible: false }))).toBe(false);
  });

  it("doesn't play when the sound switch is off", () => {
    const gate = createChimeGate();
    gate.observe(seen(2, 0, { soundOn: false }));
    expect(gate.observe(seen(3, 60 * SECOND, { soundOn: false }))).toBe(false);
  });
});
