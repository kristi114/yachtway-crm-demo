import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/**
 * Make (Xero transport) integration — Phase X1.
 *
 * Two directions, both HMAC-SHA256 over the RAW request body:
 *  - OUTBOUND: emitToMake() POSTs a signed invoice payload to the Make Scenario A
 *    webhook. Make verifies `x-make-signature` with MAKE_OUTBOUND_SECRET, then
 *    creates the invoice in Xero and calls us back.
 *  - INBOUND: verifyMakeSignature() authenticates the callback (POST
 *    /webhooks/xero) with MAKE_INBOUND_SECRET. Per-event exactly-once is handled
 *    by the webhook_events ledger, same as the other providers.
 *
 * Credential-optional so the app boots without Make configured; calls throw a
 * clear MakeConfigError only when actually invoked unconfigured.
 */

export class MakeConfigError extends Error {
  constructor(missing: string) {
    super(`Make not configured: missing ${missing}`);
    this.name = "MakeConfigError";
  }
}

/** HMAC-SHA256(secret, rawBody) as lowercase hex. */
export function signBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/** True when outbound emit is configured (Scenario A URL + outbound secret). */
export function makeEmitConfigured(): boolean {
  return Boolean(env.MAKE_SCENARIO_A_URL && env.MAKE_OUTBOUND_SECRET);
}

/**
 * Verify an inbound Make callback signature. Returns false (never throws) for a
 * bad/malformed signature so the route can answer 406 without leaking why.
 * Throws MakeConfigError when the inbound secret is unset.
 */
export function verifyMakeSignature(
  rawBody: string,
  signature: string,
  secret: string | undefined = env.MAKE_INBOUND_SECRET,
): boolean {
  if (!secret) throw new MakeConfigError("MAKE_INBOUND_SECRET");
  if (!signature) return false;
  const expected = signBody(rawBody, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface MakeEmitResult {
  ok: boolean;
  status: number;
}

/**
 * POST a signed JSON payload to the Make Scenario A webhook. The signature is
 * over the exact bytes we send, in the `x-make-signature` header. Throws
 * MakeConfigError when unconfigured; throws on a non-2xx response so the caller
 * can mark the invoice failed and surface it.
 */
export async function emitToMake(payload: unknown): Promise<MakeEmitResult> {
  if (!env.MAKE_SCENARIO_A_URL) throw new MakeConfigError("MAKE_SCENARIO_A_URL");
  if (!env.MAKE_OUTBOUND_SECRET) throw new MakeConfigError("MAKE_OUTBOUND_SECRET");

  const rawBody = JSON.stringify(payload);
  const signature = signBody(rawBody, env.MAKE_OUTBOUND_SECRET);

  const res = await fetch(env.MAKE_SCENARIO_A_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-make-signature": signature,
    },
    body: rawBody,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`make emit failed (${res.status}): ${detail.slice(0, 500)}`);
  }
  return { ok: true, status: res.status };
}
