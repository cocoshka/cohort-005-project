// PROTOTYPE — throwaway (see data.ts). Tiny bits shared between variants.
import {
  Megaphone,
  MessageCircleQuestion,
  MessageSquareReply,
  Receipt,
  ReceiptText,
  UserPlus,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { Kind } from "./data";

const ICONS: Record<Kind, React.ComponentType<{ className?: string }>> = {
  "refund-request-decided": ReceiptText,
  "new-refund-request": Receipt,
  "new-reply": MessageSquareReply,
  "new-question": MessageCircleQuestion,
  "seat-claimed": UserPlus,
  announcement: Megaphone,
};

const TINT: Record<Kind, string> = {
  "refund-request-decided": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "new-refund-request": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "new-reply": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "new-question": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "seat-claimed": "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  announcement: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

export function KindIcon({ kind, size = "md" }: { kind: Kind; size?: "sm" | "md" }) {
  const Icon = ICONS[kind];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        size === "sm" ? "size-6" : "size-8",
        TINT[kind]
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
    </span>
  );
}

export function CountBadge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white",
        className
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}
