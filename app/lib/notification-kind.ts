// The kinds of Notification Cadence sends, by Knock workflow key. Shared by
// the server (which triggers them) and the Inbox (which shows them), so it
// isn't a `.server` module.

export type NotificationKind =
  | "seat-claimed"
  | "new-refund-request"
  | "refund-request-decided"
  | "new-question"
  | "new-reply";
