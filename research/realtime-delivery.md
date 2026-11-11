# How could Cadence deliver Notifications in real time?

Research for [issue #2](https://github.com/cocoshka/cohort-005-project/issues/2), part of the map [#1 Notifications for Cadence](https://github.com/cocoshka/cohort-005-project/issues/1). This note lists facts and trade-offs only. It does not pick an option; a later grilling ticket does that.

The question: how does a new Notification reach someone who already has Cadence open? The options compared are loading on each navigation, polling, server-sent events (SSE), WebSockets, and hosted services (Pusher, Ably, and similar).

## What our setup already constrains

These facts come from this repo and from the installed package source (React Router 8.3.0).

- **One Node process, one SQLite file.** ADR 0006 says Cadence "runs as one server process", and "the app cannot run on more than one machine against the same data" (`docs/adr/0006-one-sqlite-file-through-drizzle.md`). Because there is only one process, an in-memory event emitter can tell every open connection about a new Notification. No Redis or other pub/sub broker is needed while that holds. If Cadence ever runs several processes, SSE and WebSockets would need a broker. Polling and hosted services would not.
- **Queries are synchronous and local.** `better-sqlite3` is synchronous ("a loader reads its data without a round trip", ADR 0006). So counting unread Notifications on each request is a local file read, not a network call.
- **Production runs `react-router-serve`** (`"start": "react-router-serve ./build/server/index.js"` in `package.json`). That is React Router's built-in Express server. Its docs say it cannot be customised: "we do not provide options to customize the React Router App Server … If you find you want to customize it, you can migrate to the `@react-router/express` adapter" ([serve docs](https://reactrouter.com/8.3.0/api/other-api/serve.md)). It uses the `compression`, `express.static` and `morgan` middlewares.
- **Dev runs `react-router dev`** (Vite). By default Vite serves plain HTTP/1.1. HTTP/2 is only on when `server.https` is set: "Enable TLS + HTTP/2" ([Vite server options](https://vite.dev/config/server-options)).
- **No production hosting is configured.** The repo has no deploy config (no Fly, Render, Railway or Vercel files). The only Dockerfile is `.sandcastle/Dockerfile`, which is the agent sandbox. So no hosting constraint is known yet. One constraint is implied: ADR 0006 needs one long-lived process with a writable disk, which rules out serverless or edge hosting. Any long-lived process can also hold long-lived connections.
- **Sessions are cookie-based** (`createCookieSessionStorage` in `app/lib/session.ts`). Any same-origin request carries the `cadence_session` cookie, including an `EventSource` or a WebSocket handshake, so the server knows who the user is. A hosted service is a different origin and never sees this cookie. Cadence would need its own endpoint that signs a token for it.
- **There is already a layout loader.** `app/routes/layout.app.tsx` has a `loader` that runs for every page under the app layout. An unread count could be added there.
- **There is already a pattern for running without credentials.** `app/lib/mailer.server.ts` sends through Postmark when `POSTMARK_SERVER_TOKEN` is set. Otherwise it writes each email to `.outbox/`. A hosted real-time service could follow the same transport-interface pattern.

## The options

### 1. Load on each navigation (revalidation)

**How it works.** React Router already re-runs loaders. "Framework Mode with SSR (opt-out): active loaders revalidate on navigations and successful submissions (`Link`, `Form`, `fetcher.submit`)" ([optimize revalidation](https://reactrouter.com/how-to/optimize-revalidation)). An unread count or inbox preview in the layout loader would refresh on every click or form submit.

- **Freshness:** only as fresh as the user's last navigation or submission. Someone reading a long lesson or watching a video sees nothing new until they click.
- **Build and run effort:** lowest. It is one query in an existing loader. No new route, server or dependency.
- **Cost:** no third-party cost. One cheap synchronous SQLite read per navigation.
- **Several tabs:** each tab refreshes on its own navigations. A background tab stays stale until it is used. Reading a Notification in one tab does not update the other tabs.
- **Local dev and tests:** works the same everywhere. Loaders can be tested like any other loader. No credentials needed.
- **Hosting constraint:** none.

### 2. Polling

**How it works.** The client asks again on a timer. React Router has a hook for this: `useRevalidator` re-runs the page's loaders "for reasons outside of normal data mutations like Window focus or polling on an interval" ([useRevalidator](https://reactrouter.com/api/hooks/useRevalidator)). Another way is `useFetcher().load()` on a small resource route that returns only the count, so the whole page is not revalidated.

- **Freshness:** at worst one interval behind (for example 30 s). Shorter intervals mean more requests.
- **Background tabs:** browsers throttle timers in hidden tabs. "Timers such as `setTimeout()` are throttled in background/inactive tabs", and windows are throttled after 30 s in Firefox and 10 s in Chrome ([Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)). The same page names "a dashboard … doesn't want to poll the server for updates when the page isn't visible" as a use case for pausing with `visibilitychange`, then catching up as soon as the tab is visible again.
- **Build and run effort:** low. A timer plus a hook, or a resource route. Ordinary short HTTP requests, so it works through every proxy and CDN.
- **Cost:** no third-party cost. Server load is about (open tabs ÷ interval) requests per second, each a cheap SQLite read.
- **Several tabs:** each tab polls on its own, so N tabs send N requests per interval. `BroadcastChannel` can share results across same-origin tabs. It has been "available across browsers since March 2022" ([BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)).
- **Local dev and tests:** works the same in dev. The endpoint is a normal loader. A test can call it directly.
- **Hosting constraint:** none.
- **Scaling:** this keeps working if Cadence ever runs more than one process, because every poll reads the shared database.

### 3. Server-sent events (SSE)

**How it works.** The browser opens one long-lived `GET` with `EventSource`. The server writes `text/event-stream` messages down it. This is one-way: "you can't send events from a client to a server" ([MDN: Using SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)). Marking a Notification as read would stay a normal action.

**Fit with React Router and `react-router-serve`.** A resource route is "when its module exports a loader or action but does not export a default component", and it can return a raw `Response` ([resource routes](https://reactrouter.com/how-to/resource-routes)). Those docs do not cover streaming bodies. The installed adapter source shows streaming works without a custom server:

- `@react-router/express` calls `res.flushHeaders()` when the response's `Content-Type` matches `text/event-stream` (`node_modules/@react-router/express/dist/index.js`).
- `@react-router/node`'s `writeReadableStreamToWritable` calls `writable.flush()` after every chunk if it exists (`node_modules/@react-router/node/dist/index.js`). The `compression` middleware in `react-router-serve` adds that `res.flush()` method. The compression README warns that it "does not work out of the box with server-sent events" without `res.flush()` (`node_modules/compression/README.md`). The adapter calls it. Another option is sending `Cache-Control: no-transform`, which makes `compression` skip the response (`shouldTransform` in `node_modules/compression/index.js`).
- The adapter aborts `request.signal` when the client disconnects (`res.on("close", () => controller?.abort())`), so the loader can unsubscribe from the in-memory emitter.

**Protocol facts** ([WHATWG HTML: server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)):

- The browser reconnects automatically. The default delay is implementation-defined ("probably in the region of a few seconds"), and the server can change it with a `retry:` field.
- If events carry an `id:`, the browser sends `Last-Event-ID` on reconnect, so the server can send what was missed. A Notification row's id could serve as this.
- "Some legacy proxies are known to drop HTTP connections after a short timeout." The spec recommends a comment line (`:`) "every 15 seconds or so" as a keep-alive.
- A server can stop reconnects by replying 204.

**Connection limit (most relevant to tabs).** "When not used over HTTP/2, SSE suffers from a limitation to the maximum number of open connections … the limit is per browser and is set to a very low number (6)", per browser and domain, and Chrome and Firefox marked it "Won't fix". Over HTTP/2 the default is 100 concurrent streams ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)). Over HTTP/1.1, seven Cadence tabs, or six tabs plus normal page loads, would stall requests. The spec suggests "sharing a single EventSource object using a shared worker". `BroadcastChannel` with one leader tab is another way.

- **Freshness:** effectively instant (the time to write to an open socket). After a drop, it lags by the reconnect delay, and `Last-Event-ID` fills the gap.
- **Build and run effort:** moderate. One resource route, an in-process emitter that the code creating Notifications publishes to, keep-alive comments, and cleanup on `request.signal` abort. No new dependency. Works with `react-router-serve` as it is.
- **Cost:** no third-party cost. One open socket per tab on the Node process, mostly idle.
- **Several tabs:** one connection per tab unless shared. On HTTP/1.1 the six-connection limit is a real ceiling. HTTP/2 needs TLS in front: a reverse proxy or host in production, or `server.https` in Vite dev.
- **Local dev and tests:** no credentials. Dev over plain HTTP/1.1 will hit the six-connection limit with several tabs. A test can call the loader and read the `Response.body` stream. One caution for dev: the serve docs say that in development, `react-router-serve` purges the require cache on every request, so "any values in the module scope will be 'reset'". An in-memory emitter must be a singleton (for example kept on `globalThis`) to survive that, and to survive Vite reloading modules.
- **Hosting constraint:** needs a host and proxy that allow long-lived streaming responses without buffering them. Serverless or edge hosting would rule it out, but ADR 0006 already rules that out. It only works while there is one process, or else it needs a broker (see above).

### 4. WebSockets

**How it works.** A two-way connection: "a two-way interactive communication session between the user's browser and a server" ([MDN WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)). It has been Baseline since July 2015. Cadence only needs server-to-client for Notifications, so the second direction would go unused.

**Fit with our server.** `react-router-serve` exposes no `upgrade` hook, and its docs say to "migrate to the `@react-router/express` adapter" to customise the server ([serve docs](https://reactrouter.com/8.3.0/api/other-api/serve.md)). So this means writing our own `server.js`: Express + `createRequestHandler` + the `ws` library. Then `npm start` changes, and dev needs a way to run the same server (Vite middleware mode, or a separate port). `ws` attaches to an existing HTTP server through `new WebSocketServer({ server })` or `noServer: true` plus the `upgrade` event ([ws README](https://github.com/websockets/ws/blob/master/README.md)). `ws` "does not work in the browser"; the browser uses its native `WebSocket`.

- **Freshness:** instant.
- **Reconnects and liveness:** MDN's API page does not mention automatic reconnection, and the browser `WebSocket` does not reconnect by itself. The app writes reconnect and catch-up logic. Dead connections are found with ping/pong; the `ws` README shows a 30 s heartbeat that terminates clients that do not answer. The browser `WebSocket` "doesn't support backpressure" (MDN), which does not matter at Notification volumes.
- **Build and run effort:** highest of the self-hosted options. A custom server, a new dependency, reconnect logic, heartbeat, and authenticating the upgrade request from the session cookie by hand (it does not go through React Router loaders).
- **Cost:** no third-party cost.
- **Several tabs:** one socket per tab. The HTTP/1.1 six-connection limit that MDN describes for SSE applies to HTTP connections. WebSockets are commonly treated as a separate, higher limit, but the sources read here do not document it. Tabs holding WebSockets "go unthrottled" in the background ([Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)).
- **Local dev and tests:** no credentials, but dev and prod must both run the custom server. Tests need a real socket or a stubbed broadcaster.
- **Hosting constraint:** the host and proxy must support `Upgrade: websocket` and long-lived connections. One process only, or else a broker.

### 5. Hosted services (Pusher Channels, Ably, and similar)

**How it works.** The browser keeps a WebSocket to the vendor. When Cadence creates a Notification, the server also publishes it over HTTPS to the vendor. Cadence's Node server holds no long-lived connections, so `react-router-serve` stays as it is.

**Auth.** Per-person channels must be private. Pusher "will only allow subscription if the connection provides an authorization token signed by your server", from an endpoint you provide (default `/pusher/auth`) ([Pusher: authorizing users](https://pusher.com/docs/channels/server_api/authorizing-users/)). In Cadence that would be a resource route that reads the session cookie.

**Pusher Channels pricing** ([pricing](https://pusher.com/channels/pricing/), read 2026-11-11):

| Plan | Per month | Max concurrent connections | Messages per day |
| --- | --- | --- | --- |
| Sandbox | Free | 100 | 200k |
| Startup | $49 | 500 | 1M |
| Pro | $99 | 2,000 | 4M |
| Business | $299 | 5,000 | 10M |

There are larger tiers up to $1,199 for 30,000 connections, then Enterprise. Messages count both directions: "if you publish one message to 50 subscribers, that's 51 messages". A connection is "a live connected user", and channel subscriptions do not add to the count. Pusher's own blog says "a new connection to our API is created whenever your page is loaded in a new tab", and suggests a shared worker to reduce this ([Pusher blog](https://pusher.com/blog/reduce-websocket-connections-with-shared-workers/); this is a blog post, not the docs). So one person with five tabs uses five of the 100 free connections.

**Ably pricing** ([pricing](https://ably.com/pricing), [limits](https://ably.com/docs/platform/pricing/limits), read 2026-11-11). The pricing page is now built around monthly active users: Free $0 for 500 MAU, Pro $29 for 1K MAU, Business $349 for 1K MAU (both billed annually), and Enterprise custom. The Free package limits are 6,000,000 messages per month, 500 concurrent connections, 500 concurrent channels and 500 messages per second. A single `clientId` can hold at most 10 concurrent connections, so one person's tabs are capped at 10.

**Self-hostable Pusher-protocol server.** Soketi "implements the Pusher Protocol v7" and is AGPL-3.0. Its README says "there were issues with the maintenance and this caused infrequent updates" ([soketi on GitHub](https://github.com/soketi/soketi)). It is a second process to run, so it does not fit ADR 0006's one-server setup any better than self-hosted WebSockets do.

- **Freshness:** instant, plus one HTTPS hop from our server to the vendor.
- **Build and run effort:** low to moderate. A vendor SDK on the client, a publish call on the server, an auth resource route, and a fake transport for dev and tests. Reconnects, heartbeats and fan-out are the vendor's job. It adds an external dependency and an outage surface. If the publish call fails, the Notification is still in SQLite but is not pushed live.
- **Cost:** free tiers cover a small user base. Pusher's free tier caps at 100 concurrent connections, counted per tab. Paid tiers start at $49/month (Pusher) or $29/month billed annually (Ably).
- **Several tabs:** each tab is a connection and counts toward quota, unless a shared worker is used. Pusher presence channels report one member for several tabs, but that is for presence, not billing.
- **Local dev and tests:** needs credentials, or a fake. Following the `.outbox/` pattern, a `RealtimeTransport` interface with a no-op or in-memory implementation when no key is set would let dev and tests run offline. Dev would then show no live updates unless it also falls back to polling or SSE, or someone uses a sandbox key.
- **Hosting constraint:** the fewest. It works on any host, including ones that would buffer or cut long-lived responses, and with several processes. Notification content passes through a third party, which may matter for privacy review.

## Side-by-side

| | Navigation | Polling | SSE | WebSockets | Hosted (Pusher/Ably) |
| --- | --- | --- | --- | --- | --- |
| Freshness | next click | ≤ interval (throttled when hidden) | instant | instant | instant |
| New dependency | none | none | none | `ws` + custom server | vendor SDK + account |
| Works with `react-router-serve` as-is | yes | yes | yes (verified in adapter source) | no | yes |
| Third-party cost | $0 | $0 | $0 | $0 | free tier, then from about $29–49/month |
| Several tabs | each tab on its own | N requests per interval | 6-connection cap on HTTP/1.1 unless shared | one socket per tab | each tab uses quota |
| Dev and tests without credentials | yes | yes | yes (6-tab cap on plain HTTP dev) | yes, with custom dev server | needs a fake transport |
| Survives going to several processes | yes | yes | needs a broker | needs a broker | yes |
| Auto reconnect | n/a | n/a | yes, with `Last-Event-ID` | write it yourself | vendor SDK |

## Points that combine

These are facts about how the options fit together, not recommendations.

- Every live option still needs a load path, because a Notification must be stored in SQLite and shown on first page load anyway. Navigation revalidation is the baseline under all the others.
- Live channels drop. After an SSE reconnect without `Last-Event-ID`, a WebSocket reconnect, or a missed vendor publish, revalidating on focus or reconnect fills the gap.
- `BroadcastChannel` (or a `SharedWorker`) lets one tab own the connection or poll and pass results to the others. This reduces both SSE's HTTP/1.1 connection problem and per-tab vendor quota. Reading a Notification in one tab can be broadcast to the others the same way.

## Sources

- Repo: `docs/adr/0006-one-sqlite-file-through-drizzle.md`, `package.json`, `react-router.config.ts`, `app/lib/session.ts`, `app/lib/mailer.server.ts`, `app/routes/layout.app.tsx`
- Installed source (React Router 8.3.0): `node_modules/@react-router/express/dist/index.js`, `node_modules/@react-router/node/dist/index.js`, `node_modules/@react-router/serve/dist/cli.js`, `node_modules/compression/index.js` and `README.md` (1.8.2)
- React Router: [serve](https://reactrouter.com/8.3.0/api/other-api/serve.md), [resource routes](https://reactrouter.com/how-to/resource-routes), [optimize revalidation](https://reactrouter.com/how-to/optimize-revalidation), [useRevalidator](https://reactrouter.com/api/hooks/useRevalidator)
- WHATWG HTML: [server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- MDN: [Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), [WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API), [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel), [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- Vite: [server options](https://vite.dev/config/server-options)
- ws: [README](https://github.com/websockets/ws/blob/master/README.md)
- Pusher: [Channels pricing](https://pusher.com/channels/pricing/), [authorizing users](https://pusher.com/docs/channels/server_api/authorizing-users/), [shared workers blog](https://pusher.com/blog/reduce-websocket-connections-with-shared-workers/)
- Ably: [pricing](https://ably.com/pricing), [limits](https://ably.com/docs/platform/pricing/limits)
- Soketi: [GitHub](https://github.com/soketi/soketi)
