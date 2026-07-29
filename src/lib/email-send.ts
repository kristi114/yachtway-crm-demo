import { useSyncExternalStore } from "react";
import { providerForKind, providerName, isKindSendable, type EmailKind, type ProviderId } from "@/lib/email-providers";

/**
 * Email sending seam for the Emails builder.
 *
 * In this standalone/mock build there's no live mail transport, so `sendEmail`
 * simulates a successful send and records it to a local "sent" log for feedback.
 * When the backend is wired, replace the body of `sendEmail` with a POST to the
 * apps/api send route (which fronts Mailgun): e.g.
 *
 *   await apiFetch("/emails/send", { method: "POST", body: { to, from, subject, html } });
 *
 * The signature and return shape are already what a real transport would use.
 */

export interface SendEmailInput {
  to: string[];
  from: string;
  subject: string;
  html: string;
  templateId?: string;
  templateName?: string;
  /** Which class of email this is → decides the provider. Defaults to transactional. */
  kind?: EmailKind;
}

export interface SentEmail {
  id: string;
  to: string[];
  from: string;
  subject: string;
  templateId?: string;
  templateName?: string;
  sentAt: string; // ISO
  status: "sent" | "failed" | "sending";
  /** True when produced by the mock transport (no real email left the app). */
  mock: boolean;
  /** Optional engagement metrics (present for seeded campaign-style sends). */
  recipientCount?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  /** The exact HTML that was sent — rendered in the per-send report. */
  html?: string;
  /**
   * True for bulk marketing campaigns sent through Mailgun. These are excluded
   * from a company's email roll-up (only 1:1 / transactional email rolls up).
   */
  marketing?: boolean;
  /** Email class and the provider it was routed through. */
  kind?: EmailKind;
  provider?: ProviderId;
  providerName?: string;
}

// v2: reseeded with a system (SES) + transactional (Gmail) + marketing (Mailgun)
// mix so the contact Emails tab demonstrates all three providers.
const STORAGE_KEY = "yw:email-sent-log:v2";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse a comma / semicolon / whitespace separated recipient string. */
export function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function invalidRecipients(list: string[]): string[] {
  return list.filter((e) => !EMAIL_RE.test(e));
}

/* ------------------------------------------------------------------ */
/* Sent-log store (localStorage-backed)                                */
/* ------------------------------------------------------------------ */

function seedHtml(heading: string, body: string, cta = "Open your dashboard"): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr><td style="background:#0b1f33;padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">YachtWay</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 12px;font-size:24px;">${heading}</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${body}</p>
            <a href="https://crm.yachtway.app" style="display:inline-block;background:#0b1f33;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">${cta}</a>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f4f5f7;color:#5b6b7b;font-size:12px;">
            YachtWay · You are receiving this because you're a YachtWay member.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function seed(): SentEmail[] {
  const daysAgo = (d: number, h = 0) =>
    new Date(Date.now() - d * 86_400_000 - h * 3_600_000).toISOString();
  return [
    {
      id: "snt_seed_1",
      to: ["dealers@yachtway.com"],
      from: "YachtWay <news@yachtway.com>",
      subject: "This month on the water ⚓",
      templateName: "Monthly newsletter",
      sentAt: daysAgo(1, 2),
      status: "sent",
      mock: true,
      marketing: true,
      kind: "marketing",
      provider: "mailgun",
      providerName: "Mailgun",
      recipientCount: 3440,
      delivered: 3320,
      opened: 1040,
      clicked: 560,
      html: seedHtml(
        "This month on the water ⚓",
        "New listings, dealer wins and studio openings — here's everything happening across the YachtWay network this month.",
        "See what's new",
      ),
    },
    {
      id: "snt_seed_2",
      to: ["brokers@yachtway.com"],
      from: "YachtWay <news@yachtway.com>",
      subject: "New listings you'll want to see",
      templateName: "New Listing Digest",
      sentAt: daysAgo(3, 5),
      status: "sent",
      mock: true,
      marketing: true,
      kind: "marketing",
      provider: "mailgun",
      providerName: "Mailgun",
      recipientCount: 2380,
      delivered: 2290,
      opened: 690,
      clicked: 360,
      html: seedHtml(
        "New listings you'll want to see",
        "Fresh yachts just hit the market that match your buyers' saved searches. Preview the latest listings and share them in one click.",
        "Browse new listings",
      ),
    },
    {
      id: "snt_seed_3",
      to: ["marco.delgado@rivierayachtsmiami.com"],
      from: "YachtWay <noreply@yachtway.com>",
      subject: "Welcome aboard, Marco!",
      templateName: "Welcome — new account",
      sentAt: daysAgo(4),
      status: "sent",
      mock: true,
      kind: "system",
      provider: "ses",
      providerName: "AWS SES",
      recipientCount: 1,
      delivered: 1,
      opened: 1,
      clicked: 1,
      html: seedHtml(
        "Welcome aboard, Marco 🚤",
        "Your YachtWay account is ready. Manage listings, brokers and buyers from one place.",
      ),
    },
    {
      id: "snt_seed_4",
      to: ["marco.delgado@rivierayachtsmiami.com"],
      from: "Mavil <mavil@yachtway.com>",
      subject: "Q3 renewal - DocuSign ready",
      sentAt: daysAgo(0, 6),
      status: "sent",
      mock: true,
      kind: "transactional",
      provider: "gmail",
      providerName: "Gmail",
      recipientCount: 1,
      delivered: 1,
      opened: 1,
      html: seedHtml(
        "Your Q3 renewal is ready to sign",
        "Hi Marco, I've sent over the SaaS renewal for signature via DocuSign. Let me know if anything looks off.",
        "Review & sign",
      ),
    },
  ];
}

function load(): SentEmail[] {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as SentEmail[];
    return Array.isArray(parsed) ? parsed : seed();
  } catch {
    return seed();
  }
}

let state: SentEmail[] = load();
const listeners = new Set<() => void>();
const snapshot = () => state;

function persist() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore */
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function listSentEmails(): SentEmail[] {
  return [...state].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export function getSentEmail(id: string): SentEmail | undefined {
  return state.find((s) => s.id === id);
}

export function useSentLog(): SentEmail[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/* ------------------------------------------------------------------ */
/* Send                                                                */
/* ------------------------------------------------------------------ */

export interface SendResult {
  ok: boolean;
  record: SentEmail;
}

/**
 * "Send" an email. Mock transport: validates, simulates network latency, and
 * records to the sent log. Swap the marked section for a real API call later.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const bad = invalidRecipients(input.to);
  if (input.to.length === 0) throw new Error("Add at least one recipient.");
  if (bad.length > 0) throw new Error(`Invalid email address: ${bad.join(", ")}`);
  if (!input.subject.trim()) throw new Error("Add a subject line.");
  const sendKind: EmailKind = input.kind ?? "transactional";
  if (!isKindSendable(sendKind)) {
    throw new Error(
      `${providerName(providerForKind(sendKind))} isn't connected. Connect it in Admin → Email providers to send ${sendKind} email.`,
    );
  }

  // ---- BEGIN mock transport (replace with POST /emails/send → Mailgun) ----
  await new Promise((r) => setTimeout(r, 600));
  const mock = true;
  // ---- END mock transport ----

  const provider = providerForKind(sendKind);
  const record: SentEmail = {
    id: `snt_${Math.random().toString(36).slice(2, 9)}`,
    to: input.to,
    from: input.from,
    subject: input.subject,
    templateId: input.templateId,
    templateName: input.templateName,
    sentAt: new Date().toISOString(),
    status: "sent",
    mock,
    recipientCount: input.to.length,
    delivered: input.to.length,
    html: input.html,
    kind: sendKind,
    provider,
    providerName: providerName(provider),
    marketing: sendKind === "marketing" || undefined,
  };
  state = [record, ...state];
  persist();
  listeners.forEach((l) => l());
  return { ok: true, record };
}

/**
 * Fire-and-forget system email (automation alerts, notifications). Routed to
 * AWS SES via the fixed provider map. Records to the sent log like any send.
 */
export function sendSystemEmail(to: string[], subject: string, html = ""): SentEmail {
  const provider = providerForKind("system");
  const record: SentEmail = {
    id: `snt_${Math.random().toString(36).slice(2, 9)}`,
    to,
    from: "YachtWay <system@yachtway.com>",
    subject,
    sentAt: new Date().toISOString(),
    status: "sent",
    mock: true,
    recipientCount: to.length,
    delivered: to.length,
    html,
    kind: "system",
    provider,
    providerName: providerName(provider),
  };
  state = [record, ...state];
  persist();
  listeners.forEach((l) => l());
  return record;
}
