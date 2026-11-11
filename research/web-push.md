# What can browser and mobile push do for a web app?

Research for [#3](https://github.com/cocoshka/cohort-005-project/issues/3), under the map [#1 Notifications for Cadence](https://github.com/cocoshka/cohort-005-project/issues/1). Facts and trade-offs only. Whether push goes in v1 is decided in a later ticket.

Researched 2026-11-11. Each claim cites its source; see [Sources](#sources).

## TL;DR

- Web push is a standard: **Push API + Notifications API + a service worker**. It works on every major desktop and Android browser and is Baseline "widely available" since March 2023 [1][2].
- **iOS/iPadOS (16.4+) only delivers push to a web app the user has added to the Home Screen**, and the site must ship a web app manifest with `display: standalone` or `fullscreen` [3][12]. In plain Safari tabs on iPhone, push does nothing.
- Cadence has **neither a service worker nor a web app manifest** today (`public/` holds only `favicon.svg` and `images/`), so both would be new work.
- Self-hosting is cheap: the **`web-push` npm library + a VAPID key pair** sends directly to each browser vendor's push service. Those services charge nothing and need no account [4][5][3]. FCM is also free [6]. OneSignal is free up to limits and then charges per subscriber [7].
- The permission prompt is the main UX risk. You must ask from a user gesture (Firefox enforces it, and so does iOS). Prompts shown without a gesture are rarely accepted (12% vs 30% after interaction, per Chrome data). A "denied" answer is effectively permanent [8][12][3].
- You can test locally without HTTPS, because `localhost` counts as a secure context [9]. Real sends from a dev machine still go out through the vendors' push services.

## How web push works

1. The page registers a **service worker**. Push messages are delivered to it, not to the page, so they arrive even when no Cadence tab is open [1].
2. From a user gesture, the page calls `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. `applicationServerKey` is the server's **VAPID public key** (ECDSA P-256). Chrome and Edge reject the call without `userVisibleOnly: true` [2].
3. The browser returns a **`PushSubscription`**: an endpoint URL on the browser vendor's push service, plus `p256dh` and `auth` keys for encrypting payloads. The page POSTs it to Cadence, which stores it per user and device [1][4].
4. To notify someone, the server encrypts a payload and POSTs it to the endpoint, signed with a VAPID JWT [4][5].
5. The browser wakes the service worker and fires a `push` event. The worker calls `registration.showNotification(title, options)`. A `notificationclick` handler then opens or focuses the right Cadence URL [1][10].
6. `pushsubscriptionchange` fires when a subscription is invalidated or about to expire, so the client can re-subscribe and update the server [1].

Points that matter for implementation:

- **The endpoint is a capability URL.** Anyone who knows it can push to that device, so keep it secret. MDN also says to protect the subscribe flow against CSRF [1].
- **One user, many subscriptions.** Each browser and device gets its own subscription, so the data model is one-to-many: user to push subscriptions.
- **Payload limit:** push services only have to accept **4096 bytes**. Larger payloads may return 413 [11]. Send a short title, body, and URL, not full content.
- **Cleanup:** the push service returns **404 or 410** for a dead subscription. The server should delete it [11]. **429** means rate limited; honour `Retry-After` [11].
- **Delivery options** (in the `web-push` library): `TTL` sets how long the push service holds a message for an offline device (default 4 weeks). `urgency` is `very-low`/`low`/`normal`/`high`. `topic` lets a newer message replace a pending one [4].
- **Notification display options** include `body`, `icon`, `badge`, `image`, `tag` (one tag replaces the previous notification), `renotify`, `requireInteraction`, `actions` (buttons), `data`, and `silent`. Support for `image` and `actions` varies by browser and OS [10].
- **Silent or background push is not a general option.** Chrome and Edge require `userVisibleOnly: true`, so every push must show a notification [2]. Firefox caps pushes that don't show a notification [1].
- **Battery and resource cost:** waking the service worker uses battery. Browsers handle this differently [1].

## Browser support

From MDN browser-compat-data for `PushManager.subscribe` [12]:

| Browser                 | Since | Notes                                                    |
| ----------------------- | ----- | -------------------------------------------------------- |
| Chrome / Chrome Android | 42    | Requires `applicationServerKey`                          |
| Edge                    | 17    | Requires `applicationServerKey`                          |
| Firefox                 | 44    | Since 72, `subscribe()` only works from a user gesture   |
| Firefox Android         | 48    | Since 79, only from a user gesture                       |
| Opera, Samsung Internet | yes   | Same as Chromium                                         |
| Safari (macOS)          | 16    | Notifications need macOS Ventura (13) or later           |
| Safari iOS / iPadOS     | 16.4  | **Only in web apps saved to the Home Screen**            |
| Android WebView         | no    | In-app browsers built on WebView can't subscribe         |

## iOS / iPadOS specifics

From the WebKit announcement [3]:

- Available since **iOS/iPadOS 16.4**, **only for web apps added to the Home Screen**.
- The site needs a **web app manifest** with `display` set to `standalone` or `fullscreen`.
- Permission must be requested **in response to direct user interaction**, such as tapping a "Turn on notifications" button.
- **No Apple Developer account** is needed. It uses the same standard Push API, Notifications API, and service worker as other browsers.
- If you restrict outbound traffic, allow `*.push.apple.com`.
- Notifications respect Focus modes. The **Badging API** (`setAppBadge` / `clearAppBadge`) is available to Home Screen web apps, which could show an unread-count badge.

So, for Cadence:

- An iPhone user who only uses Cadence in a Safari tab **cannot get push at all**. They first have to "Add to Home Screen", which most users don't know to do. The app would need in-app instructions for this.
- Any fallback (the in-app inbox, email) still has to carry everything for these users.

## Permission prompt and UX pitfalls

- **Never prompt on page load or without user interaction.** Chrome data: prompts without a gesture are allowed only **12%** of the time, compared with **30%** after an interaction [8]. Firefox (72+) and iOS go further and block the request unless it comes from a gesture [12][3]. `Notification.requestPermission()` should be called from user interaction [13].
- **Use a pre-prompt.** Show Cadence's own explanation first, for example "Get notified when your Instructor posts an Announcement". Call the browser prompt only if the user says yes. Offer alternatives such as email [8].
- **Denial is sticky.** Once the user blocks notifications, the site can't prompt again. Recovery means the user changes browser site settings. Check the state with the Permissions API (or `Notification.permission`) and show instructions [8][13]. Treat `default` (no decision yet) as denied [13].
- **Chrome's quieter UI:** Chrome automatically puts sites with abusive permission requests or abusive notifications into a quieter prompt UI (Chrome 84+) [14]. In that UI the user sees only an address-bar icon instead of a pop-up.
- **Chrome auto-revocation (announced Oct 2025):** Chrome on Android and desktop removes notification permission from sites with very low engagement and a high volume of notifications. **Installed web apps are exempt** [15].
- **Chrome push rate limits (rolling out from Jan 2026):** Sites that send many pushes relative to engagement are limited to 1,000 messages per minute, with HTTP 429 above that. Google says nearly all legitimate sites are unaffected [16].
- Notification permission can't be requested from cross-origin iframes in Chrome or Firefox [13].

## Self-hosted (VAPID) vs hosted providers

### Self-hosted: `web-push` + VAPID

- **VAPID** (RFC 8292) is how an application server identifies itself to push services [5]:
  - It uses an ES256 JWT with `aud` (the push service origin), `exp` (at most 24h ahead) and `sub` (a `mailto:` or `https:` contact).
  - Subscriptions created with a given public key only accept messages signed by the matching private key.
  - **Rotating the key invalidates all existing subscriptions.** Clients must re-subscribe.
- The **`web-push`** npm library (web-push-libs) [4]:
  - `generateVAPIDKeys()` creates the key pair once. Store it as a secret.
  - `sendNotification(subscription, payload, { TTL, urgency, topic, vapidDetails })` handles the payload encryption and signing.
  - The promise resolves or rejects with the push service's `statusCode`, so the app can act on 404/410/429.
  - It includes a CLI (`web-push generate-vapid-keys`, `web-push send-notification`).
- **Cost:** none beyond Cadence's own server. The vendor push services (Google, Mozilla, Apple) need no account or fee; Apple explicitly needs no Developer account [3].
- **Fit with Cadence's architecture:** sending is an outbound HTTPS call per subscription from the single Node server. Subscriptions could live in a SQLite table through Drizzle. No extra infrastructure is needed, though retries and fan-out for big Announcements would be Cadence's job.
- **Trade-offs:** Cadence owns subscription storage, cleanup, retry and analytics, and there is no dashboard.

### Firebase Cloud Messaging (FCM)

- **Cost:** "No-cost" on both the Spark and Blaze plans [6].
- **Web setup** [17]:
  - The FCM JS SDK requires HTTPS and a `firebase-messaging-sw.js` service worker at the domain root.
  - VAPID keys are configured in the Firebase console, either generated there or imported.
  - It works in browsers that support the Push API. Under the hood it is the same Web Push.
  - The newer flow uses `register()` / `onRegistered()` for a Firebase Installation ID. `getToken()` is deprecated.
- **Trade-offs:**
  - Adds a Google project, a client SDK and service account credentials.
  - Gains a single API that would also reach native apps (out of scope for Cadence).
  - No help with iOS: the same Home Screen limit applies.

### OneSignal

- **Pricing** (as listed when researched) [7]:
  - **Free:** web push capped at 10,000 subscribers per send. Mobile push free for up to 1,000 MAU. 10k emails per month.
  - **Growth:** from **$19/mo**, plus **$0.004 per web push subscriber** (and $0.012 per mobile MAU).
  - **Professional and Enterprise:** custom pricing.
- **Trade-offs:**
  - Gains a dashboard, segmentation, analytics, journeys, and email in one vendor.
  - Adds a third-party SDK and service worker, a vendor that holds subscriber data, per-subscriber cost at scale, and an external dependency for dev and test.

### Summary

|                         | web-push + VAPID                 | FCM                         | OneSignal                                   |
| ----------------------- | -------------------------------- | --------------------------- | ------------------------------------------- |
| Money                   | $0                               | $0                          | Free tier, then $19/mo + $0.004/subscriber  |
| Accounts / creds        | VAPID key pair only              | Google/Firebase project     | OneSignal account                           |
| Subscriber data lives in| Cadence's SQLite                 | Firebase + Cadence          | OneSignal                                   |
| iOS Home Screen limit   | Yes                              | Yes                         | Yes                                         |
| Dashboard / analytics   | None (build it)                  | Basic                       | Rich                                        |
| Offline dev story       | Fully local except the final hop | Needs the Firebase project  | Needs the OneSignal app                     |

## Testing locally

- **HTTPS isn't needed on localhost.** `http://localhost` and `127.0.0.0/8` count as secure contexts, so service workers and the Push API work in dev [9].
- **Chrome DevTools:** Application → Service Workers → **Push** fires a `push` event with no payload. This tests the handler without a server [18].
- **Real end-to-end:** subscribe in a local browser, then send with `web-push send-notification` or from the server.
  - The message still travels through the vendor's push service, so you need an internet connection.
  - No vendor account is needed with plain VAPID.
- **iOS can't be tested on localhost from the phone.** The iPhone has to reach the site, which needs a real HTTPS origin or a tunnel, and the app must be installed to the Home Screen [3].
- **Automated tests:**
  - No browser push service runs in CI.
  - Following the `.outbox/` pattern used for email, one option is a dev and test transport that writes would-be pushes to disk or a table instead of calling the push service.
  - `web-push`'s `generateRequestDetails()` builds the request without sending it, which suits assertions [4].

## Open questions for later tickets (not decided here)

- Is push in v1, given that iOS users only get it after installing the app to the Home Screen?
- Which Notification events are worth a push, as opposed to the inbox and email only?
- When and where do we ask (pre-prompt placement)? How does the preferences page show a blocked state?
- Self-host with `web-push` or use a provider? Where are VAPID keys stored, and what is the plan for rotating them?

## Sources

1. MDN, Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
2. MDN, `PushManager.subscribe()`: https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
3. WebKit blog, "Web Push for Web Apps on iOS and iPadOS": https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
4. web-push library README: https://github.com/web-push-libs/web-push
5. RFC 8292, VAPID: https://datatracker.ietf.org/doc/html/rfc8292
6. Firebase pricing: https://firebase.google.com/pricing
7. OneSignal pricing: https://onesignal.com/pricing
8. web.dev, Permissions best practices: https://web.dev/articles/permissions-best-practices
9. MDN, Secure contexts: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
10. MDN, `ServiceWorkerRegistration.showNotification()`: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification
11. web.dev, Push notifications: common issues and reporting bugs: https://web.dev/articles/push-notifications-common-issues-and-reporting-bugs
12. MDN browser-compat-data, PushManager: https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json
13. MDN, `Notification.requestPermission()`: https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static
14. Chrome for Developers, New in Chrome 84: https://developer.chrome.com/blog/new-in-chrome-84
15. Google blog (Chromium), automatic notification permission revocation (Oct 2025): https://blog.google/chromium/automatic-notification-permission/
16. Chrome for Developers, Web push rate limits: https://developer.chrome.com/blog/web-push-rate-limits
17. Firebase, Set up a JavaScript FCM client: https://firebase.google.com/docs/cloud-messaging/js/client
18. Chrome DevTools, Progressive Web Apps: https://developer.chrome.com/docs/devtools/progressive-web-apps
