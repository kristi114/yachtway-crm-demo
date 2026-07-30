# External integrations — wiring TODO

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

**To make real:**
- **AWS SES** — verified sending domain + DKIM/SPF/DMARC; IAM creds or role;
  configuration set for bounce/complaint webhooks; sandbox → production access.
- **Gmail** — Google Workspace OAuth (domain-wide delegation) so reps send
  *as* their own mailbox; per-user token storage + refresh; `send-as` scopes.
- **Mailgun** — API key + sending domain; inbound/event webhooks for
  delivered/opened/clicked → replace the synthesized metrics in
  `email-recipients.ts`; suppression/unsubscribe list handling.
- Replace the mock transport in `sendEmail`/`sendSystemEmail` with a
  `POST /emails/send` that carries `kind` and dispatches to the routed provider.
- Move the connection state from localStorage to an admin-managed, SOC 2-audited
  server config; never store provider secrets client-side.

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
no email, `emailOptIn === false`, the `Do Not Contact` tag on the contact **or**
its company, and duplicate addresses. Saved lists live in `localStorage`
(`yw:email-audiences:v1`).

- Backend: `resolveAudience` becomes a single SQL query; move suppression rules
  into the query (and enforce them again in the send route so no caller can
  bypass an unsubscribe). Persist saved lists in Postgres with RLS.
- Sync the suppression list with **Mailgun**'s own unsubscribes/bounces both ways
  so an unsubscribe at the provider writes back to `emailOptIn`.

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

## Previously stubbed (context)

- **WorkOS AuthKit** — set `VITE_WORKOS_CLIENT_ID` for real sign-in (demo role
  switcher otherwise).
