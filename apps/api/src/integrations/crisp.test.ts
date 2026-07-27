import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseCrispInbound, verifyCrispSignature } from "./crisp.js";

const KEY = "crisp-signing-secret";
function sign(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp};${rawBody}`).digest("hex");
}

describe("verifyCrispSignature", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  const ts = String(now.getTime()); // epoch ms
  const rawBody = JSON.stringify({ event: "message:send", data: { session_id: "s1" } });

  it("accepts a valid, fresh signature over timestamp;rawBody", () => {
    expect(verifyCrispSignature({ timestamp: ts, rawBody, signature: sign(KEY, ts, rawBody) }, now, KEY)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = sign(KEY, ts, rawBody);
    expect(verifyCrispSignature({ timestamp: ts, rawBody: rawBody + " ", signature: sig }, now, KEY)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifyCrispSignature({ timestamp: ts, rawBody, signature: sign("other", ts, rawBody) }, now, KEY)).toBe(false);
  });

  it("rejects a stale timestamp", () => {
    const oldTs = String(now.getTime() - 3600_000); // 1h old
    expect(verifyCrispSignature({ timestamp: oldTs, rawBody, signature: sign(KEY, oldTs, rawBody) }, now, KEY)).toBe(false);
  });

  it("accepts an epoch-seconds timestamp too", () => {
    const tsSec = String(Math.floor(now.getTime() / 1000));
    expect(verifyCrispSignature({ timestamp: tsSec, rawBody, signature: sign(KEY, tsSec, rawBody) }, now, KEY)).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(verifyCrispSignature({ timestamp: "", rawBody: "", signature: "" }, now, KEY)).toBe(false);
  });
});

describe("parseCrispInbound", () => {
  const base = (over: Record<string, unknown>) => ({
    event: "message:send",
    data: { session_id: "sess_1", from: "user", type: "text", content: "hi", fingerprint: 42, ...over },
  });

  it("parses a visitor text message", () => {
    expect(parseCrispInbound(base({}))).toEqual({ sessionId: "sess_1", fingerprint: "42", content: "hi" });
  });

  it("ignores operator echoes", () => {
    expect(parseCrispInbound(base({ from: "operator" }))).toBeNull();
  });

  it("ignores non-message events", () => {
    expect(parseCrispInbound({ event: "session:created", data: { session_id: "x" } })).toBeNull();
  });

  it("skips when session or fingerprint is missing", () => {
    expect(parseCrispInbound(base({ session_id: undefined }))).toBeNull();
    expect(parseCrispInbound(base({ fingerprint: undefined }))).toBeNull();
  });

  it("represents non-text content with a placeholder", () => {
    expect(parseCrispInbound(base({ content: { type: "file" } }))?.content).toBe("[non-text message]");
  });
});
