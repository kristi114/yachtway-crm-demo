import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mapMailgunEventToStatus, verifyMailgunSignature } from "./mailgun.js";

/** Build a valid Mailgun signature for a given key/timestamp. */
function sign(key: string, timestamp: string, token: string) {
  return {
    timestamp,
    token,
    signature: createHmac("sha256", key).update(timestamp + token).digest("hex"),
  };
}

const KEY = "test-signing-key";

describe("verifyMailgunSignature", () => {
  const now = new Date("2026-07-24T12:00:00Z");
  const ts = String(Math.floor(now.getTime() / 1000));

  it("accepts a valid, fresh signature", () => {
    const sig = sign(KEY, ts, "tok-abc");
    expect(verifyMailgunSignature(sig, now, KEY)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const sig = sign(KEY, ts, "tok-abc");
    sig.signature = sig.signature.slice(0, -1) + (sig.signature.endsWith("0") ? "1" : "0");
    expect(verifyMailgunSignature(sig, now, KEY)).toBe(false);
  });

  it("rejects a signature made with the wrong key", () => {
    const sig = sign("other-key", ts, "tok-abc");
    expect(verifyMailgunSignature(sig, now, KEY)).toBe(false);
  });

  it("rejects a stale timestamp (replay window)", () => {
    const oldTs = String(Math.floor(now.getTime() / 1000) - 3600); // 1h old
    const sig = sign(KEY, oldTs, "tok-abc");
    expect(verifyMailgunSignature(sig, now, KEY)).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(verifyMailgunSignature({ timestamp: "", token: "", signature: "" }, now, KEY)).toBe(false);
  });
});

describe("mapMailgunEventToStatus", () => {
  it("maps known events", () => {
    expect(mapMailgunEventToStatus("delivered")).toBe("delivered");
    expect(mapMailgunEventToStatus("opened")).toBe("opened");
    expect(mapMailgunEventToStatus("clicked")).toBe("clicked");
    expect(mapMailgunEventToStatus("failed")).toBe("failed");
    expect(mapMailgunEventToStatus("rejected")).toBe("failed");
    expect(mapMailgunEventToStatus("complained")).toBe("complained");
    expect(mapMailgunEventToStatus("unsubscribed")).toBe("unsubscribed");
  });
  it("passes through unknown events unchanged", () => {
    expect(mapMailgunEventToStatus("something_new")).toBe("something_new");
  });
});
