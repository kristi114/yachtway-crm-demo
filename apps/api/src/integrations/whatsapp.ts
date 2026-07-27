import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/**
 * WhatsApp integration (Phase 4) — Meta Cloud API.
 *
 *  - OUTBOUND: sendWhatsappMessage() posts a text message to a customer's phone
 *    (wa_id) via the Graph API. NOTE the 24-hour customer-service window: free-
 *    form text only sends within 24h of the customer's last message; outside it,
 *    Meta requires a pre-approved template (a later enhancement — a send outside
 *    the window fails and the message is marked "failed").
 *  - INBOUND: verifyWhatsappSignature() authenticates POST webhooks — Meta signs
 *    the RAW body as `sha256=` + HMAC-SHA256(app_secret, rawBody). The GET
 *    subscription handshake echoes hub.challenge when hub.verify_token matches.
 *
 * Credential-optional so the app boots without WhatsApp configured.
 */

export class WhatsappConfigError extends Error {
  constructor(missing: string) {
    super(`WhatsApp not configured: missing ${missing}`);
    this.name = "WhatsappConfigError";
  }
}

/** True when sending is configured (access token + phone number id present). */
export function whatsappSendConfigured(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export interface SendWhatsappInput {
  /** Recipient phone in E.164 (the customer's wa_id / thread externalThreadId). */
  to: string;
  body: string;
}

export interface SendWhatsappResult {
  /** Meta message id (wamid), used to correlate delivery-status webhooks. */
  providerMessageId: string;
}

/** Send a free-form text message via the WhatsApp Cloud API. */
export async function sendWhatsappMessage(input: SendWhatsappInput): Promise<SendWhatsappResult> {
  if (!env.WHATSAPP_ACCESS_TOKEN) throw new WhatsappConfigError("WHATSAPP_ACCESS_TOKEN");
  if (!env.WHATSAPP_PHONE_NUMBER_ID) throw new WhatsappConfigError("WHATSAPP_PHONE_NUMBER_ID");

  const url = `${env.WHATSAPP_BASE_URL}/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "text",
      text: { preview_url: false, body: input.body },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`whatsapp send failed (${res.status}): ${detail.slice(0, 500)}`);
  }
  const body = (await res.json().catch(() => ({}))) as { messages?: { id?: unknown }[] };
  const id = body.messages?.[0]?.id;
  return { providerMessageId: id !== undefined && id !== null ? String(id) : "" };
}

/**
 * Verify a Meta webhook signature. `signatureHeader` is the raw X-Hub-Signature-256
 * value (`sha256=<hex>`). Returns false for bad/malformed; throws only when the
 * app secret is unset (so the route can answer 503).
 */
export function verifyWhatsappSignature(
  signatureHeader: string,
  rawBody: string,
  secret: string | undefined = env.WHATSAPP_APP_SECRET,
): boolean {
  if (!secret) throw new WhatsappConfigError("WHATSAPP_APP_SECRET");
  if (!signatureHeader || !signatureHeader.startsWith("sha256=") || !rawBody) return false;

  const provided = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * GET subscription handshake. Returns the challenge string to echo when the mode
 * is `subscribe` and the token matches; null otherwise. Throws when the verify
 * token is unset.
 */
export function verifyWebhookChallenge(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
  verifyToken: string | undefined = env.WHATSAPP_VERIFY_TOKEN,
): string | null {
  if (!verifyToken) throw new WhatsappConfigError("WHATSAPP_VERIFY_TOKEN");
  if (mode === "subscribe" && token === verifyToken && typeof challenge === "string") {
    return challenge;
  }
  return null;
}

export interface WhatsappInboundMessage {
  waId: string;
  wamid: string;
  content: string;
  timestamp: Date;
}
export interface WhatsappStatus {
  wamid: string;
  status: string; // sent | delivered | read | failed
}
export interface WhatsappParsed {
  messages: WhatsappInboundMessage[];
  statuses: WhatsappStatus[];
}

/** Extract inbound messages + delivery statuses from a Cloud API webhook body. */
export function parseWhatsappInbound(body: unknown): WhatsappParsed {
  const out: WhatsappParsed = { messages: [], statuses: [] };
  if (!body || typeof body !== "object") return out;
  const entries = (body as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> }).value;
      if (!value) continue;

      const messages = value.messages;
      if (Array.isArray(messages)) {
        for (const m of messages as Record<string, unknown>[]) {
          const wamid = typeof m.id === "string" ? m.id : null;
          const from = typeof m.from === "string" ? m.from : null;
          if (!wamid || !from) continue;
          const text = (m.text as { body?: unknown } | undefined)?.body;
          const content = typeof text === "string" ? text : `[${String(m.type ?? "non-text")} message]`;
          const tsSec = Number(m.timestamp);
          const timestamp = Number.isFinite(tsSec) ? new Date(tsSec * 1000) : new Date();
          out.messages.push({ waId: from, wamid, content, timestamp });
        }
      }

      const statuses = value.statuses;
      if (Array.isArray(statuses)) {
        for (const s of statuses as Record<string, unknown>[]) {
          const wamid = typeof s.id === "string" ? s.id : null;
          const status = typeof s.status === "string" ? s.status : null;
          if (wamid && status) out.statuses.push({ wamid, status });
        }
      }
    }
  }
  return out;
}
