/**
 * Merge tags for email personalisation.
 *
 * A tag is written `{{snake_case}}` in the subject, pre-header, title or body and
 * is substituted per recipient at send time. Each definition carries the CRM
 * field it resolves from, a sample value (used for the preview), and a fallback
 * used when the record has no value — an empty personalisation is worse than a
 * generic one ("Hi ," reads as broken).
 *
 * When the backend lands, `renderMergeTags` moves server-side and resolves from
 * the real contact/company row; the tag list here stays the source of truth for
 * what the editor offers.
 */

export type MergeTagGroup = "Contact" | "Company" | "Sender" | "System";

export interface MergeTagDef {
  /** The token without braces, e.g. "first_name". */
  tag: string;
  label: string;
  group: MergeTagGroup;
  /** CRM field this resolves from (documentation for the backend mapping). */
  source: string;
  /** Shown in the preview. */
  sample: string;
  /** Used when the record's value is blank. */
  fallback: string;
}

export const MERGE_TAGS: MergeTagDef[] = [
  // ---- Contact ----
  { tag: "first_name", label: "First name", group: "Contact", source: "contact.firstName", sample: "Marco", fallback: "there" },
  { tag: "last_name", label: "Last name", group: "Contact", source: "contact.lastName", sample: "Delgado", fallback: "" },
  { tag: "full_name", label: "Full name", group: "Contact", source: "contact.firstName + lastName", sample: "Marco Delgado", fallback: "there" },
  { tag: "email", label: "Email", group: "Contact", source: "contact.email", sample: "marco.delgado@rivierayachtsmiami.com", fallback: "" },
  { tag: "contact_title", label: "Job title", group: "Contact", source: "contact.title", sample: "Sales Manager", fallback: "" },
  { tag: "mobile_phone", label: "Mobile", group: "Contact", source: "contact.mobilePhone", sample: "+1 305 555 0143", fallback: "" },

  // ---- Company ----
  { tag: "company_name", label: "Company name", group: "Company", source: "company.name", sample: "Riviera Yachts Miami", fallback: "your dealership" },
  { tag: "dealer_tier", label: "Dealer tier", group: "Company", source: "company.dealerTier", sample: "Platinum", fallback: "" },
  { tag: "company_city", label: "City", group: "Company", source: "company.billingCity", sample: "Miami", fallback: "" },
  { tag: "company_website", label: "Website", group: "Company", source: "company.website", sample: "rivierayachtsmiami.com", fallback: "" },
  { tag: "dealer_page", label: "YachtWay dealer page", group: "Company", source: "company.yachtwayDealerPage", sample: "https://YachtWay.com/dealer/riviera-yachts-miami", fallback: "https://YachtWay.com" },
  { tag: "active_listings", label: "Active listings", group: "Company", source: "company.activeListings", sample: "47", fallback: "0" },

  // ---- Sender (the rep sending it) ----
  { tag: "sender_name", label: "Sender name", group: "Sender", source: "user.name", sample: "Mavil", fallback: "The YachtWay team" },
  { tag: "sender_email", label: "Sender email", group: "Sender", source: "user.email", sample: "mavil@yachtway.com", fallback: "hello@yachtway.com" },

  // ---- System ----
  { tag: "unsubscribe_url", label: "Unsubscribe link", group: "System", source: "generated per recipient", sample: "https://yachtway.com/u/abc123", fallback: "https://yachtway.com/unsubscribe" },
  { tag: "preferences_url", label: "Email preferences link", group: "System", source: "generated per recipient", sample: "https://yachtway.com/p/abc123", fallback: "https://yachtway.com/preferences" },
  { tag: "current_year", label: "Current year", group: "System", source: "server date", sample: String(new Date().getFullYear()), fallback: String(new Date().getFullYear()) },
];

export const MERGE_TAG_GROUPS: MergeTagGroup[] = ["Contact", "Company", "Sender", "System"];

export function mergeTagsByGroup(group: MergeTagGroup): MergeTagDef[] {
  return MERGE_TAGS.filter((t) => t.group === group);
}

/** The literal token to insert into a field, e.g. "{{first_name}}". */
export function tagToken(tag: string): string {
  return `{{${tag}}}`;
}

const TAG_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Every tag used in a string (deduped, in order of first appearance). */
export function tagsUsedIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    const tag = m[1].toLowerCase();
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

/** Tags present in the text that aren't in the known list (likely typos). */
export function unknownTagsIn(text: string): string[] {
  const known = new Set(MERGE_TAGS.map((t) => t.tag));
  return tagsUsedIn(text).filter((t) => !known.has(t));
}

/**
 * Substitute tags for display. Pass `values` to render real data; anything
 * missing falls back to the tag's `fallback`. With no values, renders the
 * sample data (the editor's "Preview with sample data" mode).
 */
export function renderMergeTags(
  text: string,
  values?: Record<string, string | undefined>,
): string {
  const byTag = new Map(MERGE_TAGS.map((t) => [t.tag, t]));
  return text.replace(TAG_RE, (whole, rawTag: string) => {
    const tag = rawTag.toLowerCase();
    const def = byTag.get(tag);
    if (!def) return whole; // leave unknown tags visible rather than blanking them
    if (values) {
      const v = values[tag];
      return v && v.trim() !== "" ? v : def.fallback;
    }
    return def.sample;
  });
}

/** Sample-data map for previewing. */
export function sampleValues(): Record<string, string> {
  return Object.fromEntries(MERGE_TAGS.map((t) => [t.tag, t.sample]));
}
