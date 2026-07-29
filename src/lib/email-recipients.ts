import { CONTACTS } from "@/lib/mock-data";
import { listSentEmails, type SentEmail } from "@/lib/email-send";
import type { CommsLogEntry } from "@/lib/comms-log";

/** Strip HTML to a short plain-text snippet for the interaction timeline. */
function htmlSnippet(html?: string): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

/**
 * Transactional (Gmail) emails sent to a contact, shaped as comms-log entries
 * so they render in the interaction timeline alongside calls, chats and notes.
 * Only kind === "transactional" sends addressed directly to the contact are
 * included - system (SES) and marketing (Mailgun) email stay in the Emails tab.
 */
export function transactionalCommsForContact(contactId: string): CommsLogEntry[] {
  const c = CONTACTS.find((x) => x.id === contactId);
  if (!c?.email) return [];
  const email = c.email.toLowerCase();
  return listSentEmails()
    .filter((s) => s.kind === "transactional" && s.to.some((t) => t.toLowerCase() === email))
    .map((s) => ({
      id: `cm_email_${s.id}`,
      relatedType: "contact" as const,
      relatedId: contactId,
      channel: "Email" as const,
      direction: "outbound" as const,
      author: "You",
      contactName: `${c.firstName} ${c.lastName}`.trim(),
      subject: s.subject,
      body: htmlSnippet(s.html) || (s.templateName ? `Sent "${s.templateName}"` : "Sent via Gmail"),
      occurred_at: s.sentAt,
      createdAt: s.sentAt,
      email_kind: "transactional" as const,
      email_provider: "gmail" as const,
    }));
}

/**
 * Expand a send into individual recipient rows for the per-send report.
 *
 * In this mock build the recipient list is derived from the CRM's contacts and
 * the send's aggregate metrics (delivered/opened/clicked) so per-person status
 * is internally consistent. When the backend is wired, replace `buildRecipientRows`
 * with the real per-recipient event data from Mailgun (delivered/opened/clicked/
 * bounced events joined to contacts).
 */

export type RecipientStatus = "Clicked" | "Opened" | "Delivered" | "Bounced";

export interface RecipientRow {
  id: string;
  name: string;
  email: string;
  status: RecipientStatus;
  /** Present when this recipient resolves to a real CRM contact (links to it). */
  contactId?: string;
}

/** Cap how many individual rows we materialize for very large campaigns. */
const MAX_ROWS = 250;

export function buildRecipientRows(s: SentEmail): {
  rows: RecipientRow[];
  total: number;
  shown: number;
} {
  const total = s.recipientCount ?? s.to.length;

  // Base identities. Explicit multi-address sends use the real addresses; a
  // campaign to a group address is expanded from CRM contacts.
  let base: { id: string; name: string; email: string; contactId?: string }[];
  // "Explicit" = the send lists its real recipient addresses (a 1:1 email or a
  // small multi-address send), so each address maps to the matching CRM contact.
  // Campaigns to a group address (recipientCount >> listed addresses) fall through
  // to pool expansion below.
  const explicit = s.to.length >= 1 && (!s.recipientCount || s.recipientCount === s.to.length);
  if (explicit) {
    base = s.to.map((e, i) => {
      // Link the address to a CRM contact when one matches.
      const c = CONTACTS.find((x) => x.email && x.email.toLowerCase() === e.toLowerCase());
      return {
        id: `to_${i}`,
        name: c ? `${c.firstName} ${c.lastName}`.trim() : e.split("@")[0],
        email: e,
        contactId: c?.id,
      };
    });
  } else {
    const pool = CONTACTS.filter((c) => c.email);
    const count = Math.min(total, MAX_ROWS);
    base = Array.from({ length: count }, (_, i) => {
      const c = pool[i % pool.length];
      const name = `${c.firstName} ${c.lastName}`.trim();
      // First pass = real contacts (linkable); synthesized extras are not.
      if (i < pool.length) return { id: c.id, name, email: c.email, contactId: c.id };
      const n = Math.floor(i / pool.length);
      const [local, domain] = c.email.split("@");
      return { id: `${c.id}_${n}`, name, email: `${local}+${n}@${domain}` };
    });
  }

  const shown = base.length;
  const delivered = s.delivered ?? total;
  const opened = s.opened ?? 0;
  const clicked = s.clicked ?? 0;

  // Scale aggregate bands onto the displayed sample so proportions match.
  const scale = (n: number) => (total ? Math.round((n / total) * shown) : 0);
  const nClicked = scale(clicked);
  const nOpened = Math.max(nClicked, scale(opened));
  const nDelivered = Math.max(nOpened, scale(delivered));

  const rows: RecipientRow[] = base.map((b, i) => {
    let status: RecipientStatus;
    if (i < nClicked) status = "Clicked";
    else if (i < nOpened) status = "Opened";
    else if (i < nDelivered) status = "Delivered";
    else status = "Bounced";
    return { ...b, status };
  });

  return { rows, total, shown };
}

/**
 * Reverse lookup: every send this contact received, with the contact's status
 * for that send. Reuses buildRecipientRows so a contact's inbox view is
 * consistent with each send's per-recipient report.
 */
export function emailsForContact(contactId: string): { send: SentEmail; status: RecipientStatus }[] {
  const out: { send: SentEmail; status: RecipientStatus }[] = [];
  for (const send of listSentEmails()) {
    const { rows } = buildRecipientRows(send);
    const row = rows.find((r) => r.contactId === contactId);
    if (row) out.push({ send, status: row.status });
  }
  return out; // listSentEmails() is already newest-first
}

export interface CompanyEmailRow {
  send: SentEmail;
  status: RecipientStatus;
  contactId: string;
  contactName: string;
}

/**
 * Company email roll-up: every email received by any of the company's contacts,
 * EXCEPT bulk marketing campaigns sent through Mailgun (send.marketing). Each
 * row keeps the contact it reached so the company view can link back to them.
 */
export function emailsForCompany(companyId: string): CompanyEmailRow[] {
  const contacts = CONTACTS.filter((c) => c.companyId === companyId && c.email);
  const out: CompanyEmailRow[] = [];
  for (const send of listSentEmails()) {
    if (send.marketing) continue; // exclude Mailgun marketing
    const { rows } = buildRecipientRows(send);
    for (const c of contacts) {
      const row = rows.find((r) => r.contactId === c.id);
      if (row) {
        out.push({
          send,
          status: row.status,
          contactId: c.id,
          contactName: `${c.firstName} ${c.lastName}`.trim(),
        });
      }
    }
  }
  return out; // listSentEmails() is already newest-first
}
