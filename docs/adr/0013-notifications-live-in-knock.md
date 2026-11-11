# Notifications live in Knock, not in Cadence's database

Cadence's in-app Notifications are stored and delivered live by Knock, a hosted notification service. Cadence keeps no Notification tables. When something happens, Cadence saves its own change and then sends Knock the Notification in the background. Knock's WebSocket and React components show it in the bell within about a second. We chose a hosted service so we don't run long-lived connections ourselves, and so live delivery keeps working on any host or with more than one server process, which an in-process emitter could not. Notifications are not important enough to justify owning their storage.

Knock carries only the in-app feed. Cadence still owns everything else:

- **Email** goes through Postmark from `mailer.server.ts`. Knock never sends email. Only refund emails are sent; other Notifications are in-app only.
- **Preferences** are stored and checked by Cadence.

## Considered Options

- **Server-sent events from our own server.** This needed nothing new and worked on `react-router-serve`. We rejected it because it ties live delivery to one process and adds connections for us to run.
- **WebSockets.** Rejected: they need a custom server and our own reconnect logic.
- **Pusher or Ably.** Rejected: they keep no inbox history, so Cadence would still have to store every Notification.
- **Novu.** It was the cheapest past the free tier. We rejected it because its browser login is a fixed hash that never expires, it keeps only 30–90 days of history, and it documents no handling for hidden tabs. We chose Knock for its expiring JWTs, its configurable retention, and its setting to close hidden tabs' connections.

## Consequences

- **Outages:** if Knock is down, the bell and inbox don't load. Cadence retries a failed send for about a minute, then logs it and drops the Notification. There is no queue table.
- **Lock-in:** Notification history lives only in Knock, so switching vendors loses it.
- **Login:** a Cadence route signs a short-lived JWT (RS256) for the browser.
- **Account deletion** must also delete the person from Knock.
- **Dev and tests:** local dev uses a Knock Development environment key. Automated tests, and anyone without a key, use a local fake behind the same `notifier` interface.
- **Cost:** Knock is free up to 10,000 messages a month, then $250 a month.
