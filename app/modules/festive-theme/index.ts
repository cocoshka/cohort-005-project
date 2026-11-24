import { IS_FESTIVE_BODY, isFestive } from "./lib/season";

export const FESTIVE_STORAGE_KEY = "cadence-festive";
export const FESTIVE_CLASS = "festive";

/**
 * Whether the Christmas theme shows on this device at `now`.
 * `stored` is the device's saved choice: "on", "off", or anything else
 * for "follow the season" (1 December to 6 January).
 */
export function isFestiveThemeOn(stored: string | null, now: Date): boolean {
  return isFestive(stored, now);
}

/** The value to save when the person flips the switch. */
export function festiveChoice(turnOn: boolean): "on" | "off" {
  return turnOn ? "on" : "off";
}

/**
 * A script for the page head that adds the festive class before first
 * paint, so the theme does not flash in after hydration.
 */
export const festiveThemeScript = `
(function() {
  try {
    var isFestive = function (stored, now) {${IS_FESTIVE_BODY}};
    if (isFestive(localStorage.getItem(${JSON.stringify(FESTIVE_STORAGE_KEY)}), new Date())) {
      document.documentElement.classList.add(${JSON.stringify(FESTIVE_CLASS)});
    }
  } catch (e) {}
})();
`;
