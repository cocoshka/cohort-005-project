import {
  Bell,
  MessageCircleQuestion,
  MessageSquareReply,
  Receipt,
  ReceiptText,
  UserPlus,
} from "lucide-react";
import { cn } from "~/lib/utils";

// One look per Notification kind, keyed by the Knock workflow key. A kind
// this list doesn't know yet still shows, as a plain "Notification".

type KindLook = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
};

const KIND_LOOKS: Record<string, KindLook> = {
  "refund-request-decided": {
    label: "Refund Request decided",
    icon: ReceiptText,
    tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  "new-refund-request": {
    label: "New Refund Request",
    icon: Receipt,
    tint: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
  "new-reply": {
    label: "New reply",
    icon: MessageSquareReply,
    tint: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  "new-question": {
    label: "New question",
    icon: MessageCircleQuestion,
    tint: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  "seat-claimed": {
    label: "Seat claimed",
    icon: UserPlus,
    tint: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  },
};

const FALLBACK_LOOK: KindLook = {
  label: "Notification",
  icon: Bell,
  tint: "bg-muted text-muted-foreground",
};

function lookFor(kind: string): KindLook {
  return KIND_LOOKS[kind] ?? FALLBACK_LOOK;
}

export function kindLabel(kind: string): string {
  return lookFor(kind).label;
}

export function KindIcon({
  kind,
  size = "md",
}: {
  kind: string;
  size?: "sm" | "md";
}) {
  const { icon: Icon, tint } = lookFor(kind);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        size === "sm" ? "size-6" : "size-8",
        tint
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
    </span>
  );
}
