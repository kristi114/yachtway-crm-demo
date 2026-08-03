import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  // Optional until the Railway Postgres instance is provisioned (needed for the permission spike).
  DATABASE_URL: z.string().url().optional(),
  // Owner/superuser URL used by Prisma migrate (schema directUrl) and reused by
  // pg-boss for its own schema/tables when the durable emit queue is enabled.
  ADMIN_DATABASE_URL: z.string().url().optional(),

  // Auth: "dev" uses the x-crm-role header shim; "workos" verifies real JWTs.
  AUTH_MODE: z.enum(["dev", "workos"]).default("dev"),
  // WorkOS AuthKit. JWKS URL defaults to WorkOS's per-client endpoint if unset.
  WORKOS_CLIENT_ID: z.string().optional(),
  WORKOS_JWKS_URL: z.string().url().optional(),
  WORKOS_ISSUER: z.string().url().optional(),

  // Comma-separated list of allowed browser origins (CORS). Defaults to the
  // hosted CRM frontend + local dev. Tighten/extend via this env var per deploy.
  CORS_ORIGINS: z.string().optional(),

  // Mailgun (marketing / bulk email). Sending needs API_KEY + DOMAIN; inbound
  // event webhooks are verified with SIGNING_KEY (HMAC). BASE_URL is the US
  // region by default — set to https://api.eu.mailgun.net for EU.
  MAILGUN_API_KEY: z.string().optional(),
  MAILGUN_DOMAIN: z.string().optional(),
  MAILGUN_SIGNING_KEY: z.string().optional(),
  MAILGUN_BASE_URL: z.string().url().default("https://api.mailgun.net"),

  // Crisp (support live chat). Sending needs a plugin token (IDENTIFIER + KEY)
  // and the WEBSITE_ID; inbound event webhooks are verified with WEBHOOK_SECRET
  // (HMAC over `timestamp;rawBody`).
  CRISP_IDENTIFIER: z.string().optional(),
  CRISP_KEY: z.string().optional(),
  CRISP_WEBSITE_ID: z.string().optional(),
  CRISP_WEBHOOK_SECRET: z.string().optional(),
  CRISP_BASE_URL: z.string().url().default("https://api.crisp.chat"),

  // WhatsApp (Meta Cloud API). Sending needs ACCESS_TOKEN + PHONE_NUMBER_ID;
  // inbound webhooks verify X-Hub-Signature-256 with APP_SECRET, and the GET
  // subscription handshake echoes hub.challenge when hub.verify_token matches
  // VERIFY_TOKEN. GRAPH_VERSION is overridable as Meta bumps the API.
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  WHATSAPP_GRAPH_VERSION: z.string().default("v21.0"),

  // Stripe (subscription + one-off billing rail). SECRET_KEY authenticates API
  // calls; WEBHOOK_SECRET verifies inbound event signatures. Checkout redirects
  // to SUCCESS/CANCEL urls. All optional so the app boots without Stripe.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_BASE_URL: z.string().url().default("https://api.stripe.com"),
  STRIPE_CHECKOUT_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CHECKOUT_CANCEL_URL: z.string().url().optional(),

  // Amplitude destination (product analytics → CRM). The CRM is registered as
  // an Amplitude "Webhook" destination for Events, User Properties and Cohorts.
  // Amplitude authenticates outbound webhooks with a configurable header, so we
  // require a shared secret (constant-time compared) presented as
  // `Authorization: Bearer <secret>` or `X-Amplitude-Secret`. If SIGNING_KEY is
  // also set, we additionally verify an HMAC-SHA256 over the raw body in
  // `X-Amplitude-Signature` (defense in depth). Both optional so the app boots
  // without Amplitude; the endpoints answer 503 until a secret is set.
  AMPLITUDE_WEBHOOK_SECRET: z.string().optional(),
  AMPLITUDE_SIGNING_KEY: z.string().optional(),

  // AWS SES — the SYSTEM email transport (password resets, alerts, receipts).
  // Needs a verified sending domain with DKIM/SPF/DMARC, production (non-sandbox)
  // access, and a configuration set for bounce/complaint webhooks. Optional so
  // the app boots without it; sends answer 503 until all three are set.
  SES_REGION: z.string().optional(),
  SES_ACCESS_KEY_ID: z.string().optional(),
  SES_SECRET_ACCESS_KEY: z.string().optional(),
  SES_CONFIGURATION_SET: z.string().optional(),

  // Gmail — the TRANSACTIONAL transport, so 1:1 mail leaves the rep's own
  // mailbox. Needs Google Workspace domain-wide delegation (service account +
  // gmail.send scope) so the API can impersonate each rep's address.
  GMAIL_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GMAIL_PRIVATE_KEY: z.string().optional(),

  // Public base URL used to build per-recipient tracking + unsubscribe links.
  // REQUIRED for marketing sends: without it there is no absolute unsubscribe URL
  // to put in the footer or the List-Unsubscribe header, so those sends are
  // refused rather than mailed non-compliant. Should be the API's public origin,
  // e.g. https://yachtway-crm-production.up.railway.app
  PUBLIC_API_URL: z.string().url().optional(),

  // Physical postal address rendered in the email footer. CAN-SPAM requires a
  // valid physical mailing address in commercial email, and the canonical YachtWay
  // footer carries it as GHL's {{location.address}} tag, which the CRM has to fill
  // itself. Also REQUIRED for marketing sends.
  COMPANY_POSTAL_ADDRESS: z.string().optional(),

  // Email scheduler poll interval, in seconds. 0 (default) = OFF, so no process
  // sends scheduled mail unless it was told to — a dev server or a test run must
  // never fire a customer's batch. Set to 60 on exactly one deployed instance;
  // the runner claims each send with a DB lease, so more than one is safe but
  // pointless.
  EMAIL_SCHEDULER_INTERVAL_SEC: z.coerce.number().int().min(0).default(0),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
