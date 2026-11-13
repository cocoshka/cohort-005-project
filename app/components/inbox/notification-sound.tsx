import { useEffect, useRef } from "react";
import { createChimeGate } from "~/lib/notification-sound";
import { useInbox } from "./inbox-provider";

// ─── Notification sound ───
// One short, soft chime for every kind of Notification, made with Web Audio
// so there's no sound file to ship.

let audio: AudioContext | null = null;

/** Plays the chime. If the browser blocks it, nothing happens. */
export function playChime(): void {
  try {
    audio ??= new AudioContext();
    const start = audio.currentTime;
    for (const [index, frequency] of [880, 1320].entries()) {
      const at = start + index * 0.09;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.4);
    }
  } catch {
    // Blocked or unsupported: skip silently, with no "Enable sound" prompt.
    // A context held back by the autoplay policy doesn't throw; it just
    // stays silent, which is the same thing.
  }
}

/** Plays the chime when the Inbox's unread count goes up live. */
export function NotificationSound({ soundOn }: { soundOn: boolean }) {
  const { unreadCount, loading, markedUnread } = useInbox();
  const gate = useRef(createChimeGate());

  useEffect(() => {
    const play = gate.current.observe({
      unreadCount,
      loading,
      at: Date.now(),
      visible: document.visibilityState === "visible",
      soundOn,
      markedUnread: markedUnread(),
    });
    if (play) playChime();
  }, [unreadCount, loading, soundOn, markedUnread]);

  return null;
}
