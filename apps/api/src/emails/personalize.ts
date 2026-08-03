/**
 * Per-recipient merge tags.
 *
 * Tag names match GoHighLevel's so a template can move between GHL and the CRM
 * without a rewrite: `{{contact.first_name}}`, `{{company.name}}`, and so on.
 * Compliance tags ({{email.unsubscribe_link}}, {{location.address}}) are handled
 * separately in footer.ts — those carry legal weight and have their own gate.
 *
 * An explicit fallback is supported with a pipe: `{{contact.first_name|there}}`.
 * Campaign copy should always use one. With no fallback a missing value renders as
 * nothing, which is how you get "Hi ," in someone's inbox, so `unresolvedTokens()`
 * exists to let a caller see the problem before sending rather than after.
 */

export interface Personalization {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  companyName?: string | null;
}

/** `{{ns.field}}` or `{{ns.field|fallback}}`, tolerant of internal whitespace. */
const TOKEN = /\{\{\s*(contact|company)\.([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi;

function fullName(p: Personalization): string {
  return [p.firstName, p.lastName].filter((x) => x && x.trim()).join(" ");
}

/** Resolve one token to its raw (unescaped) value, or null when unknown/empty. */
function lookup(ns: string, field: string, p: Personalization): string | null {
  const key = `${ns.toLowerCase()}.${field.toLowerCase()}`;
  const value = ((): string | null | undefined => {
    switch (key) {
      case "contact.first_name":
        return p.firstName;
      case "contact.last_name":
        return p.lastName;
      case "contact.name":
      case "contact.full_name":
        return fullName(p);
      case "contact.email":
        return p.email;
      case "company.name":
        return p.companyName;
      default:
        return undefined; // unknown token: left alone, see replaceTokens
    }
  })();
  if (value === undefined) return null;
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function isKnown(ns: string, field: string): boolean {
  return (
    lookup(ns, field, {
      firstName: "x",
      lastName: "x",
      email: "x",
      companyName: "x",
    }) !== null
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceTokens(
  text: string,
  p: Personalization,
  opts: { escape: boolean },
): string {
  TOKEN.lastIndex = 0;
  return text.replace(TOKEN, (whole, ns: string, field: string, fallback?: string) => {
    // An unrecognised token is left verbatim rather than blanked: silently eating
    // {{contact.nickname}} hides the mistake, whereas seeing it in a test send is
    // how the author finds out.
    if (!isKnown(ns, field)) return whole;
    const value = lookup(ns, field, p) ?? (fallback ?? "").trim();
    return opts.escape ? escapeHtml(value) : value;
  });
}

/** Body copy. Values are HTML-escaped: a company called "Smith & Sons" is fine,
 *  and a contact whose name contains a tag cannot inject markup. */
export function personalizeHtml(html: string, p: Personalization): string {
  return replaceTokens(html, p, { escape: true });
}

/**
 * Subject line. NOT HTML-escaped (it is a MIME header, not markup), but CR and LF
 * are stripped: a newline in a header value is header injection, and the value
 * comes from contact data the CRM did not necessarily author.
 */
export function personalizeSubject(subject: string, p: Personalization): string {
  return replaceTokens(subject, p, { escape: false }).replace(/[\r\n]+/g, " ").trim();
}

/**
 * Tokens that would render as nothing for this recipient, with no fallback given.
 * Intended for a pre-send check in the campaign UI: "3 of 120 recipients have no
 * first name" is a decision for the sender, not something to discover in a reply.
 */
export function unresolvedTokens(text: string, p: Personalization): string[] {
  TOKEN.lastIndex = 0;
  const missing: string[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const [, ns = "", field = "", fallback] = m;
    if (!isKnown(ns, field)) continue;
    const hasFallback = (fallback ?? "").trim() !== "";
    if (!hasFallback && lookup(ns, field, p) === null) {
      missing.push(`${ns.toLowerCase()}.${field.toLowerCase()}`);
    }
  }
  return [...new Set(missing)];
}
