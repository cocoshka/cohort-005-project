import { useEffect, useState } from "react";

/**
 * A switch for a class on <html> that a head script set before first paint,
 * such as dark mode. Reads the class after hydration, and on toggle flips it
 * and saves `toStored(next)` under `storageKey` for this device.
 */
export function useRootClassToggle(
  className: string,
  storageKey: string,
  toStored: (on: boolean) => string
) {
  const [isOn, setIsOn] = useState(false);

  useEffect(() => {
    setIsOn(document.documentElement.classList.contains(className));
  }, [className]);

  function toggle() {
    const next = !isOn;
    setIsOn(next);
    document.documentElement.classList.toggle(className, next);
    try {
      localStorage.setItem(storageKey, toStored(next));
    } catch {}
  }

  return { isOn, toggle };
}

/** The dark-mode switch, saved under the key the head script in root.tsx reads. */
export function useDarkMode() {
  return useRootClassToggle("dark", "cadence-theme", (dark) =>
    dark ? "dark" : "light"
  );
}
