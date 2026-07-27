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

  // Xero-via-Make (Phase X1). The CRM emits a signed invoice payload to a Make
  // scenario (SCENARIO_A_URL), which talks to Xero and calls back POST
  // /webhooks/xero. Outbound emits are signed with OUTBOUND_SECRET (Make
  // verifies); inbound callbacks are verified with INBOUND_SECRET (HMAC-SHA256
  // over the raw body). All optional so the app boots without Make configured.
  MAKE_SCENARIO_A_URL: z.string().url().optional(),
  MAKE_OUTBOUND_SECRET: z.string().optional(),
  MAKE_INBOUND_SECRET: z.string().optional(),

  // Invoice emit transport (X1 hardening). "inline" (default) emits to Make in
  // the approve request; "pgboss" routes emits through a durable, retried queue
  // (needs pg-boss installed + a worker; see queue/emitQueue.ts). PGBOSS_DATABASE_URL
  // is optional — pg-boss reuses ADMIN_DATABASE_URL/DATABASE_URL when unset.
  INVOICE_EMIT_QUEUE: z.enum(["inline", "pgboss"]).default("inline"),
  PGBOSS_DATABASE_URL: z.string().url().optional(),

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
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
