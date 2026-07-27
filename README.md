# YachtWay CRM (Standalone)

A standalone, self-hosted CRM for YachtWay — dealers, brokers, shipyards, listings, opportunities, billing, conversations, and marketing — built to SOC 2 standards. This is an **independent project**: it has its own git history and no runtime ties to any external build/host platform.

It ships with two headline capabilities on top of the core CRM:

1. **Emails** — a WYSIWYG drag-and-drop email builder **and** a VS Code-style HTML editor with an automatic live preview.
2. **Amplitude destination** — the CRM registered as an Amplitude webhook destination for **Events, User Properties, and Cohorts** (backend receiver + an admin monitoring view).

---

## Run it (frontend, full mock — no DB/auth/keys needed)

```bash
cd yachtway-crm-standalone
pnpm install      # or npm install
pnpm dev          # → http://localhost:3000
```

The UI runs on seeded mock data with a demo role switcher (top-right), so you can browse and iterate on the interface immediately. Anything under `src/` hot-reloads. The API status pill shows **"Mock"** — expected; it means no backend is required.

### Where the headline features live

| Feature | Where to click | Key files |
|---|---|---|
| Email list | Sidebar → **Marketing → Emails** | `src/routes/emails.index.tsx` |
| Email editor (Designer + HTML) | **New email** / open a template | `src/routes/emails.$id.tsx` |
| Drag-and-drop designer | "Designer" tab | `src/components/email-builder/grapes-editor.tsx` |
| HTML editor + live preview | "HTML editor" tab | `src/components/email-builder/html-code-editor.tsx` |
| Amplitude destination | Sidebar → **Admin → Amplitude destination** | `src/routes/admin.amplitude.tsx` |

---

## The email builder

Two authoring modes share one template record and swap cleanly:

- **Designer** — [GrapesJS](https://grapesjs.com/) with the MJML-style *newsletter* preset. Drag text, image, button, divider and multi-column blocks; edit styles and layers. Exports email-safe, inlined HTML. Fully self-hosted — no template content leaves your infrastructure.
- **HTML editor** — [CodeMirror](https://codemirror.net/) (syntax highlighting, line numbers, bracket matching, auto-close tags) with a split-pane **live preview** that re-renders as you type, plus a desktop/mobile width toggle. The preview iframe is sandboxed **without** `allow-scripts`, so pasted HTML can never run JS in the CRM.

Both editors mount client-only (`src/components/client-only.tsx`) so they're SSR-safe. Templates persist to the browser in this mock (`src/lib/email-templates.ts`) — a drop-in seam for a real `/emails` API.

---

## The Amplitude destination (backend)

Built in `apps/api`, mirroring the existing provider-webhook conventions: a public, self-authenticating, idempotent endpoint that writes under the `INTEGRATION` role so Postgres RLS still governs it.

**Endpoints** (`apps/api/src/routes/amplitude.ts`):

```
POST /webhooks/amplitude/events            # behavioural events
POST /webhooks/amplitude/user-properties   # identify / user-property updates
POST /webhooks/amplitude/cohorts           # full cohort membership snapshots
```

**Auth** (`apps/api/src/integrations/amplitude.ts`): a required shared secret sent as `Authorization: Bearer <secret>` or `X-Amplitude-Secret`, constant-time compared; optional HMAC-SHA256 over the body in `X-Amplitude-Signature` when `AMPLITUDE_SIGNING_KEY` is set.

```
AMPLITUDE_WEBHOOK_SECRET=...   # required — endpoints return 503 until set
AMPLITUDE_SIGNING_KEY=...      # optional HMAC layer
```

**Identity join:** Amplitude's `user_id` is the YachtWay DB ID, so events/properties/cohort members resolve to a `Contact` by `yachtwayDbId` (falling back to stored Amplitude ids), retaining raw ids for later reconciliation.

**Data model** (`apps/api/prisma/schema.prisma`): tables `amplitude_events`, `amplitude_cohorts`, `amplitude_cohort_memberships`, plus `contacts.amplitude_user_properties`. RLS policies in `apps/api/prisma/policies/rls.sql` (read follows `contact.general`; writes are `INTEGRATION`/`ADMIN` only).

### Running the backend (optional, needs Postgres)

```bash
cd apps/api
npm install
# set DATABASE_URL / ADMIN_DATABASE_URL + AMPLITUDE_WEBHOOK_SECRET
npm run prisma:generate
npm run db:setup          # migrate + apply RLS policies + seed
npm run dev               # → http://localhost:4000
npm test                  # unit tests (incl. amplitude, no DB)
npm run test:integration  # integration tests (needs DB)
```

Point the frontend at it with `VITE_API_URL=http://localhost:4000`.

---

## Architecture

- **Frontend:** React 19 + TanStack Start/Router + Vite + Tailwind, with a typed API client that transparently falls back to seeded mock data when the backend is offline.
- **Backend (`apps/api`):** Express + Prisma (PostgreSQL) with role-based row-level security; integrations for email, chat, billing, and now Amplitude.
- **Shared (`packages/shared`):** Zod schemas and permission contracts shared by both, resolved from source (no build step) via the Vite alias.

## Independence notes

- Fresh git repository — no external remote.
- No runtime dependency on any hosting platform (the error-reporting hook in `src/lib/yachtway-crm-error-reporting.ts` just logs to console; wire your own service there).
- One build-time dependency remains: `@lovable.dev/vite-tanstack-config` in `vite.config.ts`, a published preset that bundles the TanStack Start + Vite + Tailwind + nitro setup. It's a convenience, not a data/host tie. To go fully package-free, replace it in `vite.config.ts` with explicit `@tanstack/react-start`, `@vitejs/plugin-react`, `@tailwindcss/vite`, and `vite-tsconfig-paths` plugins (see the comment at the top of that file for the exact list it provides).
