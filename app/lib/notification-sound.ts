// ─── Notification sound ───
// Decides when a new Notification plays the chime. The browser side feeds it
// every change to the Inbox's unread count (see NotificationSound in
// app/components/inbox/notification-sound.tsx).

/** One look at the Inbox, taken whenever its unread count or loading changes. */
export type UnreadObservation = {
  unreadCount: number;
  /** Knock is loading a page of the feed (first load or catching up). */
  loading: boolean;
  /** Milliseconds, e.g. `Date.now()`. */
  at: number;
  /** `document.visibilityState === "visible"`. */
  visible: boolean;
  /** The person's "Play a sound for new Notifications" switch. */
  soundOn: boolean;
};

/**
 * Notifications that arrive less than this apart belong to one burst, and a
 * burst plays the sound once (on its first Notification).
 */
export const BURST_GAP_MS = 5_000;

export function createChimeGate() {
  let previous: UnreadObservation | null = null;
  let lastArrivalAt: number | null = null;

  return {
    /** True when this change should play the chime. */
    observe(observation: UnreadObservation): boolean {
      const last = previous;
      previous = observation;
      // A count that comes in with a page of the feed (the first load, or the
      // catch-up when a hidden tab is shown) isn't a live arrival. Knock's
      // live updates raise the count before fetching the new items.
      if (last === null || last.loading) return false;
      if (observation.unreadCount <= last.unreadCount) return false;

      const inBurst =
        lastArrivalAt !== null && observation.at - lastArrivalAt < BURST_GAP_MS;
      lastArrivalAt = observation.at;
      return !inBurst && observation.visible && observation.soundOn;
    },
  };
}
