import { Snowflake } from "lucide-react";
import {
  FESTIVE_CLASS,
  FESTIVE_STORAGE_KEY,
  festiveChoice,
} from "~/modules/festive-theme";
import { useRootClassToggle } from "~/components/use-root-class-toggle";

export function FestiveToggle({ variant }: { variant: "sidebar" | "icon" }) {
  const { isOn: isFestive, toggle } = useRootClassToggle(
    FESTIVE_CLASS,
    FESTIVE_STORAGE_KEY,
    festiveChoice
  );

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isFestive}
        aria-label="Christmas theme"
        title="Christmas theme"
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
      Christmas Theme
    </button>
  );
}
