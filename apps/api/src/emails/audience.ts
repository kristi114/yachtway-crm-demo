import type { Prisma } from "@prisma/client";
import {
  type AudienceDef,
  DO_NOT_CONTACT_TAG,
  type ResolvedAudience,
  type SuppressionReason,
} from "@yachtway/shared";

/**
 * Server-side audience resolution — the single consent gate.
 *
 * Every inclusion path (saved filters, contact tags, company tags, explicit
 * contact ids, hand-typed addresses) funnels through `suppressionFor`, so there
 * is no way to construct a send that reaches someone who opted out. Ported from
 * the standalone build's src/lib/audiences.ts, which is the spec.
 *
 * Consent model (opt-OUT):
 *   contact.emailOptOut            → that person only
 *   company.accountWideEmailOptOut → everyone at the account
 *   company.emailOptOut            → the company's shared address ONLY; says
 *                                    nothing about its people, so it is NOT
 *                                    consulted here
 *   "Do Not Contact" tag on either → blocked
 */

type ContactRow = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  emailOptOut: boolean | null;
  companyId: string | null;
  tags: { name: string }[];
  companyRecord: {
    id: string;
    name: string | null;
    accountWideEmailOptOut: boolean | null;
    tags: { name: string }[];
  } | null;
};

const contactInclude = {
  tags: { select: { name: true } },
  companyRecord: {
    select: {
      id: true,
      name: true,
      accountWideEmailOptOut: true,
      tags: { select: { name: true } },
    },
  },
} satisfies Prisma.ContactInclude;

function hasDnc(tags: { name: string }[] | undefined): boolean {
  if (!tags) return false;
  return tags.some((t) => t.name.trim().toLowerCase() === DO_NOT_CONTACT_TAG.toLowerCase());
}

/**
 * Why this contact may not be mailed, or null when they may. Never returns
 * "duplicate" — that is a property of the assembled list, not of the person.
 */
export function suppressionFor(
  c: ContactRow,
): Exclude<SuppressionReason, "duplicate"> | null {
  const email = (c.email ?? "").trim();
  if (!email) return "noEmail";
  if (c.emailOptOut === true) return "optedOut";
  if (c.companyRecord?.accountWideEmailOptOut === true) return "optedOut";
  if (hasDnc(c.tags)) return "doNotContact";
  if (hasDnc(c.companyRecord?.tags)) return "doNotContact";
  return null;
}

function displayName(c: ContactRow): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || (c.email ?? "");
}

/**
 * Turn a definition into a deduped, suppression-filtered recipient list plus the
 * counts of who was dropped and why. Runs inside the caller's transaction so RLS
 * still applies to the contact/company reads.
 */
export async function resolveAudience(
  tx: Prisma.TransactionClient,
  def: AudienceDef & { contactIds?: string[]; explicitEmails?: string[] },
): Promise<ResolvedAudience> {
  const suppressed = { noEmail: 0, optedOut: 0, doNotContact: 0, duplicates: 0 };
  const byEmail = new Map<string, ResolvedAudience["members"][number]>();

  const add = (
    c: ContactRow,
    via: ResolvedAudience["members"][number]["via"],
  ): void => {
    const reason = suppressionFor(c);
    if (reason) {
      suppressed[reason] += 1;
      return;
    }
    const key = (c.email ?? "").trim().toLowerCase();
    if (byEmail.has(key)) {
      suppressed.duplicates += 1;
      return;
    }
    byEmail.set(key, {
      email: (c.email ?? "").trim(),
      contactId: c.id,
      name: displayName(c),
      companyName: c.companyRecord?.name ?? null,
      via,
    });
  };

  // 1. Explicit contact ids (the "email this contact" path).
  if (def.contactIds?.length) {
    const rows = (await tx.contact.findMany({
      where: { id: { in: def.contactIds } },
      include: contactInclude,
    })) as unknown as ContactRow[];
    for (const c of rows) add(c, "filter");
  }

  // 2. Saved filter clauses. Only equality on a scalar column is supported for
  //    now; anything else is ignored rather than guessed at.
  if (def.contactClauses?.length) {
    const where: Prisma.ContactWhereInput = {};
    for (const clause of def.contactClauses) {
      if (!clause || typeof clause.field !== "string") continue;
      if (clause.op !== "eq" && clause.op !== "equals") continue;
      (where as Record<string, unknown>)[clause.field] = clause.value;
    }
    if (Object.keys(where).length > 0) {
      const rows = (await tx.contact.findMany({
        where,
        include: contactInclude,
      })) as unknown as ContactRow[];
      for (const c of rows) add(c, "filter");
    }
  }

  // 3. Contact tags.
  if (def.contactTags?.length) {
    const rows = (await tx.contact.findMany({
      where: { tags: { some: { name: { in: def.contactTags } } } },
      include: contactInclude,
    })) as unknown as ContactRow[];
    for (const c of rows) add(c, "contact tag");
  }

  // 4. Company tags — everyone at a matching company.
  if (def.companyTags?.length) {
    const rows = (await tx.contact.findMany({
      where: { companyRecord: { tags: { some: { name: { in: def.companyTags } } } } },
      include: contactInclude,
    })) as unknown as ContactRow[];
    for (const c of rows) add(c, "company tag");
  }

  // 5. Hand-typed addresses. These still pass the gate: if the address belongs
  //    to a contact who opted out, it is suppressed like any other.
  const manual = [...(def.manualEmails ?? []), ...(def.explicitEmails ?? [])]
    .map((e) => e.trim())
    .filter(Boolean);
  if (manual.length) {
    const known = (await tx.contact.findMany({
      where: { email: { in: manual, mode: "insensitive" } },
      include: contactInclude,
    })) as unknown as ContactRow[];
    const knownByEmail = new Map(known.map((c) => [(c.email ?? "").toLowerCase(), c]));
    for (const address of manual) {
      const hit = knownByEmail.get(address.toLowerCase());
      if (hit) {
        add(hit, "manual");
        continue;
      }
      const key = address.toLowerCase();
      if (byEmail.has(key)) {
        suppressed.duplicates += 1;
        continue;
      }
      byEmail.set(key, {
        email: address,
        contactId: null,
        name: null,
        companyName: null,
        via: "manual",
      });
    }
  }

  return { members: [...byEmail.values()], suppressed };
}
