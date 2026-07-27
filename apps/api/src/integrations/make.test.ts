import { describe, expect, it } from "vitest";
import { MakeConfigError, signBody, verifyMakeSignature } from "./make.js";

/**
 * Unit tests for the Make HMAC signing used both ways (outbound emit signature +
 * inbound callback verification). Pure crypto — no env/DB needed; the secret is
 * passed explicitly.
 */
const SECRET = "test-make-secret";
const BODY = JSON.stringify({ crm_invoice_id: "inv_1", status: "sent" });

describe("make signing", () => {
  it("verifies a signature it produced", () => {
    const sig = signBody(BODY, SECRET);
    expect(verifyMakeSignature(BODY, sig, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = signBody(BODY, SECRET);
    expect(verifyMakeSignature(BODY + " ", sig, SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const sig = signBody(BODY, "other-secret");
    expect(verifyMakeSignature(BODY, sig, SECRET)).toBe(false);
  });

  it("rejects an empty/malformed signature", () => {
    expect(verifyMakeSignature(BODY, "", SECRET)).toBe(false);
    expect(verifyMakeSignature(BODY, "deadbeef", SECRET)).toBe(false);
  });

  it("throws MakeConfigError when the secret is unset", () => {
    expect(() => verifyMakeSignature(BODY, signBody(BODY, SECRET), "")).toThrow(MakeConfigError);
  });
});
