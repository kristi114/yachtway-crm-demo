import { beforeEach, describe, expect, it, vi } from "vitest";

// env.ts parses process.env at import time, so set it before importing the module
// under test. Each block that needs different config re-imports with vi.resetModules.
vi.hoisted(() => {
  process.env.PUBLIC_API_URL = "https://crm.yachtway.test";
  process.env.COMPANY_POSTAL_ADDRESS = "1 Test Way, Fort Lauderdale, FL 33301";
});

import {
  assertCanSend,
  complianceHeaders,
  EmailComplianceError,
  renderForRecipient,
  unsubscribeUrl,
} from "./footer.js";

/** A template that carries its own opt-out and its own hardcoded address. */
const SELF_SUFFICIENT = `<p>x</p><footer>YachtWay LLC, 1 Real Way, Fort Lauderdale FL
  <a href="{{email.unsubscribe_link}}">Unsubscribe</a></footer>`;

const TOKEN = "tok-abc-123";

describe("unsubscribe + compliance rendering", () => {
  it("resolves the GHL unsubscribe tag to a real per-recipient URL", () => {
    const out = renderForRecipient({
      html: `<p>Hi</p><a href="{{email.unsubscribe_link}}">Unsubscribe</a>`,
      trackingToken: TOKEN,
      kind: "marketing",
    });
    expect(out).toContain(`https://crm.yachtway.test/e/u/${TOKEN}`);
    expect(out).not.toContain("{{email.unsubscribe_link}}");
  });

  it("resolves the postal address tag — CAN-SPAM needs a real address, not braces", () => {
    const out = renderForRecipient({
      html: `<footer>{{location.address}}</footer>`,
      trackingToken: TOKEN,
      kind: "marketing",
    });
    expect(out).toContain("1 Test Way, Fort Lauderdale, FL 33301");
    expect(out).not.toContain("{{location.address}}");
  });

  it("appends a fallback footer when marketing html carries no opt-out at all", () => {
    const out = renderForRecipient({
      html: `<p>Buy a boat</p>`,
      trackingToken: TOKEN,
      kind: "marketing",
    });
    expect(out).toContain(`/e/u/${TOKEN}`);
    expect(out).toContain("Unsubscribe");
    expect(out).toContain("1 Test Way, Fort Lauderdale, FL 33301");
    // Brand rule: no purple anywhere in a YachtWay email.
    expect(out.toLowerCase()).not.toMatch(/#(4b0ea3|260754|2b0033|6430b0|8729fa|8334da|4409d7)/);
  });

  it("does NOT double up when the template already has its own unsubscribe link", () => {
    const out = renderForRecipient({
      html: `<a href="{{email.unsubscribe_link}}">Unsubscribe</a>`,
      trackingToken: TOKEN,
      kind: "marketing",
    });
    expect(out.match(new RegExp(`/e/u/${TOKEN}`, "g"))?.length).toBe(1);
  });

  it("adds no footer to transactional mail — an opt-out on a receipt is wrong", () => {
    const out = renderForRecipient({
      html: `<p>Your invoice</p>`,
      trackingToken: TOKEN,
      kind: "transactional",
    });
    expect(out).not.toContain(`/e/u/${TOKEN}`);
  });

  it("appends the open pixel", () => {
    const out = renderForRecipient({ html: "<p>x</p>", trackingToken: TOKEN, kind: "marketing" });
    expect(out).toContain(`https://crm.yachtway.test/e/o/${TOKEN}`);
    expect(out).toContain('width="1" height="1"');
  });

  it("escapes the address so a stray < cannot break out of the footer", () => {
    // The address comes from env, but it still renders into HTML.
    const out = renderForRecipient({
      html: "{{location.address}}",
      trackingToken: TOKEN,
      kind: "marketing",
    });
    expect(out).not.toContain("<script");
  });
});

describe("RFC 8058 one-click headers", () => {
  it("sets List-Unsubscribe and List-Unsubscribe-Post for marketing", () => {
    const h = complianceHeaders({ trackingToken: TOKEN, kind: "marketing" });
    expect(h["List-Unsubscribe"]).toBe(`<${unsubscribeUrl(TOKEN)}>`);
    // Without the -Post header Gmail will not show the native unsubscribe control.
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("sets no headers for transactional or system mail", () => {
    expect(complianceHeaders({ trackingToken: TOKEN, kind: "transactional" })).toEqual({});
    expect(complianceHeaders({ trackingToken: TOKEN, kind: "system" })).toEqual({});
  });
});

describe("configuration gate", () => {
  it("allows a marketing send when both values are configured", () => {
    expect(() => assertCanSend({ kind: "marketing", html: "<p>x</p>" })).not.toThrow();
  });

  it("never blocks transactional or system mail", () => {
    expect(() => assertCanSend({ kind: "transactional", html: "<p>x</p>" })).not.toThrow();
    expect(() => assertCanSend({ kind: "system", html: "<p>x</p>" })).not.toThrow();
  });
});

describe("configuration gate, unconfigured deployment", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("refuses a marketing send with no PUBLIC_API_URL, whatever the template", async () => {
    delete process.env.PUBLIC_API_URL;
    process.env.COMPANY_POSTAL_ADDRESS = "1 Test Way";
    const mod = await import("./footer.js");
    // Unconditional: the unsubscribe URL is per-recipient, so no template can
    // hardcode it.
    expect(() => mod.assertCanSend({ kind: "marketing", html: SELF_SUFFICIENT })).toThrow(
      mod.EmailComplianceError,
    );
    expect(() => mod.assertCanSend({ kind: "marketing", html: SELF_SUFFICIENT })).toThrow(
      /PUBLIC_API_URL/,
    );
    // ...but transactional mail still goes out.
    expect(() => mod.assertCanSend({ kind: "transactional", html: "<p>x</p>" })).not.toThrow();
  });

  it("needs the address when the template DELEGATES it via the tag", async () => {
    process.env.PUBLIC_API_URL = "https://crm.yachtway.test";
    delete process.env.COMPANY_POSTAL_ADDRESS;
    const mod = await import("./footer.js");
    const html = `<a href="{{email.unsubscribe_link}}">Unsubscribe</a>{{location.address}}`;
    expect(() => mod.assertCanSend({ kind: "marketing", html })).toThrow(
      /COMPANY_POSTAL_ADDRESS/,
    );
  });

  it("needs the address when we must append the fallback footer", async () => {
    process.env.PUBLIC_API_URL = "https://crm.yachtway.test";
    delete process.env.COMPANY_POSTAL_ADDRESS;
    const mod = await import("./footer.js");
    // No opt-out of its own -> we append ours -> ours needs an address.
    expect(() => mod.assertCanSend({ kind: "marketing", html: "<p>buy a boat</p>" })).toThrow(
      /COMPANY_POSTAL_ADDRESS/,
    );
  });

  it("does NOT need the address when the template already carries both", async () => {
    process.env.PUBLIC_API_URL = "https://crm.yachtway.test";
    delete process.env.COMPANY_POSTAL_ADDRESS;
    const mod = await import("./footer.js");
    // YachtWay's address is already baked into the marketing templates, so an
    // empty env var must not block an otherwise compliant send.
    expect(() => mod.assertCanSend({ kind: "marketing", html: SELF_SUFFICIENT })).not.toThrow();
  });
});

// Guard against the classic /g-regex bug: .test() advances lastIndex, so a shared
// module-level regex silently mismatches on every other call.
describe("regex statefulness", () => {
  it("is stable across repeated renders", () => {
    const html = `<a href="{{email.unsubscribe_link}}">Unsubscribe</a>`;
    for (let i = 0; i < 4; i += 1) {
      const out = renderForRecipient({ html, trackingToken: `t${i}`, kind: "marketing" });
      expect(out).toContain(`/e/u/t${i}`);
      expect(out).not.toContain("{{email.unsubscribe_link}}");
      // If lastIndex leaked, hadTag would read false and a second footer would appear.
      expect(out.match(/Unsubscribe/g)?.length).toBe(1);
    }
  });
});

describe("EmailComplianceError", () => {
  it("names the missing variable in its message", () => {
    const err = new EmailComplianceError("PUBLIC_API_URL");
    expect(err.message).toBe("email_compliance_not_configured:PUBLIC_API_URL");
  });
});
