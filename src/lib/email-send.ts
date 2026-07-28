import { useSyncExternalStore } from "react";

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
}

const STORAGE_KEY = "yw:email-sent-log:v1";

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
      recipientCount: 3440,
      delivered: 3320,
      opened: 1040,
      clicked: 560,
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
      recipientCount: 2380,
      delivered: 2290,
      opened: 690,
      clicked: 360,
    },
    {
      id: "snt_seed_3",
      to: ["marco.delgado@example.com"],
      from: "YachtWay <noreply@yachtway.com>",
      subject: "Welcome aboard, Marco!",
      templateName: "Welcome — new account",
      sentAt: daysAgo(4),
      status: "sent",
      mock: true,
      recipientCount: 1,
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

  // ---- BEGIN mock transport (replace with POST /emails/send → Mailgun) ----
  await new Promise((r) => setTimeout(r, 600));
  const mock = true;
  // ---- END mock transport ----

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
  };
  state = [record, ...state];
  persist();
  listeners.forEach((l) => l());
  return { ok: true, record };
}
