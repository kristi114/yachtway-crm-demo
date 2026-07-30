import { useSyncExternalStore } from "react";

import { CONTACTS, COMPANIES, type Contact } from "@/lib/mock-data";
import { CONTACT_SECTIONS } from "@/lib/field-schema";
import { applyClauses, filterableFields, type FilterClause } from "@/lib/record-filter";

/**
 * Email audiences ("sending lists").
 *
 * An audience is a *definition*, not a frozen list of addresses: it is resolved
 * against the CRM every time it's used, so a list stays current as contacts are
 * added, re-tagged or opted out. A definition combines three inclusion sources
 * (unioned), then applies suppressions:
 *
 *   1. contactClauses  - the same field-schema filter clauses the Contacts list
 *                        uses (any field, type-aware operators, AND-combined)
 *   2. contactTags     - contacts carrying ANY of these tags
 *   3. companyTags     - every contact at a company carrying ANY of these tags
 *   4. manualEmails    - one-off addresses typed in by hand
 *
 * Suppressions, always applied last and with no way to opt back in from the UI:
 *   - no email address on the contact
 *   - the contact opted out of email (emailOptOut === true)
 *   - the contact's COMPANY opted out of email (an account-level unsubscribe
 *     covers everyone at that account)
 *   - the "Do Not Contact" tag on the contact or its company
 *   - duplicate addresses (first occurrence wins, case-insensitive)
 *
 * Suppression beats every inclusion source, including a hand-typed address:
 * being named explicitly is not consent, and honouring an unsubscribe is a legal
 * obligation rather than a preference. `resolveAudience` is therefore the single
 * gate every send passes through.
 *
 * When the backend lands, `resolveAudience` becomes a query and the suppression
 * rules move into SQL; the shape returned here is what the send route needs.
 */

/** Tag that hard-blocks a contact from every audience. */
export const DNC_TAG = "Do Not Contact";

export interface AudienceDef {
  /** Filter clauses over CONTACT_SECTIONS fields (AND-combined). */
  contactClauses: FilterClause[];
  /** Include contacts carrying any of these tags. */
  contactTags: string[];
  /** Include all contacts at companies carrying any of these tags. */
  companyTags: string[];
  /** Extra hand-typed addresses. */
  manualEmails: string[];
}

export interface SavedAudience extends AudienceDef {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
}

export function emptyAudience(): AudienceDef {
  return { contactClauses: [], contactTags: [], companyTags: [], manualEmails: [] };
}

export function isAudienceEmpty(a: AudienceDef): boolean {
  return (
    a.contactClauses.length === 0 &&
    a.contactTags.length === 0 &&
    a.companyTags.length === 0 &&
    a.manualEmails.length === 0
  );
}

function tagsOf(record: { tags?: unknown }): string[] {
  return Array.isArray(record.tags) ? (record.tags as string[]) : [];
}

function hasAnyTag(record: { tags?: unknown }, wanted: string[]): boolean {
  if (wanted.length === 0) return false;
  const have = tagsOf(record);
  return wanted.some((t) => have.includes(t));
}

/** Every distinct tag in use on contacts (declared options are added by the UI). */
export function contactTagsInUse(): string[] {
  const set = new Set<string>();
  for (const c of CONTACTS) for (const t of tagsOf(c)) set.add(t);
  return [...set].sort();
}

/** Every distinct tag in use on companies. */
export function companyTagsInUse(): string[] {
  const set = new Set<string>();
  for (const co of COMPANIES) for (const t of tagsOf(co)) set.add(t);
  return [...set].sort();
}

export interface AudienceMember {
  email: string;
  /** Present when the address resolves to a CRM contact. */
  contactId?: string;
  name: string;
  companyName?: string;
  /** Which inclusion source pulled this member in (for the preview). */
  via: "filter" | "contact tag" | "company tag" | "manual";
}

export interface ResolvedAudience {
  members: AudienceMember[];
  /** Counts of who was dropped and why - shown in the UI so sends aren't a surprise. */
  suppressed: { noEmail: number; optedOut: number; doNotContact: number; duplicates: number };
}

/** Why a contact can't be mailed, or null when they can. */
export type SuppressionReason = "noEmail" | "optedOut" | "doNotContact";

/**
 * The single consent gate. Every inclusion path — filters, tags, and hand-typed
 * addresses — runs through this, so there is no way to construct an audience
 * that reaches someone who has opted out.
 */
export function suppressionFor(
  contact: { email?: unknown; emailOptOut?: unknown; tags?: unknown },
  company?: { emailOptOut?: unknown; tags?: unknown },
): SuppressionReason | null {
  const email = typeof contact.email === "string" ? contact.email.trim() : "";
  if (!email) return "noEmail";
  // Contact-level unsubscribe.
  if (contact.emailOptOut === true) return "optedOut";
  // Account-level unsubscribe covers everyone at that company.
  if (company?.emailOptOut === true) return "optedOut";
  if (tagsOf(contact).includes(DNC_TAG)) return "doNotContact";
  if (company && tagsOf(company).includes(DNC_TAG)) return "doNotContact";
  return null;
}

/** Convenience for UI badges: can this contact be emailed right now? */
export function isContactMailable(contactId: string): boolean {
  const c = CONTACTS.find((x) => x.id === contactId);
  if (!c) return false;
  const company = c.companyId ? COMPANIES.find((co) => co.id === c.companyId) : undefined;
  return suppressionFor(c, company) === null;
}

/**
 * Resolve a definition to a deduped, suppression-filtered recipient list.
 */
export function resolveAudience(def: AudienceDef): ResolvedAudience {
  const fields = filterableFields(CONTACT_SECTIONS);
  const companyById = new Map(COMPANIES.map((c) => [c.id, c]));
  const suppressed = { noEmail: 0, optedOut: 0, doNotContact: 0, duplicates: 0 };

  // ---- 1. Collect candidate contacts from each inclusion source ----
  const picked = new Map<string, AudienceMember["via"]>();

  if (def.contactClauses.length > 0) {
    const matched = applyClauses(
      CONTACTS as unknown as Record<string, unknown>[],
      def.contactClauses,
      fields,
      (c) => ({
        company: c.companyId ? companyById.get(String(c.companyId))?.name ?? "" : "",
      }),
    ) as unknown as Contact[];
    for (const c of matched) if (!picked.has(c.id)) picked.set(c.id, "filter");
  }

  if (def.contactTags.length > 0) {
    for (const c of CONTACTS) {
      if (hasAnyTag(c, def.contactTags) && !picked.has(c.id)) picked.set(c.id, "contact tag");
    }
  }

  if (def.companyTags.length > 0) {
    const taggedCompanyIds = new Set(
      COMPANIES.filter((co) => hasAnyTag(co, def.companyTags)).map((co) => co.id),
    );
    for (const c of CONTACTS) {
      if (c.companyId && taggedCompanyIds.has(c.companyId) && !picked.has(c.id)) {
        picked.set(c.id, "company tag");
      }
    }
  }

  // ---- 2. Apply suppressions and dedupe ----
  const seen = new Set<string>();
  const members: AudienceMember[] = [];

  for (const [contactId, via] of picked) {
    const c = CONTACTS.find((x) => x.id === contactId);
    if (!c) continue;
    const company = c.companyId ? companyById.get(c.companyId) : undefined;
    const reason = suppressionFor(c, company);
    if (reason) { suppressed[reason] += 1; continue; }
    const email = (c.email as string).trim();
    const key = email.toLowerCase();
    if (seen.has(key)) { suppressed.duplicates += 1; continue; }
    seen.add(key);
    members.push({
      email,
      contactId: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      companyName: company?.name,
      via,
    });
  }

  // ---- 3. Manual addresses ----
  // These go through the SAME consent gate. Typing an address by hand is not
  // consent: if it resolves to a contact who unsubscribed (or whose company
  // did), it is dropped exactly as if it had come from a filter.
  for (const raw of def.manualEmails) {
    const email = raw.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) { suppressed.duplicates += 1; continue; }
    const match = CONTACTS.find((c) => c.email && c.email.toLowerCase() === key);
    if (match) {
      const company = match.companyId ? companyById.get(match.companyId) : undefined;
      const reason = suppressionFor(match, company);
      if (reason) { suppressed[reason] += 1; continue; }
    }
    seen.add(key);
    members.push({
      email,
      contactId: match?.id,
      name: match ? `${match.firstName} ${match.lastName}`.trim() : email.split("@")[0],
      companyName: match?.companyId ? companyById.get(match.companyId)?.name : undefined,
      via: "manual",
    });
  }

  return { members, suppressed };
}

/** Convenience: just the addresses, in resolution order. */
export function audienceEmails(def: AudienceDef): string[] {
  return resolveAudience(def).members.map((m) => m.email);
}

/* ------------------------------------------------------------------ */
/* Saved audiences (localStorage-backed)                               */
/* ------------------------------------------------------------------ */

const KEY = "yw:email-audiences:v1";

function load(): SavedAudience[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedAudience[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let state: SavedAudience[] = load();
const listeners = new Set<() => void>();
const snapshot = () => state;

function emit() {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function listAudiences(): SavedAudience[] {
  return state;
}

export function getAudience(id: string): SavedAudience | undefined {
  return state.find((a) => a.id === id);
}

export function saveAudience(name: string, def: AudienceDef, createdBy: string): SavedAudience {
  const created: SavedAudience = {
    ...def,
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || "Untitled list",
    createdAt: new Date().toISOString(),
    createdBy,
  };
  state = [created, ...state];
  emit();
  return created;
}

export function deleteAudience(id: string) {
  state = state.filter((a) => a.id !== id);
  emit();
}

export function useAudiences(): SavedAudience[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    snapshot,
    snapshot,
  );
}
