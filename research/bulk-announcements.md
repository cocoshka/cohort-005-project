# How do Knock and Postmark handle one message sent to every account?

Research for [#16](https://github.com/cocoshka/cohort-005-project/issues/16), under the map [#1 Notifications for Cadence](https://github.com/cocoshka/cohort-005-project/issues/1). Context: an Announcement to everyone goes to every account, through Knock (in-app, billed per message) and Postmark (email) ([ADR 0013](../docs/adr/0013-notifications-live-in-knock.md)). Facts and trade-offs only. The delivery approach is decided in [#7](https://github.com/cocoshka/cohort-005-project/issues/7).

Researched 2026-11-11 against Knock and Postmark's own docs and pricing pages. Each claim cites its source; see [Sources](#sources).

## TL;DR

- **Knock caps a workflow trigger at 1,000 recipients** and has no bulk-trigger endpoint. The trigger endpoint is rate-limit tier 5 (1,000 requests/second per environment). Sending to N accounts directly means `ceil(N / 1000)` trigger calls [K1][K2][K3].
- **The "Knock fans out for you" option is Objects + subscriptions.** Subscribe every user to one object (for example `announcements/everyone`), then trigger the workflow with that object as the recipient. Knock enqueues a run for the object and for every subscriber. There is no subscriber limit, but you can only add or remove 100 subscribers per call [K4].
- **Audiences and Broadcasts don't fit a server-side send.** You can't trigger a workflow for an existing audience through the API; audience triggers only fire when a user *joins*. Broadcasts are configured and sent from the dashboard (or the Management API), not from the regular API [K5][K6][K7].
- **Billing is the same for every option.** Knock bills one message per user per channel that is actually delivered. Fan-out method, recipient batches, objects and subscriptions are not billed themselves. Skipped steps (preferences, conditions) and bounced or failed messages don't count. An Announcement to everyone costs as many messages as there are users who get it in the bell. Free covers 10,000 messages a month; Starter is $250 a month for 50,000, then $0.005 per message [K8][K9].
- **Postmark has two kinds of stream that never mix.** Transactional streams are for one-to-one, user-triggered mail and "do not support broadcast messages". An email Announcement to everyone is broadcast mail. It needs a Broadcast stream (with account approval), a visible unsubscribe link, and List-Unsubscribe headers. Postmark adds both the link and the headers itself unless you opt into self-managed unsubscribes [P1][P2][P3][P4].
- **Postmark batch: 500 messages per call, 50 MB per call.** It returns HTTP 200 with a per-message `ErrorCode` array, even when some messages fail. The newer Bulk API (`/email/bulk`) takes any number of recipients up to 50 MB, but needs separate approval, runs asynchronously, and rejects the whole request if any address is malformed [P5][P6][P7].
- **Neither side publishes a hard send rate for email.** Postmark's 429 means "slow down" with no number. For a first broadcast it asks for 20k messages per hour for 12 hours, and later for sends of 50k+ to be split up and spaced about 30 minutes apart [P8][P9][P10].
- **Per-recipient failure reporting differs.** Knock's trigger is async: it returns a `workflow_run_id` only, and per-recipient outcomes show up later as message statuses or webhooks. Postmark batch returns each recipient's result synchronously, so a background job can retry only the failed ones [K2][K10][P6].

## Knock

### Limits on a workflow trigger

- `POST /v1/workflows/{key}/trigger` accepts a `recipients` array. "You can trigger a workflow for up to 1000 recipients at a time. If you need to manage a larger list of recipients, you might want to consider using our subscriptions feature" [K1].
- "It's not currently possible to issue bulk trigger requests to the API" [K1].
- The call returns `{ "workflow_run_id": "..." }`. "All workflow runs are executed asynchronously" [K2].
- The `data` payload is limited to 10 MB [K1].
- An optional `Idempotency-Key` header makes retries safe. Repeating the same key within 24 hours returns the original response instead of creating duplicate runs, and a key reused with different parameters returns an error [K1].
- Recipients are either user IDs that are already identified or full recipient objects identified inline before the run starts [K1].

### API rate limits

- Every endpoint has a rate-limit tier. Tier 1 = 1 req/s, Tier 2 = 5 req/s, Tier 3 = 60 req/s, Tier 4 = 200 req/s, Tier 5 = 1,000 req/s. When you exceed it, Knock returns `429 Too Many Requests`. With a secret API key, limits are scoped per environment. Knock offers to discuss higher limits [K3].
- The docs don't mention a `Retry-After` header [K3].
- Tiers for the relevant endpoints:

| Endpoint                                                          | Tier | Limit       | Source |
| ----------------------------------------------------------------- | ---- | ----------- | ------ |
| Trigger workflow                                                  | 5    | 1,000 req/s | [K2]   |
| Add subscriptions to one object (≤100 recipients per call)        | 3    | 60 req/s    | [K11]  |
| Bulk add subscriptions (async `BulkOperation`)                    | 1    | 1 req/s     | [K11]  |
| Add audience members (≤1,000 per call)                            | 3    | 60 req/s    | [K11][K5] |
| Bulk identify users (≤1,000 per call)                             | 1    | 1 req/s     | [K11]  |
| List messages                                                     | 4    | 200 req/s   | [K11]  |

- Batch and bulk endpoints also have a "batch deduplication" limit of 1 update per second per entity. Knock still returns 2xx and lists the rejected IDs in an `x-ratelimited-{param}` header [K12].

### Ways to fan out to every user

| Option | How it works | Fits "every account, from the server"? |
| --- | --- | --- |
| **Recipients list on trigger** | Cadence pages through accounts and sends `ceil(N/1000)` triggers, each with up to 1,000 user IDs [K1]. | Yes. Cadence chooses the recipients (it already filters muted courses before calling Knock, per ADR 0013). This takes the most calls but the rate limit isn't a concern: 1,000 req/s. |
| **Object + subscriptions** | Subscribe each user to one object; trigger with `recipients: [{ collection, id }]`. "Knock will enqueue a new workflow run for the object itself **and** fan out to all of its subscribers" [K4]. | Yes, with one trigger call. Cadence has to keep the subscriber list in sync (add on signup, remove on deletion) at ≤100 per call [K4]. Knock deduplicates recipients, and the `actor` is always excluded when they are a subscriber [K4]. The object gets its own workflow run; use a step condition on `recipient.__typename` to skip it [K4][K13]. |
| **Audience** | User segment (static or dynamic). Workflows can only be triggered for users *joining* an audience. "It's not yet possible to trigger a workflow for an audience via the API" [K1][K6]. | No, not for an existing audience. |
| **Broadcast** | One-time send to an audience, to all users in an environment, or to a CSV; built in the dashboard [K7]. Concepts FAQ: "broadcasts are not callable via the API" [K7]. The Management API does expose `PUT /v1/broadcasts/{key}/send` [K14]. | Not a good fit. Broadcasts are a dashboard or marketing tool, not something Cadence's server triggers per Announcement. |

### What each costs in billed units

- "A message is counted each time a notification is successfully delivered to a single user on a single channel." If a channel step doesn't run (preferences, conditions, missing data), there is no message [K8].
- Pricing page: "Messages that bounce or fail to send are not included." Workflows that send nothing are not charged. Stored profiles are unlimited [K9].
- Plans: Free $0 for 10,000 messages a month (overage isn't billed automatically and messages aren't hard-capped). Starter $250 a month including 50,000 messages, then $0.005 each. Enterprise is custom and can bill per monthly notified user instead [K9].
- So **every fan-out option costs the same**: one in-app message per user who receives it. Subscriptions, audience members and trigger calls are not billed. The object's own run creates no message if it has no in-app channel data or is skipped by a condition. In-app feeds for objects are "on our roadmap" [K13].
- Example: one Announcement to 10,000 accounts uses the entire Free tier for the month. On Starter, 10 such Announcements a month (100k messages) cost $250 + 50,000 × $0.005 = $500.
- Sandbox mode doesn't count toward usage, but **the in-app channel can't be sandboxed**. Use channel conditions in non-production environments [K8].

### How Knock reports partial failure

- The trigger response tells you nothing per recipient. A 2xx means the request was accepted and a `workflow_run_id` was issued; runs happen asynchronously [K2]. Errors are JSON `{ code, message, status, type }`; branch on `code` [K15]. A non-2xx response (429, 5xx) means the whole call should be retried, and an `Idempotency-Key` makes that safe [K1].
- After that, outcomes are per message. Delivery statuses are `undelivered`, `bounced`, `delivery_attempted` (Knock will retry), `queued`, `not_sent` (sandbox), `sent` and `delivered`. Each status change is a message event that can go to outbound webhooks [K10].
- Failed workflow steps are retried "up to 3 total times" by Knock, then the run halts. A failed run can be retried once from the dashboard within 7 days [K16].
- For an in-app-only workflow there is no downstream provider, so per-recipient failures are rare. In practice, the retry-or-drop decision Cadence makes (ADR 0013: retry about a minute, then log and drop) applies to **each trigger call** (each batch of up to 1,000, or the single object trigger), not to each recipient.

## Postmark

### Transactional vs broadcast streams

- Transactional streams carry mail "triggered by what users do" to a single recipient (password resets, receipts, comment notifications). Broadcast streams carry mail to many recipients at once on your schedule: "product announcements, release notes, daily digests, ToS updates" [P1].
- "Transactional streams do not support broadcast messages", and "transactional and broadcast traffic never intersects in Postmark". Broadcast uses "separate, parallel broadcast IPs" [P4][P1].
- Broadcast sending needs approval: "When you're ready to start sending Broadcast emails, just request approval" [P1].
- Cadence today sends every email one at a time to `POST /email` with `MessageStream: "outbound"` (the default transactional stream) from `app/lib/mailer.server.ts`. An Announcement email to everyone would need a separate broadcast stream ID.

### What a broadcast stream requires

- **Unsubscribe link:** "Every message sent through a broadcast Message Stream in Postmark is required to have an unsubscribe link" [P4]. Use the placeholder `{{{ pm:unsubscribe }}}` in HTML or text. If it's missing, Postmark appends an "Unsubscribe" link to the footer automatically [P2].
- **List-Unsubscribe headers:** Postmark "automatically add[s] the one-click List-Unsubscribe-Post and List-Unsubscribe headers" to broadcast messages, following RFC 8058, and you can't edit them while Postmark manages unsubscribes. Gmail and Yahoo require RFC 8058 headers on marketing mail [P3].
- **Self-managed unsubscribes** (an opt-in mode): you must add a visible link to every message, supply the headers yourself, and remove unsubscribed people from your list [P3].
- **Scope of an unsubscribe:** it suppresses the address only on that stream. "You'll still be able to send to them through your transactional stream" [P4][P2]. The Subscription Change webhook reports unsubscribes so Cadence can keep its own preferences in sync [P1].
- **Sender and content rules** (best-practice guide):
  - Use a sender email handle, not no-reply, and keep the From name stable.
  - Use a subdomain per stream, with DKIM, Return-Path and DMARC verified for each subdomain.
  - Get explicit consent, and don't bury it in Terms of Use.
  - Don't send to recipients you haven't contacted in 3+ months.
  - Purchased or inherited lists break the Terms of Service.

  The From address must have a confirmed Sender Signature [P9][P6].
- Until the account itself is approved, every recipient must share the From address's domain (error 412) [P11].

### Batch-send limits

- **Batch** `POST /email/batch` (and batch with templates): up to **500 messages per call**, 50 MB including attachments. `MessageStream` is set per message and defaults to `outbound` [P5][P6].
- Each message: To + Cc + Bcc combined ≤ 50 recipients [P6]. For billing, each Cc or Bcc address counts as its own email, so send one message per account rather than Bcc-ing everyone [P12].
- **Bulk** `POST /email/bulk`: "for broadcast sends — newsletters, announcements". Content is defined once, with a `Messages` array of recipients plus a `TemplateModel` for each. There's no message count limit, only the 50 MB payload limit. It needs approval through support and defaults to the broadcast stream. It is asynchronous: poll `GET /email/bulk/{id}` for `TotalMessages`, `ReleasedCount` and `FailedCount` [P7].
- Billing: each sent transactional or broadcast message counts as one email. Plans start at 10,000 emails a month from $15, with overage at $1.20–$1.80 per 1,000 depending on tier [P12][P13].

### Rate limits

- "Postmark does not have a hard limit for requests/second when sending email" [P8].
- HTTP 429 means "making requests at a rate that exceeds acceptable use of the API". No threshold or `Retry-After` is documented. The guidance is to reduce your request rate [P10].
- Broadcast warm-up: for the first broadcast send, "batches of 20K messages per hour, for the first 12 hours". After that, split sends of 50,000+ recipients into smaller batches about 30 minutes apart [P9]. The Bulk API paces delivery itself: "we'll release them at the appropriate rate for best deliverability results" [P7].
- Other statuses: 413 means too large (10 MB for a single email, 50 MB for a batch). 500 means a Postmark error, and "the message is usually lost". 503 means planned outage [P10].

### How Postmark reports partial failure

- **Batch:** the response "will return a 200-level http status, even when validation for individual messages may fail". The body is an array **in the same order as the request**, with `ErrorCode`, `Message`, `MessageID`, `To` and `SubmittedAt` for each message. `ErrorCode: 0` means accepted [P6]. That makes per-recipient retry or drop simple:
  - **Drop** permanent errors. 406 "Inactive recipient" means the address is suppressed (hard bounce, spam complaint or unsubscribe). 300 means invalid request or address [P11][P7].
  - **Retry** the whole batch, or just the failed subset, briefly on 429, 500 or 503 [P10].
- Errors on the whole request (401, 413, 422 with a JSON `{ ErrorCode, Message }` body, also in the `X-PM-ApiErrorCode` header) mean nothing was sent [P10].
- **Bulk:** any malformed address gets a 422 and **none** of the request is processed. "There is no way to retry only the failed message", so you resubmit the whole request. Messages that are well-formed but undeliverable (suppressed, or the template failed to render) are accepted and counted in `FailedCount`. "Released is not the same as delivered." For per-recipient outcomes, use the Messages API or the delivery and bounce webhooks [P7].
- Delivery after acceptance (bounces, complaints) is reported asynchronously by the Bounce, Delivery and Spam Complaint webhooks [P7].

## Implications for Cadence (not decisions)

- **In-app (Knock):**
  - *Recipient list:* Cadence pages through accounts in groups of 1,000, keeps doing its own preference filtering, and retries each call with an `Idempotency-Key`. It fits ADR 0013's "Cadence checks preferences, then calls Knock" with no new Knock-side state.
  - *Object + subscriptions:* one call, but Cadence has to keep a subscription per account in sync and lets Knock choose the recipients.
  - The cost is identical either way.
- **Email (Postmark):** an Announcement to everyone is broadcast mail by Postmark's definition. It needs:
  - a Broadcast stream (approval)
  - ideally a separate sending subdomain
  - Postmark-managed unsubscribe link and headers
  - `/email/batch` in chunks of 500, or the Bulk API (more approval, async, all-or-nothing validation)

  Batch gives the synchronous per-recipient result that a "retry briefly, then drop" background job needs.
- A course Announcement (to a course's Students) is borderline. It's triggered by an Instructor rather than by the recipient's own action, so Postmark's definitions point to broadcast for it as well.

## Sources

Knock:

- [K1] Triggering workflows with the API (FAQ: max recipients, bulk trigger, audiences; idempotency; data limit): https://docs.knock.app/send-notifications/triggering-workflows/api
- [K2] API reference, Trigger workflow (tier 5, async, `workflow_run_id`): https://docs.knock.app/api-reference/workflows/trigger
- [K3] API reference, Rate limits: https://docs.knock.app/api-reference/overview/rate-limits
- [K4] Subscriptions: https://docs.knock.app/concepts/subscriptions
- [K5] Audiences: https://docs.knock.app/concepts/audiences
- [K6] Triggering workflows for an audience: https://docs.knock.app/send-notifications/triggering-workflows/audiences
- [K7] Broadcasts: https://docs.knock.app/concepts/broadcasts
- [K8] Knock plans and usage (how usage is metered): https://docs.knock.app/manage-your-account/knock-plans
- [K9] Knock pricing: https://knock.app/pricing
- [K10] Message statuses: https://docs.knock.app/send-notifications/message-statuses
- [K11] API reference endpoint pages: https://docs.knock.app/api-reference/objects/add_subscriptions, https://docs.knock.app/api-reference/objects/bulk/add_subscriptions, https://docs.knock.app/api-reference/audiences/add_members, https://docs.knock.app/api-reference/users/bulk/identify, https://docs.knock.app/api-reference/messages/list
- [K12] Batch rate limits: https://docs.knock.app/api-reference/overview/batch-rate-limits
- [K13] Objects: https://docs.knock.app/concepts/objects
- [K14] Management API, Broadcasts: https://docs.knock.app/mapi-reference/broadcasts/send
- [K15] API errors: https://docs.knock.app/api-reference/overview/errors
- [K16] Debugging workflows (step retries, run retries): https://docs.knock.app/send-notifications/debugging-workflows

Postmark:

- [P1] Message Streams: https://postmarkapp.com/message-streams
- [P2] How to add an unsubscribe link: https://postmarkapp.com/support/article/1208-how-to-add-an-unsubscribe-link
- [P3] How to include a List-Unsubscribe header: https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header
- [P4] Migration guide from SendGrid (stream separation, unsubscribe scope, no hard rate limit): https://postmarkapp.com/migration-guides/sendgrid
- [P5] Send batch emails: https://postmarkapp.com/developer/user-guide/send-email-with-api/batch-emails
- [P6] Email API (single and batch endpoints, response fields): https://postmarkapp.com/developer/api/email-api
- [P7] Bulk Email API: https://postmarkapp.com/developer/api/bulk-email
- [P8] Same as [P4], "Postmark does not have a hard limit for requests/second when sending email": https://postmarkapp.com/migration-guides/sendgrid
- [P9] Best practices for bulk broadcast sending: https://postmarkapp.com/guides/best-practices-for-broadcast-sending
- [P10] API overview (HTTP status codes, error body): https://postmarkapp.com/developer/api/overview
- [P11] API error codes (300, 406, 412, 1226): https://postmarkapp.com/developer/api/overview#error-codes
- [P12] How does monthly pricing work?: https://postmarkapp.com/support/article/1107-how-does-monthly-pricing-work
- [P13] Postmark pricing: https://postmarkapp.com/pricing
