import { describe, expect, it } from "vitest";
import {
  personalizeHtml,
  personalizeSubject,
  unresolvedTokens,
  type Personalization,
} from "./personalize.js";

const KONNER: Personalization = {
  firstName: "Konner",
  lastName: "Brown",
  email: "konner@jeffbrownyachts.com",
  companyName: "Jeff Brown Yachts",
};

const ANON: Personalization = {
  firstName: null,
  lastName: null,
  email: "someone@example.com",
  companyName: null,
};

describe("merge tags", () => {
  it("fills the GHL-compatible contact and company tags", () => {
    const html = `<p>{{contact.first_name}} {{contact.last_name}} at {{company.name}} ({{contact.email}})</p>`;
    expect(personalizeHtml(html, KONNER)).toBe(
      `<p>Konner Brown at Jeff Brown Yachts (konner@jeffbrownyachts.com)</p>`,
    );
  });

  it("supports full_name and name as aliases", () => {
    expect(personalizeHtml("{{contact.full_name}}", KONNER)).toBe("Konner Brown");
    expect(personalizeHtml("{{contact.name}}", KONNER)).toBe("Konner Brown");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(personalizeHtml("{{ contact.first_name }}", KONNER)).toBe("Konner");
  });

  it("uses an explicit pipe fallback when the value is missing", () => {
    expect(personalizeHtml("Hi {{contact.first_name|there}},", ANON)).toBe("Hi there,");
    // ...and ignores the fallback when there is a real value.
    expect(personalizeHtml("Hi {{contact.first_name|there}},", KONNER)).toBe("Hi Konner,");
  });

  it("renders nothing for a missing value with no fallback", () => {
    expect(personalizeHtml("Hi {{contact.first_name}},", ANON)).toBe("Hi ,");
  });

  it("leaves an UNRECOGNISED token verbatim rather than blanking it", () => {
    // Silently eating a typo hides it; seeing it in a test send is how it gets found.
    expect(personalizeHtml("{{contact.nickname}}", KONNER)).toBe("{{contact.nickname}}");
  });

  it("does not touch the compliance tags — footer.ts owns those", () => {
    const html = `{{email.unsubscribe_link}} {{location.address}}`;
    expect(personalizeHtml(html, KONNER)).toBe(html);
  });

  it("treats a whitespace-only value as missing", () => {
    expect(personalizeHtml("Hi {{contact.first_name|there}},", { firstName: "   " })).toBe(
      "Hi there,",
    );
  });
});

describe("escaping", () => {
  it("escapes html in body copy so a name cannot inject markup", () => {
    const out = personalizeHtml("<p>{{contact.first_name}}</p>", {
      firstName: `<script>alert(1)</script>`,
    });
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes an ampersand in a company name", () => {
    expect(personalizeHtml("{{company.name}}", { companyName: "Smith & Sons" })).toBe(
      "Smith &amp; Sons",
    );
  });

  it("does NOT html-escape the subject — it is a header, not markup", () => {
    expect(personalizeSubject("{{company.name}} results", { companyName: "Smith & Sons" })).toBe(
      "Smith & Sons results",
    );
  });

  it("strips CR/LF from the subject — a newline in a header is injection", () => {
    const out = personalizeSubject("Hello {{contact.first_name}}", {
      firstName: "Eve\r\nBcc: victim@example.com",
    });
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toBe("Hello Eve Bcc: victim@example.com");
  });
});

describe("unresolvedTokens", () => {
  it("reports tags that would render empty, for a pre-send warning", () => {
    const html = `Hi {{contact.first_name}}, your {{company.name}} report`;
    expect(unresolvedTokens(html, ANON).sort()).toEqual(["company.name", "contact.first_name"]);
  });

  it("does not report a tag that has a fallback", () => {
    expect(unresolvedTokens("Hi {{contact.first_name|there}}", ANON)).toEqual([]);
  });

  it("does not report a tag that resolves", () => {
    expect(unresolvedTokens("Hi {{contact.first_name}}", KONNER)).toEqual([]);
  });

  it("ignores unrecognised tags", () => {
    expect(unresolvedTokens("{{contact.nickname}}", ANON)).toEqual([]);
  });

  it("de-duplicates a tag used twice", () => {
    expect(unresolvedTokens("{{contact.first_name}} {{contact.first_name}}", ANON)).toEqual([
      "contact.first_name",
    ]);
  });
});

// The /g regex is module-level, so .test()/.replace() interleaving must not leave
// lastIndex behind — the same trap that footer.ts guards against.
describe("regex statefulness", () => {
  it("is stable across repeated calls", () => {
    for (let i = 0; i < 4; i += 1) {
      expect(personalizeHtml("Hi {{contact.first_name}}", KONNER)).toBe("Hi Konner");
      expect(unresolvedTokens("Hi {{contact.first_name}}", ANON)).toEqual(["contact.first_name"]);
    }
  });
});
