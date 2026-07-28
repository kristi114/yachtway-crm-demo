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

## Previously stubbed (context)

- **Amplitude destination** — receiver exists in `apps/api`
  (`/webhooks/amplitude/*`); needs the shared secret / signing key configured.
- **WorkOS AuthKit** — set `VITE_WORKOS_CLIENT_ID` for real sign-in (demo role
  switcher otherwise).
