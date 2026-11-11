// PROTOTYPE — throwaway floating variant switcher. Hidden in production builds.
import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher<V extends string>({
  variants,
  current,
  names,
  onChange,
  children,
}: {
  variants: readonly V[];
  current: V;
  names?: Partial<Record<V, string>>;
  onChange: (v: V) => void;
  children?: React.ReactNode; // extra prototype controls + state readout
}) {
  const i = Math.max(0, variants.indexOf(current));
  const prev = () => onChange(variants[(i - 1 + variants.length) % variants.length]);
  const next = () => onChange(variants[(i + 1) % variants.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-dashed border-fuchsia-500 bg-zinc-900 px-2 py-1.5 text-xs text-white shadow-2xl">
      <span className="pl-2 font-bold uppercase tracking-wider text-fuchsia-400">
        Prototype
      </span>
      <button onClick={prev} className="rounded-full p-1 hover:bg-white/15" title="Previous (←)">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-52 text-center font-medium">
        {current}
        {names?.[current] ? ` (${names[current]})` : ""}
      </span>
      <button onClick={next} className="rounded-full p-1 hover:bg-white/15" title="Next (→)">
        <ChevronRight className="size-4" />
      </button>
      {children && (
        <div className="flex items-center gap-2 border-l border-white/20 pl-2 pr-1">
          {children}
        </div>
      )}
    </div>
  );
}
