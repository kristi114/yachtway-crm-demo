import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/**
 * Mailgun integration (Phase 4 ii-b) — marketing/bulk email.
 *
 * Two directions:
 *  - OUTBOUND: sendMailgunMessage() posts to the Messages API and tags the send
 *    with `v:crm_message_id` (a Mailgun custom variable). Mailgun echoes custom
 *    variables back on every tracking event, so we correlate events to our own
 *    message row without depending on Mailgun's internal id.
 *  - INBOUND: verifyMailgunSignature() authenticates event webhooks. Mailgun
 *    signs each POST as HMAC-SHA256(signing_key, timestamp + token); we also
 *    reject stale timestamps to blunt replay. (Per-event exactly-once is handled
 *    separately by the webhook_events ledger.)
 *
 * Everything is credential-optional so the app boots without Mailgun configured;
 * calls throw a clear MailgunConfigError only when actually invoked unconfigured.
 */

export class MailgunConfigError extends Error {
  constructor(missing: string) {
    super(`Mailgun not configured: missing ${missing}`);
    this.name = "MailgunConfigError";
  }
}

export interface SendMailgunInput {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /** our messages.id — round-trips back on every event as a custom variable */
  crmMessageId: string;
  /** Extra MIME headers, sent as Mailgun `h:` params (e.g. List-Unsubscribe). */
  headers?: Record<string, string>;
}

export interface SendMailgunResult {
  /** Mailgun's own message id (RFC Message-Id, angle-bracketed) */
  providerMessageId: string;
  message: string;
}

/** True when sending is configured (API key + domain present). */
export function mailgunSendConfigured(): boolean {
  return Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);
}

/** Send an email via Mailgun. Enables open/click tracking and tags the send with
 *  the CRM message id so events can be correlated back. */
export async function sendMailgunMessage(input: SendMailgunInput): Promise<SendMailgunResult> {
  if (!env.MAILGUN_API_KEY) throw new MailgunConfigError("MAILGUN_API_KEY");
  if (!env.MAILGUN_DOMAIN) throw new MailgunConfigError("MAILGUN_DOMAIN");
  if (!input.html && !input.text) throw new Error("mailgun send requires html or text body");

  const form = new URLSearchParams();
  form.set("from", input.from);
  form.set("to", input.to);
  form.set("subject", input.subject);
  if (input.html) form.set("html", input.html);
  if (input.text) form.set("text", input.text);
  form.set("o:tracking", "yes");
  form.set("o:tracking-opens", "yes");
  form.set("o:tracking-clicks", "yes");
  // Custom variable echoed back on every tracking event for correlation.
  form.set("v:crm_message_id", input.crmMessageId);
  // Arbitrary MIME headers (Mailgun's h: prefix). Used for RFC 8058 one-click
  // unsubscribe: List-Unsubscribe + List-Unsubscribe-Post. Headers are NOT
  // rewritten by Mailgun's click tracking, so the mailbox provider POSTs our URL
  // directly.
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    form.set(`h:${name}`, value);
  }

  const url = `${env.MAILGUN_BASE_URL}/v3/${env.MAILGUN_DOMAIN}/messages`;
  const auth = Buffer.from(`api:${env.MAILGUN_API_KEY}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`mailgun send failed (${res.status}): ${detail.slice(0, 500)}`);
  }
  const body = (await res.json()) as { id?: string; message?: string };
  return { providerMessageId: body.id ?? "", message: body.message ?? "" };
}

export interface MailgunSignature {
  timestamp: string;
  token: string;
  signature: string;
}

/** Max age (seconds) of a webhook signature we'll accept — blunts replay. */
const SIGNATURE_MAX_AGE_SECONDS = 15 * 60;

/**
 * Verify a Mailgun webhook signature. Returns false (never throws) for any bad
 * or stale/malformed signature so the route can answer 406 without leaking why.
 */
export function verifyMailgunSignature(
  sig: MailgunSignature,
  now: Date = new Date(),
  signingKey: string | undefined = env.MAILGUN_SIGNING_KEY,
): boolean {
  if (!signingKey) throw new MailgunConfigError("MAILGUN_SIGNING_KEY");
  if (!sig || !sig.timestamp || !sig.token || !sig.signature) return false;

  // Reject stale timestamps (replay window).
  const ts = Number(sig.timestamp);
  if (!Number.isFinite(ts)) return false;
  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - ts);
  if (ageSeconds > SIGNATURE_MAX_AGE_SECONDS) return false;

  const expected = createHmac("sha256", signingKey)
    .update(sig.timestamp + sig.token)
    .digest("hex");

  // Constant-time compare; lengths must match for timingSafeEqual.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig.signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Mailgun event → our messages.delivery_status. */
export function mapMailgunEventToStatus(event: string): string {
  switch (event) {
    case "accepted":
      return "accepted";
    case "delivered":
      return "delivered";
    case "opened":
      return "opened";
    case "clicked":
      return "clicked";
    case "failed":
    case "rejected":
      return "failed";
    case "complained":
      return "complained";
    case "unsubscribed":
      return "unsubscribed";
    default:
      return event;
  }
}
