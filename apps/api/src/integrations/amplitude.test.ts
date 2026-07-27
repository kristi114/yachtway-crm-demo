import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  extractPresentedSecret,
  parseAmplitudeCohort,
  parseAmplitudeEvents,
  parseAmplitudeUserProperties,
  verifyAmplitudeAuth,
} from "./amplitude.js";

const SECRET = "amp-shared-secret";
const SIGNING = "amp-signing-key";

describe("extractPresentedSecret", () => {
  it("reads a Bearer token", () => {
    expect(extractPresentedSecret({ authorization: "Bearer abc123" })).toBe("abc123");
  });
  it("reads the X-Amplitude-Secret header", () => {
    expect(extractPresentedSecret({ xAmplitudeSecret: "xyz" })).toBe("xyz");
  });
  it("returns null when neither is present", () => {
    expect(extractPresentedSecret({})).toBeNull();
  });
});

describe("verifyAmplitudeAuth", () => {
  it("accepts a matching shared secret when no signing key is set", () => {
    expect(
      verifyAmplitudeAuth({ presentedSecret: SECRET, rawBody: "{}" }, SECRET, undefined),
    ).toBe(true);
  });

  it("rejects a wrong shared secret", () => {
    expect(
      verifyAmplitudeAuth({ presentedSecret: "nope", rawBody: "{}" }, SECRET, undefined),
    ).toBe(false);
  });

  it("rejects a missing shared secret", () => {
    expect(
      verifyAmplitudeAuth({ presentedSecret: null, rawBody: "{}" }, SECRET, undefined),
    ).toBe(false);
  });

  it("requires a valid HMAC signature when a signing key is set", () => {
    const rawBody = JSON.stringify({ events: [] });
    const sig = createHmac("sha256", SIGNING).update(rawBody).digest("hex");
    expect(
      verifyAmplitudeAuth({ presentedSecret: SECRET, signature: sig, rawBody }, SECRET, SIGNING),
    ).toBe(true);
    expect(
      verifyAmplitudeAuth({ presentedSecret: SECRET, signature: "bad", rawBody }, SECRET, SIGNING),
    ).toBe(false);
    expect(
      verifyAmplitudeAuth({ presentedSecret: SECRET, rawBody }, SECRET, SIGNING),
    ).toBe(false);
  });

  it("throws AmplitudeConfigError when no secret is configured", () => {
    expect(() =>
      verifyAmplitudeAuth({ presentedSecret: "x", rawBody: "{}" }, undefined, undefined),
    ).toThrow(/not configured/);
  });
});

describe("parseAmplitudeEvents", () => {
  it("normalizes snake_case events (array and enveloped)", () => {
    const raw = {
      events: [
        {
          insert_id: "ins_1",
          user_id: "84213",
          device_id: "dev_1",
          event_type: "listing_viewed",
          event_time: 1_720_000_000_000,
          session_id: "sess_9",
          event_properties: { listing_id: "L1" },
          user_properties: { role: "broker" },
        },
      ],
    };
    const [ev] = parseAmplitudeEvents(raw);
    expect(ev.externalId).toBe("ins_1");
    expect(ev.userId).toBe("84213");
    expect(ev.eventType).toBe("listing_viewed");
    expect(ev.eventTime?.getTime()).toBe(1_720_000_000_000);
    expect(ev.eventProperties).toEqual({ listing_id: "L1" });
  });

  it("synthesizes a stable id when insert_id is absent", () => {
    const [ev] = parseAmplitudeEvents([
      { user_id: "1", event_type: "x", event_time: 1000 },
    ]);
    expect(ev.externalId).toContain("1");
    expect(ev.externalId).toContain("x");
  });
});

describe("parseAmplitudeUserProperties", () => {
  it("extracts nested user_properties", () => {
    const [u] = parseAmplitudeUserProperties([
      { user_id: "84213", user_properties: { role: "broker", funnelStage: "active" } },
    ]);
    expect(u.userId).toBe("84213");
    expect(u.properties).toEqual({ role: "broker", funnelStage: "active" });
  });
});

describe("parseAmplitudeCohort", () => {
  it("parses a cohort membership snapshot", () => {
    const c = parseAmplitudeCohort({
      cohort_id: "coh_abc",
      name: "High-intent buyers",
      member_ids: ["84213", "84214"],
    });
    expect(c?.amplitudeCohortId).toBe("coh_abc");
    expect(c?.memberUserIds).toEqual(["84213", "84214"]);
  });

  it("returns null for a payload with no cohort id", () => {
    expect(parseAmplitudeCohort({ name: "x" })).toBeNull();
  });
});
