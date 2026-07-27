import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWhatsappInbound, verifyWebhookChallenge, verifyWhatsappSignature } from "./whatsapp.js";

const SECRET = "app-secret";
const sig = (secret: string, rawBody: string) =>
  "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");

describe("verifyWhatsappSignature", () => {
  const rawBody = JSON.stringify({ entry: [{ id: "1" }] });

  it("accepts a valid sha256= signature over the raw body", () => {
    expect(verifyWhatsappSignature(sig(SECRET, rawBody), rawBody, SECRET)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifyWhatsappSignature(sig(SECRET, rawBody), rawBody + " ", SECRET)).toBe(false);
  });
  it("rejects the wrong secret", () => {
    expect(verifyWhatsappSignature(sig("other", rawBody), rawBody, SECRET)).toBe(false);
  });
  it("rejects a missing sha256= prefix or empty", () => {
    expect(verifyWhatsappSignature("deadbeef", rawBody, SECRET)).toBe(false);
    expect(verifyWhatsappSignature("", rawBody, SECRET)).toBe(false);
  });
});

describe("verifyWebhookChallenge", () => {
  it("echoes the challenge when mode + token match", () => {
    expect(verifyWebhookChallenge("subscribe", "vt", "CH123", "vt")).toBe("CH123");
  });
  it("returns null on wrong token or mode", () => {
    expect(verifyWebhookChallenge("subscribe", "nope", "CH", "vt")).toBeNull();
    expect(verifyWebhookChallenge("unsubscribe", "vt", "CH", "vt")).toBeNull();
  });
});

describe("parseWhatsappInbound", () => {
  const body = (value: Record<string, unknown>) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value }] }],
  });

  it("extracts inbound text messages (from = wa_id)", () => {
    const p = parseWhatsappInbound(
      body({ messages: [{ from: "15551230000", id: "wamid.A", type: "text", timestamp: "1769000000", text: { body: "hi" } }] }),
    );
    expect(p.messages).toHaveLength(1);
    expect(p.messages[0]).toMatchObject({ waId: "15551230000", wamid: "wamid.A", content: "hi" });
    expect(p.messages[0]!.timestamp).toBeInstanceOf(Date);
  });

  it("represents non-text messages with a placeholder", () => {
    const p = parseWhatsappInbound(
      body({ messages: [{ from: "1555", id: "wamid.B", type: "image", timestamp: "1769000000", image: {} }] }),
    );
    expect(p.messages[0]!.content).toBe("[image message]");
  });

  it("extracts delivery statuses", () => {
    const p = parseWhatsappInbound(body({ statuses: [{ id: "wamid.C", status: "delivered", recipient_id: "1555" }] }));
    expect(p.statuses).toEqual([{ wamid: "wamid.C", status: "delivered" }]);
  });

  it("returns empty for garbage", () => {
    expect(parseWhatsappInbound({})).toEqual({ messages: [], statuses: [] });
    expect(parseWhatsappInbound(null)).toEqual({ messages: [], statuses: [] });
  });
});
