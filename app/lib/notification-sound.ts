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
  /**
   * How many Notifications the person has marked unread themselves so far.
   * Their own Mark as unread raises the count too, but isn't a live arrival.
   */
  markedUnread: number;
};

/**
 * Notifications that arrive less than this apart belong to one burst, and a
 * burst plays the sound once (on its first Notification).
 */
export const BURST_GAP_MS = 5_000;

export function createChimeGate() {
  let previous: UnreadObservation | null = null;
  let lastArrivalAt: number | null = null;
  // Marks as unread not yet matched to the rise in the count they cause.
  let unmatchedMarks = 0;

  return {
    /** True when this change should play the chime. */
    observe(observation: UnreadObservation): boolean {
      const last = previous;
      previous = observation;
      if (last !== null) {
        unmatchedMarks += observation.markedUnread - last.markedUnread;
      }
      // A count that comes in with a page of the feed (the first load, or the
      // catch-up when a hidden tab is shown) isn't a live arrival. Knock's
      // live updates raise the count before fetching the new items.
      if (last === null || last.loading) return false;
      const rise = observation.unreadCount - last.unreadCount;
      if (rise <= 0) return false;

      // The person's own Mark as unread explains this much of the rise.
      const ownMarks = Math.min(rise, unmatchedMarks);
      unmatchedMarks -= ownMarks;
      if (rise === ownMarks) return false;

      const inBurst =
        lastArrivalAt !== null && observation.at - lastArrivalAt < BURST_GAP_MS;
      lastArrivalAt = observation.at;
      return !inBurst && observation.visible && observation.soundOn;
    },
  };
}
