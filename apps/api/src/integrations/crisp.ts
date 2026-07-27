import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/**
 * Crisp integration (Phase 4) — support live chat.
 *
 *  - OUTBOUND: sendCrispMessage() posts an operator message into a Crisp
 *    conversation (keyed by its session id, which we store as the thread's
 *    externalThreadId). Auth is HTTP Basic with a plugin token + X-Crisp-Tier.
 *  - INBOUND: verifyCrispSignature() authenticates event webhooks. Crisp signs
 *    each POST as HMAC-SHA256(secret, `${timestamp};${rawBody}`) — over the RAW
 *    body, so the route must verify against the unparsed bytes. Stale timestamps
 *    are rejected (replay); per-event exactly-once is the webhook_events ledger.
 *
 * Credential-optional so the app boots without Crisp configured; calls throw a
 * clear CrispConfigError only when actually invoked unconfigured.
 */

export class CrispConfigError extends Error {
  constructor(missing: string) {
    super(`Crisp not configured: missing ${missing}`);
    this.name = "CrispConfigError";
  }
}

/** True when sending is configured (plugin token + website id present). */
export function crispSendConfigured(): boolean {
  return Boolean(env.CRISP_IDENTIFIER && env.CRISP_KEY && env.CRISP_WEBSITE_ID);
}

export interface SendCrispInput {
  /** Crisp conversation session id (the thread's externalThreadId). */
  sessionId: string;
  content: string;
}

export interface SendCrispResult {
  /** Crisp message fingerprint, used to correlate the echo webhook. */
  providerMessageId: string;
}

/** Post an operator text message into a Crisp conversation. */
export async function sendCrispMessage(input: SendCrispInput): Promise<SendCrispResult> {
  if (!env.CRISP_IDENTIFIER || !env.CRISP_KEY) throw new CrispConfigError("CRISP_IDENTIFIER/CRISP_KEY");
  if (!env.CRISP_WEBSITE_ID) throw new CrispConfigError("CRISP_WEBSITE_ID");

  const url = `${env.CRISP_BASE_URL}/v1/website/${env.CRISP_WEBSITE_ID}/conversation/${encodeURIComponent(input.sessionId)}/message`;
  const auth = Buffer.from(`${env.CRISP_IDENTIFIER}:${env.CRISP_KEY}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "X-Crisp-Tier": "plugin",
    },
    body: JSON.stringify({ type: "text", from: "operator", origin: "chat", content: input.content }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`crisp send failed (${res.status}): ${detail.slice(0, 500)}`);
  }
  const body = (await res.json().catch(() => ({}))) as { data?: { fingerprint?: unknown } };
  const fp = body.data?.fingerprint;
  return { providerMessageId: fp !== undefined && fp !== null ? String(fp) : "" };
}

export interface CrispSignature {
  timestamp: string;
  rawBody: string;
  signature: string;
}

/** Max age (seconds) of a webhook signature we'll accept — blunts replay. */
const SIGNATURE_MAX_AGE_SECONDS = 15 * 60;

/**
 * Verify a Crisp webhook signature. Returns false (never throws) for a bad or
 * stale/malformed signature; throws CrispConfigError only when the secret is
 * unset so the route can answer 503.
 */
export function verifyCrispSignature(
  sig: CrispSignature,
  now: Date = new Date(),
  secret: string | undefined = env.CRISP_WEBHOOK_SECRET,
): boolean {
  if (!secret) throw new CrispConfigError("CRISP_WEBHOOK_SECRET");
  if (!sig || !sig.timestamp || !sig.rawBody || !sig.signature) return false;

  // Timestamp may arrive as epoch seconds or milliseconds — normalize to ms.
  const tsNum = Number(sig.timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
  if (Math.abs(now.getTime() - tsMs) > SIGNATURE_MAX_AGE_SECONDS * 1000) return false;

  // HMAC is over the RAW body with the timestamp exactly as sent.
  const expected = createHmac("sha256", secret)
    .update(`${sig.timestamp};${sig.rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig.signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface CrispInboundMessage {
  sessionId: string;
  fingerprint: string;
  content: string;
}

/**
 * Interpret a Crisp webhook body. Returns the inbound message to log only for a
 * visitor-sent text message (`message:send` from `user`); returns null for
 * operator echoes, non-text, or non-message events (the route just acks those).
 */
export function parseCrispInbound(body: unknown): CrispInboundMessage | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { event?: unknown; data?: Record<string, unknown> };
  if (b.event !== "message:send" && b.event !== "message:received") return null;
  const d = b.data;
  if (!d) return null;
  if (d.from !== "user") return null; // ignore operator echoes (we logged those)

  const sessionId = typeof d.session_id === "string" ? d.session_id : null;
  if (!sessionId) return null;
  const fingerprint =
    d.fingerprint !== undefined && d.fingerprint !== null ? String(d.fingerprint) : null;
  if (!fingerprint) return null;
  // Text messages carry a string `content`; other types (file/audio/…) are objects.
  const content = typeof d.content === "string" ? d.content : "[non-text message]";

  return { sessionId, fingerprint, content };
}
