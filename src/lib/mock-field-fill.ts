import type { FieldDef, FieldSection } from "./field-schema";

/**
 * Deterministic mock value generator.
 *
 * The field catalog defines ~700 fields per record family, far more than the
 * hand-written sample records carry. Rather than hand-authoring every value we
 * backfill any catalog field that a sample record does not already define with
 * a plausible, stable value derived from the record id + field key.
 */

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const WORDS = [
  "Atlantic", "Harbor", "Marine", "Coastal", "Azure", "Nautica", "Bluewater",
  "Windward", "Regatta", "Anchor", "Pearl", "Trident",
];

const SENTENCES = [
  "Reviewed with the account owner during the last quarterly check-in.",
  "Imported from the legacy system, pending verification by the data team.",
  "Confirmed by the dealer contact over email; no follow-up required.",
  "Flagged for review at the next pipeline sync.",
];

function isoDate(offsetDays: number): string {
  const d = new Date(Date.UTC(2026, 6, 25));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Picklist option sets inferred from the field key when the catalog does not
// enumerate values.
const KEY_OPTIONS: readonly (readonly [RegExp, readonly string[]])[] = [
  [/currency/i, ["USD", "EUR", "GBP"]],
  [/country/i, ["United States", "Italy", "Spain", "United Arab Emirates"]],
  [/tier/i, ["Bronze", "Silver", "Gold", "Platinum"]],
  [/(status|state)$/i, ["Active", "Pending", "Inactive"]],
  [/stage/i, ["Discovery", "Proposal", "Negotiation", "Closed Won"]],
  [/source/i, ["Inbound", "Referral", "Boat Show", "Outbound"]],
  [/(type|category)/i, ["Standard", "Premium", "Enterprise"]],
  [/reason/i, ["Budget", "Timing", "Competitor", "No response"]],
  [/language/i, ["English", "Italian", "Spanish", "French"]],
  [/frequency|cadence/i, ["Weekly", "Monthly", "Quarterly"]],
];

function pickFromKey(key: string, h: number): string {
  for (const [re, opts] of KEY_OPTIONS) {
    if (re.test(key)) return opts[h % opts.length];
  }
  return ["Standard", "Preferred", "Review", "Other"][h % 4];
}


function mockValue(field: FieldDef, seedBase: string): unknown {
  const h = hash(`${seedBase}:${field.key}`);
  // Roughly a fifth of optional catalog fields stay blank so profiles do not
  // look uniformly populated.
  const blank = h % 5 === 0;

  switch (field.type) {
    case "checkbox":
      return h % 3 === 0;
    case "number":
      return blank ? 0 : h % 250;
    case "money":
      return blank ? 0 : (h % 900 + 5) * 500;
    case "date":
      return blank ? "" : isoDate(-(h % 540));
    case "email":
      return blank ? "" : `${WORDS[h % WORDS.length].toLowerCase()}.${h % 97}@example.com`;
    case "phone":
      return blank ? "" : `+1 (305) ${200 + (h % 700)}-${1000 + (h % 8999)}`;
    case "url":
      return blank ? "" : `https://www.${WORDS[h % WORDS.length].toLowerCase()}-yachts.com`;
    case "textarea":
      return blank ? "" : SENTENCES[h % SENTENCES.length];
    case "single_option":
      if (field.options?.length) return blank ? "" : field.options[h % field.options.length];
      return blank ? "" : pickFromKey(field.key, h);
    case "multi_option":
      if (field.options?.length) {
        return blank ? [] : field.options.filter((_, i) => (h >> i) % 3 === 0).slice(0, 3);
      }
      return blank ? [] : [WORDS[h % WORDS.length], WORDS[(h + 5) % WORDS.length]];
    default:
      if (/id$/i.test(field.key)) return blank ? "" : `${field.key.slice(0, 4).toUpperCase()}-${100000 + (h % 899999)}`;
      return blank ? "" : `${WORDS[h % WORDS.length]} ${WORDS[(h + 3) % WORDS.length]}`;
  }
}

/** Fill every catalog field the record does not already define. Mutates in place. */
export function fillCatalogFields<T extends Record<string, unknown>>(
  records: readonly T[],
  sections: readonly FieldSection[],
): void {
  for (const record of records) {
    const seedBase = String(record.id ?? "record");
    for (const section of sections) {
      for (const field of section.fields) {
        if (record[field.key] !== undefined) continue;
        (record as Record<string, unknown>)[field.key] = mockValue(field, seedBase);
      }
    }
  }
}
