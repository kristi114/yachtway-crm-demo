# External integrations — wiring TODO

## Record activity is now real (2026-07-31)

`tasks-log.ts`, `notes.ts`, `note-access.ts` and `personal-calendar.ts` have a
backend: `tasks`, `notes`, `appointments` and `personal_calendar_entries`
(migration `20260731160000_record_activity`), with routes in
`apps/api/src/routes/activities.ts` and one combined
`GET /{contacts|companies|listings|opportunities}/:id/activity` feed.

Two notes for the front end:

- **Note visibility is enforced in Postgres**, not just the UI. `private` is
  author-only and `secure` is author + ADMIN, compared against the caller's auth
  subject via the new `app.current_user_id` session variable. A note you may not
  read is simply absent from the list, and single-record access answers 404 — the
  existence of a private note is itself information. `canViewNote` is exported
  from `@yachtway/shared` so the UI applies the identical rule.
- **Personal calendar entries are owner-only, ADMIN included.** There is no
  `userId` parameter on the endpoint to tempt anyone; RLS scopes every row.

Still mock: **Google Calendar sync**. `appointments.external_event_id` is the
column it will key on (OAuth calendar scopes + a webhook channel for changes).


This standalone build ships the **front-end seams** for several integrations on
mock data. The routing, config surfaces and per-user preferences are already
modelled; the items below are what's left to make them **real** at the API layer
(`apps/api`). Keep this list current as connections are added.

## Email providers (added — mock, needs real wiring)

Routing is fixed by email class (`src/lib/email-providers.ts`):

| Class | Provider | Used for |
|---|---|---|
| System | **AWS SES** | Password resets, automation alerts, notification emails, receipts |
| Transactional | **Gmail** | 1:1 rep ↔ contact email (sent from the rep's mailbox) |
| Marketing | **Mailgun** | Bulk campaigns / newsletters with open & click tracking |

Front-end today: connection state is a localStorage toggle (Admin → Email
providers); `sendEmail` routes by `kind` and blocks when the provider is
"disconnected"; notification emails go through `sendSystemEmail` → SES.

**Backend landed 2026-07-31 — the email object is now real in `apps/api`:**

- Models: `EmailTemplate`, `EmailCampaign` (+ `EmailCampaignStep`),
  `EmailAudience`, `EmailSend`, `EmailRecipient`
  (migration `20260731120000_email_object`).
- `POST /emails/send` carries `kind` and dispatches through
  `integrations/emailRouter.ts`, which enforces the routing table above and
  rejects an override outside `KIND_ALLOWED_PROVIDERS` with 400.
- Consent is enforced server-side in `emails/audience.ts`: every inclusion path
  (saved filters, contact tags, company tags, explicit contacts, hand-typed
  addresses) passes one gate, and suppressed recipients are **persisted with
  their reason** rather than dropped silently.
- Tracking is real: per-recipient `trackingToken` behind `GET /e/o/:token`
  (open pixel), `GET /e/c/:token` (click redirect) and `GET|POST /e/u/:token`
  (unsubscribe → sets `contact.emailOptOut`, so the next send excludes them).
- Scheduling: `now | at | batch | rss | smart`, with the runner in
  `emails/scheduler.ts` (migration `20260731140000_email_scheduler`). It POLLS
  the database rather than holding timers, so a restart loses nothing, and it
  CLAIMS each send with a `locked_at` lease so two API instances can never
  dispatch the same batch twice. `at` fires at its time; `batch` sends `quantity`
  per window and only on the configured local weekdays; `smart` gives each
  recipient its own due time inside the window; `rss` re-checks the feed and
  spawns a child send per batch of new items. Non-opener follow-ups fire once,
  `delayDays` after the parent, skipping bounced and failed addresses.
  **Set `EMAIL_SCHEDULER_INTERVAL_SEC=60` on exactly one deployed instance** —
  it defaults to 0 (off) so a dev server or test run never sends a real batch.
- RLS: marketing sends and their recipients are gated on `email.marketing`,
  system/transactional on `email.general`. Reps hold general rw + marketing ro,
  so a rep gets 403 on a bulk send and 404 on a marketing send they can't see.

**Still to make real (transport credentials):**
- **AWS SES** (`SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`,
  `SES_CONFIGURATION_SET`) — verified sending domain + DKIM/SPF/DMARC, sandbox →
  production access, configuration set for bounce/complaint webhooks. Until set,
  a system send answers **503**, deliberately, rather than pretending.
- **Gmail** (`GMAIL_SERVICE_ACCOUNT_EMAIL`, `GMAIL_PRIVATE_KEY`) — Workspace
  domain-wide delegation with the `gmail.send` scope so reps send as their own
  mailbox. Same 503 until set.
- **Mailgun** — already wired for sending; the per-recipient token rides along as
  the Mailgun custom variable, so extend `POST /webhooks/mailgun` to resolve
  delivered/opened/clicked events onto `email_recipients` via
  `provider_message_id`.
- Move the front end off the localStorage provider toggle onto an
  admin-managed, audited server config; never hold provider secrets client-side.
- `PUBLIC_API_URL` must be set for tracking and unsubscribe links to be absolute.

## Notification delivery (added — mock)

`src/lib/notifications.ts` fans a notification out per recipient's channel prefs
(`notifyBanner` / `notifyEmail` on the user profile; self-serve at
`/settings/notifications`, admin-managed in Admin → Users & roles). Email
delivery currently calls the mock `sendSystemEmail`. When SES is real, this
path sends genuine email; consider batching/digesting and an unsubscribe/mute
per notification type.

## Planned connectors (to wire when we get to real integration)

These back features already present or planned in the CRM. All are mock/absent
today; capture auth, scopes and webhooks as each is built.

| Connector | Powers | Notes for real wiring |
|---|---|---|
| **Google Calendar** | Appointments / scheduling sync | OAuth (calendar scopes); two-way event sync + webhook channel for changes. |
| **YouTube** | Marketing social stats (channel) | Part of Google OAuth; YouTube Data/Analytics API for views/subscribers. |
| **Amplitude** | Product analytics destination | Receiver exists in `apps/api` (`/webhooks/amplitude/*`); set shared secret / signing key. |
| **Meta** | Facebook + Instagram social stats & publishing | Meta Graph API; Business/Page tokens, long-lived token refresh; Instagram insights permissions. |
| **LinkedIn** | LinkedIn social stats & publishing | LinkedIn Marketing API; org page access + analytics scopes. |
| **WhatsApp** | Conversations channel | WhatsApp Business/Cloud API; number provisioning, template approval, inbound webhooks. |
| **Notion** | Content calendar / UTM link manager (see brand + UTM skills) | Notion OAuth integration; database IDs for Content Calendar + Bitly Link Manager. |
| **OpenAI** | AI assist (captions, summaries, drafting) | API key server-side; usage/rate limits; never expose key client-side. |

Social-stats providers (Meta, LinkedIn, YouTube, plus TikTok/Pinterest/Threads/
Bluesky/GBP shown in the Marketing statistics page) feed the per-channel
metrics on the Marketing → Social statistics dashboard, which runs on mock data
until these are connected.

## Notion content calendar → listing links (added — mock)

Marketing → Content calendar and the **Content posts** panel on each listing
surface the SMM team's Notion "Content calendar → Tasks" database, linking each
post to a CRM listing by resolving the post's **Listing URL** property to a
listing's public URL (`resolveListingId` in `src/lib/content-posts.ts`). Today
that store is a **seeded snapshot** of the real Notion data.

**To make real:**
- **Notion connector** (OAuth) with the Content calendar database id
  (`2006d212-272c-805e-a980-c885a15a453c`) / Tasks data source
  (`collection://2006d212-272c-81e2-a854-000bedc6393e`).
- Backend job (scheduled) pulls posts (Task name, Type, Channels, Status, Due,
  Dealer, **Listing** URL, Final Material) into the CRM and resolves the Listing
  URL to a listing id; store the mapping so both directions render.
- Channels map to accounts: `*Main` → YachtWay, `*Hub` → YachtWay Hub (matches
  the Social statistics accounts).
- SMM action item: paste the listing's public URL into the post's **Listing**
  field (it was empty on sampled posts) so the link resolves; otherwise fall
  back to Dealer + Type matching.
- Optional write-back (hybrid): CRM writes the resolved listing/dealer back to
  the Notion post.

## Scheduled report delivery (added — mock)

Admin → Reports lets a report define a delivery **schedule** (daily / weekly /
monthly + time + recipient emails). "Send now" dispatches immediately via
`sendSystemEmail` → **AWS SES**. The recurring cadence itself is not executed
client-side — wire a **server scheduler** (cron / queue) to call the same
delivery path on schedule when the backend lands.

## Email audiences, A/B testing & non-opener follow-up (added — mock)

**Audiences (sending lists).** `src/lib/audiences.ts` resolves a list *definition*
(contact filter clauses + contact tags + company tags + manual addresses) against
the CRM at send time, so lists never go stale. Suppressions applied last:
no email, `emailOptOut === true`, the `Do Not Contact` tag on the contact **or**
its company, and duplicate addresses. Saved lists live in `localStorage`
(`yw:email-audiences:v1`).

**Suppression is absolute.** `suppressionFor(contact, company)` is the single
consent gate and every inclusion path runs through it — filters, contact tags,
company tags, *and* hand-typed addresses. Typing an address by hand is not
consent. A contact is dropped when: no email, `emailOptOut === true`, their
company has `accountWideEmailOptOut === true`, or the `Do Not Contact` tag is on
the contact or the company. The audience builder reports the counts so a removal
is never silent.

**Companies carry two independent email opt-outs.** They are not interchangeable
and must not be collapsed into one column:

| Field | Scope |
|---|---|
| `emailOptOut` | Only the company's own address (`companyEmail`). The people who work there are still contactable. |
| `accountWideEmailOptOut` | Every contact at the account, plus the company address. |

`suppressionFor()` consults only the account-wide flag when deciding about a
person; `companyEmailSuppressed()` governs the company address and is satisfied by
either flag (suppressing the whole account necessarily suppresses its shared
inbox). Both are surfaced as a badge on the company header.

- Backend: `resolveAudience` becomes a single SQL query; move suppression rules
  into the query **and** re-check them in the send route immediately before
  dispatch — a client can't be trusted, and a queued campaign may sit for days
  during which someone unsubscribes. Persist saved lists in Postgres with RLS.
- Consent fields are excluded from the mock backfill (`NEVER_FILL` in
  `mock-field-fill.ts`) so opt-out state is always explicit, never invented.
- Sync the suppression list with **Mailgun**'s own unsubscribes/bounces both ways
  so an unsubscribe at the provider writes back to `emailOptOut`.
- Schema note: the contact fields are **opt-*out*** (`emailOptOut` / `smsOptOut`,
  true = unsubscribed). Postgres still has `email_opt_in` / `sms_opt_in`
  (`apps/api/prisma/schema.prisma`) — invert on read/write, or migrate the
  columns to `email_opt_out` / `sms_opt_out` to match.

**A/B testing.** Configured per send: variant B carries its own subject *and*
HTML body, with a configurable split % and winner metric (open or click rate).
Per-variant stats are stored on the send and rendered in the send report;
`abWinner()` picks the winner.

- Backend: send each arm as its own Mailgun message with a
  `v:variant` custom variable, then aggregate delivered/opened/clicked per
  variant from the **Mailgun event webhooks** instead of the mock derivation in
  `sendEmail`.

**Non-opener follow-up.** A send can schedule one automatic re-send, N days
later, with a new subject, to everyone delivered-but-not-opened. State lives on
the original send (`followUp.dueAt` / `followUp.sentId`, so it can only fire
once). `src/lib/email-followup-runtime.ts` checks on app load and hourly.

- Backend: replace the client-side check with a **cron/worker**: select sends
  where `follow_up_due_at <= now()` and `follow_up_sent_id IS NULL`, resolve
  non-openers from Mailgun events (`delivered AND NOT opened`), send, and stamp
  the row in the same transaction.
- `nonOpenersFor()` in `email-recipients.ts` is the mock stand-in for that event
  query.

## Email type, provider override, pre-header, title, merge tags (added — mock)

**Type + provider.** Every email declares a kind (`marketing` / `transactional` /
`system`). `KIND_PROVIDER` is the default route (Mailgun / Gmail / SES), and
`KIND_ALLOWED_PROVIDERS` defines the legal overrides — notably **marketing via
Gmail** for small, personal-feeling sends. `system` is deliberately locked to SES
so password resets and automation alerts never depend on a person's mailbox.
`sendEmail` rejects an illegal pairing and an unconnected provider;
`providerCaveat()` surfaces the trade-off in the UI, and overrides are flagged on
the send report.

- Backend: enforce `KIND_ALLOWED_PROVIDERS` in the send route too (never trust the
  client). Gmail sends need per-user OAuth (send-as the rep) and are subject to
  Workspace daily limits — reject or queue oversized marketing sends routed to
  Gmail rather than failing halfway.
- Gmail carries no list-unsubscribe handling: inject `{{unsubscribe_url}}` and the
  `List-Unsubscribe` header ourselves for any marketing send routed there.

**Pre-header + title.** Templates carry `preheader` and `title`; the title falls
back to the subject when blank (`effectiveTitle`). `applyEmailHead()` injects the
`<title>` and the hidden pre-header span (first child of `<body>`, padded with
zero-width characters so clients don't pull body copy into the preview line). It
is idempotent — re-running replaces the previous injection.

**Merge tags.** `src/lib/merge-tags.ts` is the tag catalogue (contact / company /
sender / system), each with the CRM field it resolves from, a sample for preview,
and a **fallback** for blank values so no one receives "Hi ,".
`renderMergeTags()` does the substitution; unknown tags are left visible rather
than blanked, and the editor warns about them.

- Backend: move substitution server-side at send time, resolving per recipient
  from the contact/company row. `{{unsubscribe_url}}` / `{{preferences_url}}` must
  be generated per recipient with a signed token — never a shared link.

## Campaign sending: five dispatch modes (added — mock)

`src/lib/email-scheduling.ts` models how a campaign goes out. The dialog is
"Send or schedule": pick a mode, configure only that mode, then send.

| Mode | Config | Backend requirement |
|---|---|---|
| **Send Now** | — | immediate POST to the send route |
| **Schedule** | start datetime + timezone | one-shot job at `firstFireAt()` |
| **Batch Schedule** | batch size, repeat interval/unit, send-on weekdays, daily window | recurring worker that walks the audience in slices and respects the weekday/hour restrictions |
| **RSS Schedule** | feed URL, poll cadence, min new items | feed poller storing last-seen GUID, dispatching on new items |
| **Smart Send** | per-recipient delivery window + spread | per-contact best-send-time model from open history; fall back to window midpoint with no history |

Also on the send: **sender name / sender email** (both merge-tag capable, so the
address can be a `{{custom_value}}`), optional per-campaign **reply-to**,
**attachments** (names only in mock — real uploads go to object storage and are
referenced by URL), and **Additional settings**: click tracking, UTM tagging,
tag-on-open / tag-on-click, and **preference type**.

**Preference type matters for compliance.** Categorising a campaign lets a
recipient unsubscribe from that category instead of all mail. The backend must
honour it as a *second* suppression axis alongside `emailOptOut` — a contact
opted out of "Listing alerts" is still mailable for "Financing".

**Scheduling is not executed client-side.** A queued send is recorded with
`status: "scheduled"`, `sentAt` = first fire time, and no engagement metrics
(nothing has been delivered yet); the Sent tab lists these in a Scheduled
section with a Cancel action (`cancelScheduledSend`). Wire a server scheduler to
actually dispatch — the browser must never be the thing holding a schedule, and
`sendEmail` should reject a queued send whose provider was disconnected in the
interim.

Note the batch-plan preview (`batchPlan`) reports interval time only; weekday and
daily-window restrictions can only stretch the real completion time, which the UI
states explicitly rather than implying false precision.

## Previously stubbed (context)

- **WorkOS AuthKit** — set `VITE_WORKOS_CLIENT_ID` for real sign-in (demo role
  switcher otherwise).
