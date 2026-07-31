import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import { env } from "./env.js";
import meRouter from "./routes/me.js";
import companiesRouter from "./routes/companies.js";
import contactsRouter from "./routes/contacts.js";
import opportunitiesRouter from "./routes/opportunities.js";
import invoicesRouter from "./routes/invoices.js";
import accountingRouter from "./routes/accounting.js";
import conversationsRouter from "./routes/conversations.js";
import brandsRouter from "./routes/brands.js";
import webhooksRouter from "./routes/webhooks.js";
import amplitudeRouter from "./routes/amplitude.js";
import emailsRouter from "./routes/emails.js";
import activitiesRouter from "./routes/activities.js";
import emailTrackingRouter from "./routes/email-tracking.js";
import reportsRouter from "./routes/reports.js";
import financingRouter from "./routes/financing.js";
import mastercoverRouter from "./routes/mastercover.js";
import { errorHandler } from "./http/errors.js";

/**
 * CORS allowlist. Defaults to the hosted CRM frontend + local dev; override
 * with the CORS_ORIGINS env var (comma-separated). We allowlist explicitly
 * rather than reflecting any origin (SOC 2 baseline). Requests with no Origin
 * header (server-to-server, curl, health checks) are allowed through.
 */
const DEFAULT_ORIGINS = ["https://crm.yachtway.app", "http://localhost:3000"];

function corsOptions(): CorsOptions {
  const allow = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const origins = allow.length > 0 ? allow : DEFAULT_ORIGINS;
  return {
    origin(origin, cb) {
      if (!origin || origins.includes(origin)) return cb(null, true);
      cb(new Error(`origin not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-crm-role", "x-crm-user-id"],
    maxAge: 86400,
  };
}

/**
 * Builds the Express app. Kept as a factory (no side effects) so tests can
 * spin up an instance without binding a port.
 */
export function createApp(): Express {
  const app = express();

  // Security headers on by default (SOC 2 baseline).
  app.use(helmet());
  app.use(cors(corsOptions()));
  // Capture the raw body so provider webhooks that sign the exact bytes (Crisp,
  // and later Meta/WhatsApp) can verify the HMAC against it. Harmless elsewhere.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "yachtway-crm-api" });
  });

  // PUBLIC provider webhooks — mounted BEFORE the authed routers. Every authed
  // router applies authContext as router-level middleware, which runs on any
  // request reaching it and 401s when no role is present; a public webhook must
  // therefore be matched first. Each webhook authenticates itself (signature).
  app.use(webhooksRouter);

  // Amplitude destination webhooks (Events / User Properties / Cohorts). Public
  // + self-authenticated with a shared secret; mounted alongside the other webhooks.
  app.use(amplitudeRouter);

  // PUBLIC email tracking: open pixel, click redirect, unsubscribe. Mounted with
  // the other public routes (before the authed routers) since the recipient's
  // mail client calls these with no CRM session — the per-recipient tracking
  // token is the only credential.
  app.use(emailTrackingRouter);

  // Session + permissions (dev auth shim inside each router until WorkOS lands).
  app.use(meRouter);
  app.use(companiesRouter);
  app.use(contactsRouter);
  app.use(opportunitiesRouter);
  app.use(invoicesRouter);
  app.use(accountingRouter);
  app.use(conversationsRouter);
  app.use(emailsRouter);
  app.use(activitiesRouter);
  app.use(brandsRouter);
  app.use(reportsRouter);
  app.use(financingRouter);
  app.use(mastercoverRouter);

  // Terminal error handler — must be last.
  app.use(errorHandler);

  return app;
}
