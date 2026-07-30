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

/** One arm of an A/B test: its own subject line and body. */
export interface AbVariant {
  label: "A" | "B";
  subject: string;
  html: string;
}

/** A/B test configuration attached to a send. */
export interface AbTestConfig {
  enabled: boolean;
  /** Percent of the audience that receives variant B (1-99). */
  splitPercentB: number;
  /** Which metric decides the winner. */
  winnerMetric: "open" | "click";
  variantB: { subject: string; html: string };
}

/** Automatic follow-up to recipients who were delivered but never opened. */
export interface FollowUpConfig {
  enabled: boolean;
  /** Days after the original send before the follow-up goes out. */
  delayDays: number;
  /** Fresh subject line for the second attempt. */
  subject: string;
}

/** Per-variant engagement, recorded on an A/B send. */
export interface VariantStats {
  label: "A" | "B";
  subject: string;
  recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
}

export interface SendEmailInput {
  to: string[];
  from: string;
  subject: string;
  html: string;
  templateId?: string;
  templateName?: string;
  /** Which class of email this is → decides the provider. Defaults to transactional. */
  kind?: EmailKind;
  /** The audience definition this send resolved from (for auditing / re-sends). */
  audienceName?: string;
  /** Optional A/B test across subject + body. */
  abTest?: AbTestConfig;
  /** Optional automatic re-send to non-openers. */
  followUp?: FollowUpConfig;
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
  /** Name of the audience/list this send went to. */
  audienceName?: string;
  /** Present when this send was an A/B test; holds per-variant results. */
  abTest?: { splitPercentB: number; winnerMetric: "open" | "click"; variants: VariantStats[] };
  /** Follow-up plan for non-openers, and its state. */
  followUp?: FollowUpConfig & {
    /** ISO datetime the follow-up is due to send. */
    dueAt: string;
    /** Set once the follow-up has gone out. */
    sentId?: string;
  };
  /** Set on a follow-up send, pointing back at the original. */
  followUpOf?: string;
}

/** Winning variant by the chosen metric (null until both arms have data). */
export function abWinner(s: SentEmail): { label: "A" | "B"; rate: number } | null {
  if (!s.abTest || s.abTest.variants.length < 2) return null;
  const rate = (v: VariantStats) => {
    const base = v.delivered || v.recipients;
    if (!base) return 0;
    return (s.abTest!.winnerMetric === "click" ? v.clicked : v.opened) / base;
  };
  const [a, b] = s.abTest.variants;
  const ra = rate(a);
  const rb = rate(b);
  if (ra === rb) return null;
  return ra > rb ? { label: a.label, rate: ra } : { label: b.label, rate: rb };
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
  const sentAt = new Date();
  const total = input.to.length;

  // A/B split: B gets splitPercentB of the audience, A gets the remainder.
  // Mock engagement is derived so the report has plausible per-variant numbers;
  // real numbers arrive from Mailgun events once the webhook is wired.
  let abTest: SentEmail["abTest"];
  if (input.abTest?.enabled && total > 0) {
    const pctB = Math.min(99, Math.max(1, Math.round(input.abTest.splitPercentB)));
    const nB = Math.max(1, Math.round((total * pctB) / 100));
    const nA = Math.max(0, total - nB);
    const arm = (label: "A" | "B", subject: string, recipients: number, lift: number): VariantStats => {
      const delivered = Math.round(recipients * 0.97);
      const opened = Math.round(delivered * (0.28 + lift));
      const clicked = Math.round(opened * 0.42);
      return { label, subject, recipients, delivered, opened, clicked };
    };
    abTest = {
      splitPercentB: pctB,
      winnerMetric: input.abTest.winnerMetric,
      variants: [
        arm("A", input.subject, nA, 0),
        arm("B", input.abTest.variantB.subject, nB, 0.06),
      ],
    };
  }

  let followUp: SentEmail["followUp"];
  if (input.followUp?.enabled) {
    const days = Math.max(1, Math.round(input.followUp.delayDays));
    followUp = {
      ...input.followUp,
      delayDays: days,
      dueAt: new Date(sentAt.getTime() + days * 86_400_000).toISOString(),
    };
  }

  const record: SentEmail = {
    id: `snt_${Math.random().toString(36).slice(2, 9)}`,
    to: input.to,
    from: input.from,
    subject: input.subject,
    templateId: input.templateId,
    templateName: input.templateName,
    sentAt: sentAt.toISOString(),
    status: "sent",
    mock,
    recipientCount: total,
    delivered: total,
    html: input.html,
    kind: sendKind,
    provider,
    providerName: providerName(provider),
    marketing: sendKind === "marketing" || undefined,
    audienceName: input.audienceName,
    abTest,
    followUp,
  };
  // A/B sends report aggregate engagement as the sum of their arms.
  if (abTest) {
    record.delivered = abTest.variants.reduce((n, v) => n + v.delivered, 0);
    record.opened = abTest.variants.reduce((n, v) => n + v.opened, 0);
    record.clicked = abTest.variants.reduce((n, v) => n + v.clicked, 0);
  }
  state = [record, ...state];
  persist();
  listeners.forEach((l) => l());
  return { ok: true, record };
}

/* ------------------------------------------------------------------ */
/* Non-opener follow-up                                                */
/* ------------------------------------------------------------------ */

/** Sends whose follow-up is configured, due, and not yet sent. */
export function dueFollowUps(now = new Date()): SentEmail[] {
  return state.filter(
    (s) => s.followUp?.enabled && !s.followUp.sentId && new Date(s.followUp.dueAt) <= now,
  );
}

/**
 * Send the configured follow-up for one campaign: same body, new subject, to the
 * recipients who were delivered but never opened. In this mock build the
 * non-opener set is derived from the per-recipient report; with Mailgun wired,
 * query the `delivered AND NOT opened` event set instead.
 */
export async function sendFollowUp(
  originalId: string,
  nonOpeners: string[],
): Promise<SentEmail | null> {
  const original = state.find((s) => s.id === originalId);
  if (!original?.followUp || original.followUp.sentId) return null;
  if (nonOpeners.length === 0) return null;

  const provider = original.provider ?? providerForKind(original.kind ?? "marketing");
  const record: SentEmail = {
    id: `snt_${Math.random().toString(36).slice(2, 9)}`,
    to: nonOpeners,
    from: original.from,
    subject: original.followUp.subject,
    templateId: original.templateId,
    templateName: original.templateName,
    sentAt: new Date().toISOString(),
    status: "sent",
    mock: true,
    recipientCount: nonOpeners.length,
    delivered: Math.round(nonOpeners.length * 0.97),
    opened: Math.round(nonOpeners.length * 0.18),
    clicked: Math.round(nonOpeners.length * 0.06),
    html: original.html,
    kind: original.kind,
    provider,
    providerName: providerName(provider),
    marketing: original.marketing,
    audienceName: original.audienceName
      ? `${original.audienceName} · non-openers`
      : "Non-openers",
    followUpOf: original.id,
  };

  state = [
    record,
    ...state.map((s) =>
      s.id === original.id && s.followUp
        ? { ...s, followUp: { ...s.followUp, sentId: record.id } }
        : s,
    ),
  ];
  persist();
  listeners.forEach((l) => l());
  return record;
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
