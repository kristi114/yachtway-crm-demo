# Deploying the preview to Vercel

This gives the team **one shared URL** for reviewing the CRM before go-live. The
preview runs entirely on seeded **mock data** — no database, no API keys, no
secrets. That makes it safe to stand up quickly, and it's why no environment
variables are required.

## One-time setup

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. **Import** the `kristi114/yachtway-crm-demo` repository.
   - Vercel will ask for access to the private repo the first time — approve it.
3. On the configure screen, leave the defaults. The committed `vercel.json`
   already pins the two things that matter:
   - **Build Command:** `vite build`
   - **Install Command:** `pnpm install --no-frozen-lockfile` (we don't commit a
     lockfile, so a frozen install would otherwise fail)
   - Framework preset can stay on auto-detect. TanStack Start builds through
     the Nitro plugin (wired into `vite.config.ts`), which detects the Vercel
     environment and emits Vercel's output format (`.vercel/output`)
     automatically — no output directory to set. Leave **Output Directory**
     blank; Vercel serves the Build Output API result directly.
4. Click **Deploy**. First build takes a few minutes (installing deps).
5. When it finishes you'll get a URL like
   `https://yachtway-crm-demo.vercel.app` — that's the shared preview.

## Keep it private (SOC 2 / pre-launch)

By default a Vercel deployment URL is public. For a pre-launch, certified
product, turn on access control:

- Project → **Settings → Deployment Protection → Vercel Authentication** →
  enable. Reviewers then have to be logged into a Vercel account you've invited
  (Project → **Settings → Members**), or use a shareable protected link.
- Password protection is available on paid plans if you'd rather hand out a
  single password.

## After it's live

- Every push to `main` auto-deploys to the production URL; every PR gets its own
  isolated preview URL — handy for reviewing changes in isolation.
- Nothing here touches the real backend. When you're ready to wire the API
  (`apps/api`) and a database, add the env vars from the main `README.md`
  (`VITE_API_URL`, `AMPLITUDE_WEBHOOK_SECRET`, `DATABASE_URL`, …) in
  Project → **Settings → Environment Variables**.

## If the build fails

- **`ERR_PNPM_...` / babel resolution error** — make sure the committed
  `.npmrc` (`node-linker=hoisted`) is present; it's what lets pnpm's layout work
  with TanStack Router's code-splitter.
- **Wrong framework detected** — set Framework Preset to **Other**; the
  `vercel.json` build/install commands still produce the correct output.
