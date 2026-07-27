import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StripeConfigError, verifyStripeSignature } from "./stripe.js";

/**
 * Unit tests for Stripe webhook signature verification. Stripe signs the
 * `Stripe-Signature` header as `t=<ts>,v1=HMAC-SHA256(secret, `${ts}.${rawBody}`)`
 * with a timestamp tolerance. Pure crypto — no env/DB.
 */
const SECRET = "whsec_test";
const BODY = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

function header(ts: number, body: string, secret = SECRET): string {
  const v1 = createHmac("sha256", secret).update(`${ts}.${body}`, "utf8").digest("hex");
  return `t=${ts},v1=${v1}`;
}

describe("stripe signature", () => {
  const now = new Date("2026-07-26T12:00:00Z");
  const ts = Math.floor(now.getTime() / 1000);

  it("verifies a fresh, correctly-signed event", () => {
    expect(verifyStripeSignature(BODY, header(ts, BODY), now, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyStripeSignature(BODY + " ", header(ts, BODY), now, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyStripeSignature(BODY, header(ts, BODY, "whsec_other"), now, SECRET)).toBe(false);
  });

  it("rejects a stale timestamp (replay)", () => {
    const old = ts - 10 * 60; // 10 min old > 5 min tolerance
    expect(verifyStripeSignature(BODY, header(old, BODY), now, SECRET)).toBe(false);
  });

  it("rejects a malformed header", () => {
    expect(verifyStripeSignature(BODY, "garbage", now, SECRET)).toBe(false);
    expect(verifyStripeSignature(BODY, "", now, SECRET)).toBe(false);
  });

  it("throws when the webhook secret is unset", () => {
    expect(() => verifyStripeSignature(BODY, header(ts, BODY), now, "")).toThrow(StripeConfigError);
  });
});
