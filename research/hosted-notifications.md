# Which hosted notification services could Cadence use?

Research for [issue #11](https://github.com/cocoshka/cohort-005-project/issues/11), part of the map [#1 Notifications for Cadence](https://github.com/cocoshka/cohort-005-project/issues/1). This note lists facts and trade-offs only. It does not pick a service.

All vendor pages were read on **2026-11-11**. Where a vendor publishes its whole docs as one file (`llms-full.txt`), that file was downloaded and searched. Client transports were checked against the published npm packages. If a fact could not be found in a primary source, this note says so instead of guessing.

## What the map has already decided

- **Delivery** ([#5](https://github.com/cocoshka/cohort-005-project/issues/5)): while Cadence is open and visible, the bell updates within about a second, pushed as the event happens (no polling). Hidden tabs and other tabs only need to be correct when someone looks at them.
- **Email** ([#8](https://github.com/cocoshka/cohort-005-project/issues/8)): every kind except Seat Claimed also goes by email. Refund Request Decided is mandatory. The others are on by default, with an email switch per kind. Announcements have a per-course mute that also hides them from the inbox. Optional emails carry a link that works without logging in.
- **Kinds** ([#4](https://github.com/cocoshka/cohort-005-project/issues/4)): Refund Request Decided, New Refund Request, New Reply, New Question, Seat Claimed, plus Announcements. Any person can receive them.
- **New direction from the user (this session):** the user is open to the vendor **storing** Notifications. Cadence would then keep no Notification tables, and the vendor would hold the feed and the read/unread state.

## What our setup constrains

- **One Node process, one SQLite file** (`docs/adr/0006-one-sqlite-file-through-drizzle.md`). A hosted platform adds no process to Cadence. The browser holds a WebSocket to the vendor, and Cadence's server only makes HTTPS calls out, so `react-router-serve` stays as it is.
- **Cookie sessions** (`app/lib/session.ts`, cookie `cadence_session`, `httpOnly`). The vendor is another origin and never sees this cookie. Every platform below works the same way here: a Cadence loader or resource route reads `getCurrentUserId(request)` and signs a short-lived per-user token with a secret held only on the server. The browser then hands that token to the vendor's SDK. The platforms differ only in the signing scheme.
- **Email already goes through Postmark** (`app/lib/mailer.server.ts`). Without `POSTMARK_SERVER_TOKEN`, it writes JSON files to `.outbox/`. None of the platforms has an offline mode like this (see "Dev and tests" below).
- **Transports only (Pusher, Ably)** are covered in [the realtime-delivery note](https://github.com/cocoshka/cohort-005-project/blob/research/realtime-delivery/research/realtime-delivery.md) and not repeated here.

## Can a pure transport work without Cadence storing anything?

No. Pusher only relays messages and keeps no history. Ably keeps messages for 2 minutes by default, and for 24 hours (Free) or 72 hours to 365 days (paid) with persisted history turned on ([Ably storage](https://ably.com/docs/storage-history/storage)). That is a replay buffer, not an inbox with read state. With a transport, Cadence still needs its own Notification tables. Only the notification platforms below can hold the feed for Cadence.

## The platforms

### Knock

- **Live delivery:** the browser holds a WebSocket to Knock's "managed in-app real-time service". The `new-message` event "will not contain the full message contents, but will include metadata about the updated badge counts. Might be throttled", and the SDK then fetches the feed ([Knock docs](https://docs.knock.app/llms-full.txt), in-app API section). The `@knocklabs/client` package depends on the `phoenix` socket client (npm). `@knocklabs/react` ships `NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton` and hooks ([React overview](https://docs.knock.app/in-app-ui/react/overview)). **Hidden tabs:** the feed can be set to "disconnect socket connections with inactive tabs after a brief delay. If the tab becomes active again, the socket will reconnect" (`auto_manage_socket_connection`, default delay 2 s). This matches the map's rule that hidden tabs only catch up when they are looked at.
- **Pricing** ([pricing](https://knock.app/pricing)): Free is $0 for up to 10,000 messages a month. Starter is $250 a month for 50,000 messages, then $0.005 each. Enterprise is custom. A message is "a single message delivered to a single user on a single channel". The pricing FAQ counts an in-app message plus an email as **2 messages**. Billing is not per connection, and no connection or tab limit is documented. Monthly-notified-user pricing is Enterprise only. Messages in sandbox mode "do not count toward usage".
- **Auth:** "enhanced security mode". The server signs an RS256 JWT with a signing key, with `sub` set to the user id. The Node SDK's `signUserToken` defaults to 3,600 s. With the mode off (the default), anyone holding the public key can act as any user, so Knock says to "Enable enhanced security mode before you go live" ([security](https://docs.knock.app/in-app-ui/security-and-authentication)).
- **Storage, retention and deletion:** Knock stores the feed items and their seen, read and archived state. Feed retention is "Unlimited, but configurable" (pricing page). `users.delete` is a hard delete: "once deleted, the data for that user cannot be recovered". The docs pitch it for GDPR erasure. They also say "in-app messages that reference the user will be replaced by a 'missing user' marker", which covers the case where the deleted user was the actor in someone else's Notification.
- **Email through Cadence's Postmark:** yes. Postmark is a Knock email channel configured with "The API key for your Postmark server", with an optional Postmark sandbox mode ([Postmark integration](https://docs.knock.app/integrations/email/postmark)). **Mandatory kind:** a workflow can turn on "Override recipient preferences": "the workflow will send to all of its channels, regardless of the recipient's preferences".
- **Preferences and mute:** a `PreferenceSet` per user covers workflows, categories and channel types ([preferences](https://docs.knock.app/concepts/preferences)). For a per-course mute, there are object preferences, object subscriptions and "preference conditions", which the docs say support "per-resource muting (example: mute notifications about this task)". The hosted preference center is a Knock-rendered page "accessible via a signed URL", so it can be opened from an email link without logging in to Cadence. It only covers the user's `default` preference set, so a per-course mute needs a custom preference center.
- **Push:** "Knock does not have a first-party web push channel". Web push goes through FCM. Mobile push supports APNs, FCM, Expo, OneSignal and SNS ([push overview](https://docs.knock.app/integrations/push/overview)).
- **Dev and tests:** separate Development and Production environments with their own keys. A channel or test run can be sandboxed, which renders the message without delivering it. Everything needs a network connection and Knock credentials. No offline or local emulator is documented.
- **Data hosting:** no EU region today. The docs say "We expect to support EU data residency by the end of 2026". The docs read here do not name the hosting region. Pricing lists SOC 2 Type 2 and "GDPR certified" on all plans, and HIPAA on Enterprise.

### Novu

- **Live delivery:** the `@novu/js` client "automatically maintains a WebSocket connection for real-time notification updates" ([Novu docs](https://docs.novu.co/llms-full.txt)). npm shows `partysocket` for the cloud and `socket.io-client` for self-hosted. The `<Inbox />` React component includes a bell, the feed, read and archive actions, and a built-in Preferences panel. The docs read here do not describe anything specific to hidden tabs.
- **Pricing** ([pricing](https://novu.co/pricing)): Free is $0 for 10,000 workflow runs a month. Pro is from $30 a month for 30,000 runs. Team is from $250 a month for 250,000 runs. Overage is $1.20 per 1,000 runs on Pro and Team. A run is "one execution of a workflow for one subscriber … regardless of how many steps the workflow contains or how many channels deliver a message". So in-app plus email counts as **1 run**. Subscribers are unlimited, and billing is not per connection.
- **Auth:** HMAC. The server computes `HMAC-SHA256(secretKey, subscriberId)` and passes it as `subscriberHash` to `<Inbox>`. It is a static hash per subscriber, not an expiring token.
- **Storage, retention and deletion:** Novu stores the messages. Inbox messages are kept for 30 days on Free, 90 days on Pro and Team, and a custom period on Enterprise (docs, "Data Storage and Retention"). The API to delete a subscriber "Deletes a subscriber entity from the Novu platform along with associated messages, preferences, and topic subscriptions."
- **Email through Cadence's Postmark:** yes, Postmark is an email provider in the Integrations store. **Mandatory kind:** a workflow marked `critical: true` "bypasses subscriber preferences, skips digest, and runs without delays". `readOnly` only hides the toggle.
- **Preferences and mute:** per-workflow and per-channel preferences, shown in the Inbox panel. Topic "Subscriptions" let subscribers "mute topics, subscribe or unsubscribe to them". A topic per course would model the Announcement mute, and the Inbox "doesn't show those messages" from a muted topic, which matches the map's rule that muting also hides Announcements from the inbox.
- **Push:** through providers (FCM, APNs, OneSignal, Expo, Pushpad, Push Webhook). No first-party VAPID web push.
- **Dev and tests:** a Development environment with its own keys. "Keyless mode" renders the Inbox with no setup, for trying out its look. No offline mode for the API. There is also a self-host option, but the docs list its needs as MongoDB, two Redis clusters and S3, plus API, Worker and WS services (a single VM needs 4 vCPU and 8 GB). That is far heavier than ADR 0006's one-process setup. The repo's `LICENSE` is MIT except the `enterprise/` packages, but the pricing page lists "Self-hosted (Enterprise)", so the two sources disagree.
- **Data hosting:** US by default. The EU (`eu.api.novu.co`, `wss://eu.socket.novu.co`) is available on all plans. The UK, Singapore, Australia, Japan and Korea are Enterprise only. The region is chosen at signup.

### Courier

- **Live delivery:** "Courier hosts the feed, so nothing below needs a database or a websocket server of your own". Real time runs over `wss://realtime.courier.io` ([Courier docs](https://www.courier.com/docs/llms-full.txt)). `@trycourier/courier-react` ships `<CourierInbox />` and `useCourier`. Read and archive state syncs across devices. Nothing specific to hidden tabs is documented.
- **Pricing** ([pricing](https://www.courier.com/pricing)): Developer is free for up to 10,000 sends a month. Business is pay-as-you-go at $0.005 per send. Enterprise is volume pricing. "A send is one template sent to one recipient. A multi-channel template counts as one send, even when it delivers separate messages over email, SMS, push, Slack, and Inbox". So in-app plus email counts as **1 send**. But sends count "whether or not the provider delivers it. … messages blocked by preferences count too", and "Test sends are billable". Billing is not per connection.
- **Auth:** the server calls `POST /auth/issue-token` with a scope such as `user_id:<id> inbox:read:messages inbox:write:events` and a required `expires_in`, then passes the JWT to the client. This is one HTTPS call per token, not local signing.
- **Storage, retention and deletion:** Courier stores the Inbox. "A message stays in the feed until it is archived or expires" (`expiresAt`). Without an expiry, it persists. Deleting a profile "removes all of its stored data". The API reference adds that "List subscriptions and preferences are separate resources, so remove those too if required". The docs read here do not say whether deleting a profile deletes that user's Inbox messages.
- **Email through Cadence's Postmark:** yes. "Courier sends through providers you connect, like SendGrid, Postmark, or Amazon SES", with an optional backup provider for failover. **Mandatory kind:** a subscription topic set to `REQUIRED`: "users can't opt out. Use it for critical messages".
- **Preferences and mute:** subscription topics per notification type, with per-channel routing. A hosted preference page at `view.notificationcenter.app/p/<id>`, where "the id encodes the workspace, brand, and user", so an email link opens it without logging in. Tenants carry their own default preferences. The docs read here describe no per-course mute that also removes Announcements from the Inbox. Lists or one topic per course would be the building blocks.
- **Push:** through providers (FCM, APNs, OneSignal, Expo, and a Custom Provider). No first-party VAPID web push was found.
- **Dev and tests:** Test and Production environments with separate keys. Each Test environment has a "Courier Test Email Provider" that "delivers to your signup address only". Test sends are billed. No offline mode.
- **Data hosting:** US by default. A separate EU datacenter (Ireland), "available on every paid plan: Business and Enterprise" ([datacenters](https://www.courier.com/docs/workspaces/datacenters)). Courier "is a managed cloud platform, with no self-hosted or on-premise option". SOC 2 Type II, HIPAA and PCI DSS.

### MagicBell

- **Live delivery:** WebSocket to `wss://ws.magicbell.com`. This was checked in the `@magicbell/react@1.14.0` package source; its dependencies include `reconnecting-websocket`. Components: `Inbox`, `FloatingInbox`, `InlineNotification`, `ToastContainer`, `UserPreferences`, `WebPushButton` ([React docs](https://www.magicbell.com/docs/libraries/react)). Nothing specific to hidden tabs is documented.
- **Pricing** ([pricing](https://www.magicbell.com/pricing)): Builder is $0 for 1,000 deliveries a month. Startup is $249 a month for 50,000 deliveries, then $0.0025 each. Enterprise is unlimited. "To count deliveries, we add up all the channels a user receives a notification on", so in-app plus email counts as **2 deliveries**. Billing is not per connection.
- **Auth:** a User JWT "signed with your project's Secret Key using the HS256 algorithm", carrying `user_external_id` or `user_email` and `api_key`. It is generated on the backend. The doc examples use a 1-year expiry ([user auth](https://www.magicbell.com/docs/api/authentication/user)).
- **Storage, retention and deletion:** MagicBell stores the notifications with read, seen and archived state. `DELETE /users/{user_id}` "Removes a user and all associated data from the project" ([OpenAPI](https://www.magicbell.com/docs/api/openapi.json)). No retention limit was found in the docs or on the pricing page.
- **Email through Cadence's Postmark:** Postmark is **not** in the provider list (Amazon SES, Mailgun, Ping Email, SMTP, SendGrid) ([channels](https://www.magicbell.com/docs/channels)). The generic SMTP provider is the only route, using Postmark's SMTP service. **Mandatory kind:** the v2 preferences schema has only `categories[].channels[].enabled`. No locked or required flag was found.
- **Preferences and mute:** per category and per channel, plus the `UserPreferences` component. Notifications carry a `topic`, but no per-topic mute endpoint was found in the v2 OpenAPI.
- **Push:** first-party web push. MagicBell "manages VAPID key generation and rotation", and `WebPushButton` uses a service worker that imports MagicBell's `sw.js`. Mobile push supports APNs, FCM and Expo.
- **Dev and tests:** projects (1 on Builder, 5 on Startup). No sandbox or test mode was found. No offline mode.
- **Data hosting:** not stated. The security page says only "secure cloud platforms" and "fully compliant with GDPR". No SOC 2 claim or EU option was found ([security](https://www.magicbell.com/security)).

### SuprSend

- **Live delivery:** Socket.IO WebSocket. Per the changelog, `@suprsend/web-sdk` depends on `socket.io-client` ([SuprSend docs](https://docs.suprsend.com/llms-full.txt)). `@suprsend/react` ships a drop-in `Inbox`. Since v1.3.0 the bell shows a connection-health dot and a banner with "Refresh the page" when SuprSend is unreachable. Nothing specific to hidden tabs is documented.
- **Pricing** ([pricing](https://www.suprsend.com/pricing)): Free is $0 for 10,000 notifications a month, with SuprSend branding on the Inbox. Essentials is $100 a month for 50,000, then $2 per 1,000. Business is $250 a month for 50,000, then $5 per 1,000. Enterprise is custom. "Each channel counts as a separate notification", so in-app plus email counts as **2**. Opt-out drops are not billed. A digest counts as one. Billing is not per connection.
- **Auth:** an ES256 JWT signed on the server with a signing key, with claims `entity_type: "subscriber"`, `entity_id` (the user's `distinct_id`), `iat` and `exp`. The changelog says SuprSend "replaced HMAC authentication with stateless JWT authentication".
- **Storage, retention and deletion:** SuprSend stores the Inbox, with an expiry per message (the docs suggest "an expiry of 15 days or more"). The changelog says each message can have its own expiry. The delete-user API "will take into immediate effect". The security page says it supports "GDPR's right to erasure workflows".
- **Email through Cadence's Postmark:** yes. "You can use your existing Postmark account". **Mandatory kind:** a preference category set to **Can't Unsubscribe** "can't be switched off by a project or by a user", and channels can be marked mandatory.
- **Preferences and mute:** per category and per channel. Tenant-level default preferences. Lists and objects with subscriptions, so an object per course is one way to model the course mute. A preference page with a "Required" view.
- **Push:** first-party web push. "SuprSend generates the VAPID key pair for you", and you add a service worker. Mobile push is also supported.
- **Dev and tests:** a Sandbox workspace with vendors already set up. Email and SMS there only go to up to 5 verified addresses per channel type, while Inbox and Push are unrestricted. "Test Mode" blocks delivery except to listed test channels, or catches it all into one channel. No offline mode.
- **Data hosting:** the docs FAQ says "Each workspace has a data region, including the EU", and the security page says "We support EU-data residency options". The pricing page lists "custom data center region" under Enterprise only, so the plan that includes the EU is unclear. SOC 2 Type II, ISO 27001, GDPR, and HIPAA (BAA on Enterprise). Bring-your-own-cloud is in beta.

### Others looked at and left out

- **Pingram** (where `notificationapi.com/pricing` now redirects): its pricing page covers email, SMS and voice, with no in-app feed or web push ([pricing](https://www.pingram.io/pricing)), so it does not answer this question.
- **OneSignal:** covered for push in [the web-push note](https://github.com/cocoshka/cohort-005-project/blob/research/web-push/research/web-push.md). Courier's docs describe OneSignal's in-app messages as "modal overlays triggered by user activity", not a persistent inbox. So it is not a feed platform. This is a competitor's description and was not checked against OneSignal's own docs.

## If the vendor stores the feed and is down

The SDKs load the feed and badge in the browser straight from the vendor's API and WebSocket. If Cadence keeps no Notification tables, nothing else holds the feed. During an outage, the bell and inbox cannot load, and Cadence has no copy to show instead.

- None of the vendor docs read here describe a fallback or a cached feed that is served while the vendor is down.
- SuprSend is the only one that documents what the user sees: a connection-issue dot and banner on the bell.
- Knock's feed store exposes a `networkStatus` to the app (`useNotificationStore`; the SDK reference lists an `error` state). The others leave error handling to the app.
- **Sending is also affected.** Cadence's server calls the vendor's API to trigger each Notification. If that call fails, nothing is recorded unless Cadence retries or queues it itself.
- **Email is affected too** if it is routed through the vendor. That includes the mandatory Refund Request Decided email: when Postmark sits behind the vendor, the email stops with the vendor even though Postmark is up. Courier's provider failover protects against a Postmark outage, not a Courier outage.
- **Lock-in.** With no Notification tables in Cadence, the history lives only with the vendor. Leaving the vendor means exporting through its API, within its retention window: for example, Novu keeps Inbox messages 30 days on Free.

## Dev and tests without credentials

No platform has an offline mode like `.outbox/`. Each needs network access and a key for its dev, test or sandbox environment, and some count test traffic toward usage (Courier always; Knock unless sandboxed). Following the `MailTransport` pattern, Cadence would need its own `NotificationTransport` interface with a fake that records triggers. But if the vendor stores the feed, a fake on the server does not give the browser an inbox to render. Dev without credentials would show an empty bell, unless the fake also serves a local feed. Novu's keyless mode only previews the look of the Inbox.

## Side-by-side

| | Knock | Novu | Courier | MagicBell | SuprSend |
| --- | --- | --- | --- | --- | --- |
| Live transport | WebSocket (Phoenix) | WebSocket (PartySocket on cloud) | WebSocket | WebSocket | Socket.IO WebSocket |
| React feed component | yes (`@knocklabs/react`) | yes (`<Inbox />`) | yes (`<CourierInbox />`) | yes (`Inbox`) | yes (`Inbox`) |
| Hidden-tab handling documented | yes, socket disconnects and reconnects | no | no | no | no |
| Free tier | 10k messages/mo | 10k runs/mo | 10k sends/mo | 1k deliveries/mo | 10k notifications/mo |
| First paid tier | $250/mo (50k) | from $30/mo (30k) | $0.005/send | $249/mo (50k) | $100/mo (50k) |
| In-app + email for one event counts as | 2 | 1 | 1 | 2 | 2 |
| Billed per connection or tab | no | no | no | no | no |
| Client auth | RS256 JWT, signed locally | HMAC of subscriber id (no expiry) | JWT from `POST /auth/issue-token` | HS256 JWT, signed locally | ES256 JWT, signed locally |
| Feed retention | unlimited, configurable | 30 d Free / 90 d paid | until archived or expired | not stated | per-message expiry |
| Delete a person's data | hard delete via API | deletes messages, prefs, topics | profile delete; prefs and lists separate; Inbox not stated | deletes "all associated data" | immediate delete via API |
| Postmark as email provider | yes | yes | yes | no (generic SMTP only) | yes |
| Mandatory kind | "Override recipient preferences" | `critical: true` | `REQUIRED` topic | none found | "Can't Unsubscribe" |
| Per-course mute building block | object prefs / preference conditions | topic subscriptions with mute | topics / lists / tenants | none found | objects / tenants |
| Login-free preference link | hosted center via signed URL | not found | hosted page with user-encoded id | not found | not checked |
| First-party web push (VAPID) | no (via FCM) | no (via providers) | no (via providers) | yes | yes |
| Offline dev mode | no (sandbox mode, Dev env) | no (keyless preview only) | no (Test env, billed) | no | no (Sandbox, Test Mode) |
| EU hosting | not yet ("by the end of 2026") | yes, all plans | yes, paid plans | not stated | yes per docs; pricing says Enterprise |
| Self-host | no | Community edition (MongoDB, Redis, S3) | no | no | Enterprise / BYOC beta |
| Outage UI documented | feed `networkStatus` for the app to render | no | no | no | connection dot and banner |

## Trade-offs

These are facts about how the options pull against each other, not a recommendation.

- **Billing units differ.** For Cadence's kinds, most events go in-app plus email. Novu and Courier bill that as one unit, while Knock, MagicBell and SuprSend bill two. A free-tier "10k" therefore means about 5k Notifications on Knock and SuprSend, and about 500 on MagicBell.
- **The live path is not the hard part.** All five meet "within about a second" with a managed WebSocket, and none of them bills per tab. The differences are in email routing, preferences, retention, residency and lock-in.
- **Vendor-held storage removes Cadence's tables and also its fallback.** It also puts every Notification's content, including refund decisions, with a third party. Hosting region matters for the privacy review: Novu and Courier offer the EU on self-serve plans, while Knock does not yet.
- **The mandatory Refund Request Decided email** can be expressed on four of the five platforms. If email goes through the vendor, the email depends on the vendor being up. If Cadence keeps calling Postmark directly for that email, the vendor only handles in-app, and there are two places to keep in step.

## Sources

All were read on 2026-11-11.

- Repo: `GLOSSARY.md`, `docs/adr/0006-one-sqlite-file-through-drizzle.md`, `app/lib/mailer.server.ts`, `app/lib/session.ts`; map issue #1; [realtime-delivery note](https://github.com/cocoshka/cohort-005-project/blob/research/realtime-delivery/research/realtime-delivery.md)
- Knock: [pricing](https://knock.app/pricing), [full docs](https://docs.knock.app/llms-full.txt), [React overview](https://docs.knock.app/in-app-ui/react/overview), [security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication), [feeds](https://docs.knock.app/in-app-ui/feeds/overview), [preferences](https://docs.knock.app/concepts/preferences), [Postmark](https://docs.knock.app/integrations/email/postmark), [push](https://docs.knock.app/integrations/push/overview); npm `@knocklabs/client`
- Novu: [pricing](https://novu.co/pricing), [full docs](https://docs.novu.co/llms-full.txt) (workflow runs, regions, data retention, self-hosting, Inbox, critical workflows, topic subscriptions), [repo licence](https://github.com/novuhq/novu/blob/next/LICENSE-ENTERPRISE); npm `@novu/js`
- Courier: [pricing](https://www.courier.com/pricing), [full docs](https://www.courier.com/docs/llms-full.txt) (send counting, Inbox, auth, preferences, profiles), [datacenters](https://www.courier.com/docs/workspaces/datacenters)
- MagicBell: [pricing](https://www.magicbell.com/pricing), [React](https://www.magicbell.com/docs/libraries/react), [user auth](https://www.magicbell.com/docs/api/authentication/user), [channels](https://www.magicbell.com/docs/channels), [OpenAPI](https://www.magicbell.com/docs/api/openapi.json), [web push](https://www.magicbell.com/docs/channels/web_push), [security](https://www.magicbell.com/security); npm `@magicbell/react@1.14.0` source
- SuprSend: [pricing](https://www.suprsend.com/pricing), [full docs](https://docs.suprsend.com/llms-full.txt) (security, Postmark, preferences, auth, Inbox, test mode, sandbox); npm `@suprsend/web-sdk`
- Ably: [storage and history](https://ably.com/docs/storage-history/storage)
- Pingram: [pricing](https://www.pingram.io/pricing)
