import { useEffect, useState } from "react";
import { Snowflake } from "lucide-react";
import {
  FESTIVE_CLASS,
  FESTIVE_STORAGE_KEY,
  festiveChoice,
} from "~/modules/festive-theme";

function useFestiveTheme() {
  const [isFestive, setIsFestive] = useState(false);

  useEffect(() => {
    setIsFestive(document.documentElement.classList.contains(FESTIVE_CLASS));
  }, []);

  function toggle() {
    const next = !isFestive;
    setIsFestive(next);
    document.documentElement.classList.toggle(FESTIVE_CLASS, next);
    try {
      localStorage.setItem(FESTIVE_STORAGE_KEY, festiveChoice(next));
    } catch {}
  }

  return { isFestive, toggle };
}

export function FestiveToggle({ variant }: { variant: "sidebar" | "icon" }) {
  const { isFestive, toggle } = useFestiveTheme();
  const label = isFestive ? "Plain Theme" : "Christmas Theme";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isFestive}
        title={
          isFestive
            ? "Switch to the plain theme"
            : "Switch to the Christmas theme"
        }
        className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground aria-pressed:text-primary"
      >
        <Snowflake className="size-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isFestive}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Snowflake className="size-4" />
      {label}
    </button>
  );
}
