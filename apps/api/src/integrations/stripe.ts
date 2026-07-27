import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/**
 * Stripe billing integration — direct REST via fetch (no SDK dependency, matching
 * the other providers). Two directions:
 *  - OUTBOUND: createCheckoutSession() opens a hosted Checkout link (payment mode
 *    for one-off invoices, subscription mode for recurring) — we never touch card
 *    data. The CRM invoice/company id rides in metadata + client_reference_id so
 *    the webhook can correlate back.
 *  - INBOUND: verifyStripeSignature() authenticates event webhooks (the
 *    `Stripe-Signature` header: `t=<ts>,v1=<hmac>` where hmac = HMAC-SHA256(
 *    webhook secret, `<ts>.<rawBody>`), with a timestamp tolerance for replay).
 *
 * Credential-optional so the app boots without Stripe; calls throw a clear
 * StripeConfigError only when actually invoked unconfigured.
 */

export class StripeConfigError extends Error {
  constructor(missing: string) {
    super(`Stripe not configured: missing ${missing}`);
    this.name = "StripeConfigError";
  }
}

export function stripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/** Max age (seconds) of a webhook signature we'll accept — blunts replay. */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Stripe webhook signature. Returns false (never throws) for a bad/
 * stale/malformed signature; throws StripeConfigError only when the secret is
 * unset. Parses the `t=..,v1=..` header and compares HMAC over `t.rawBody`.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  now: Date = new Date(),
  secret: string | undefined = env.STRIPE_WEBHOOK_SECRET,
): boolean {
  if (!secret) throw new StripeConfigError("STRIPE_WEBHOOK_SECRET");
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k?.trim(), v?.trim()];
    }),
  );
  const ts = parts["t"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - tsNum) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authHeader(): string {
  if (!env.STRIPE_SECRET_KEY) throw new StripeConfigError("STRIPE_SECRET_KEY");
  return "Bearer " + env.STRIPE_SECRET_KEY;
}

/** POST form-encoded to the Stripe API and return parsed JSON (throws on non-2xx). */
async function stripePost(path: string, form: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(`${env.STRIPE_BASE_URL}/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json?.error as { message?: string } | undefined)?.message ?? JSON.stringify(json);
    throw new Error(`stripe ${path} failed (${res.status}): ${String(msg).slice(0, 500)}`);
  }
  return json;
}

export interface CheckoutInput {
  mode: "payment" | "subscription";
  /** existing Stripe customer id, if the dealer has one */
  customerId?: string | null;
  /** subscription mode: the Stripe Price id */
  priceId?: string;
  quantity?: number;
  /** payment mode: one-off amount (minor units) + currency + label */
  amountMinor?: number;
  currency?: string;
  description?: string;
  /** correlation — echoed back on the webhook */
  clientReferenceId?: string;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  id: string;
  url: string;
}

/** Create a Stripe Checkout session and return its hosted URL. */
export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  const form = new URLSearchParams();
  form.set("mode", input.mode);
  if (env.STRIPE_CHECKOUT_SUCCESS_URL) form.set("success_url", env.STRIPE_CHECKOUT_SUCCESS_URL);
  if (env.STRIPE_CHECKOUT_CANCEL_URL) form.set("cancel_url", env.STRIPE_CHECKOUT_CANCEL_URL);
  if (input.customerId) form.set("customer", input.customerId);
  if (input.clientReferenceId) form.set("client_reference_id", input.clientReferenceId);
  for (const [k, v] of Object.entries(input.metadata ?? {})) form.set(`metadata[${k}]`, v);

  if (input.mode === "subscription") {
    if (!input.priceId) throw new Error("subscription checkout requires priceId");
    form.set("line_items[0][price]", input.priceId);
    form.set("line_items[0][quantity]", String(input.quantity ?? 1));
  } else {
    // one-off payment with an inline price_data line
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", (input.currency ?? "usd").toLowerCase());
    form.set("line_items[0][price_data][unit_amount]", String(input.amountMinor ?? 0));
    form.set("line_items[0][price_data][product_data][name]", input.description ?? "YachtWay invoice");
  }

  const session = await stripePost("checkout/sessions", form);
  return { id: String(session.id ?? ""), url: String(session.url ?? "") };
}
