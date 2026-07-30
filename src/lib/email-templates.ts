import { useSyncExternalStore } from "react";

import type { EmailKind, ProviderId } from "@/lib/email-providers";

/**
 * Email template store for the Emails builder.
 *
 * Two authoring modes share one record:
 *   - "design"  → GrapesJS newsletter (MJML-style) drag-drop builder. We persist
 *                 both the GrapesJS project JSON (so the canvas re-hydrates) and
 *                 the exported, inlined HTML (so sending / preview never needs the editor).
 *   - "html"    → hand-written HTML in the VS Code-style editor with live preview.
 *
 * localStorage-backed for the mock; swap `persist()`/`load()` for the real
 * `/emails` API when the backend template endpoints land. The shape mirrors what
 * the GHL-style template endpoints already expect (name, subject, html).
 */

export type EmailMode = "design" | "html";

/** Effective document title: the explicit title, else the subject. */
export function effectiveTitle(t: { title?: string; subject: string }): string {
  return t.title?.trim() || t.subject;
}

/**
 * Inject the pre-header and <title> into email HTML for sending/preview.
 *
 * The pre-header is the hidden span every mail client reads for the inbox
 * preview line; it must be the first thing inside <body>, visually hidden, and
 * padded so the client doesn't pull body copy in after it. Re-running this is
 * safe: an existing injected block is replaced, not duplicated.
 */
export function applyEmailHead(
  html: string,
  opts: { preheader?: string; title?: string; subject: string },
): string {
  const title = effectiveTitle(opts);
  let out = html;

  // <title> — replace when present, otherwise insert into (or create) <head>.
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  } else if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n    <title>${escapeHtml(title)}</title>`);
  } else if (/<html[^>]*>/i.test(out)) {
    out = out.replace(/<html[^>]*>/i, (m) => `${m}\n  <head><title>${escapeHtml(title)}</title></head>`);
  }

  // Pre-header — drop any previous injection first.
  out = out.replace(
    /<div[^>]*data-yw-preheader[^>]*>[\s\S]*?<\/div>/i,
    "",
  );
  const pre = opts.preheader?.trim();
  if (pre && /<body[^>]*>/i.test(out)) {
    const block =
      `<div data-yw-preheader style="display:none;max-height:0;overflow:hidden;` +
      `mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">` +
      `${escapeHtml(pre)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>`;
    out = out.replace(/<body[^>]*>/i, (m) => `${m}\n    ${block}`);
  }

  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  /** Inbox preview text shown after the subject line. */
  preheader?: string;
  /** Document <title>. Blank = fall back to the subject. */
  title?: string;
  /** Which class of email this is → default provider routing. */
  kind?: EmailKind;
  /** Explicit provider override (e.g. marketing via Gmail). */
  provider?: ProviderId;
  mode: EmailMode;
  /** Rendered, email-safe HTML (inlined styles). Source of truth for sending + preview. */
  html: string;
  /** GrapesJS project JSON — only present for design-mode templates. */
  design: unknown | null;
  updatedAt: string; // ISO
  updatedBy: string;
}

const STORAGE_KEY = "yw:email-templates:v1";

/* ------------------------------------------------------------------ */
/* Seed templates                                                      */
/* ------------------------------------------------------------------ */

const SEED_WELCOME_HTML = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr><td style="background:#0b1f33;padding:28px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">YachtWay</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 12px;font-size:24px;">Welcome aboard, {{first_name}} 🚤</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
              Your YachtWay account is ready. Manage listings, brokers and buyers from one place.
            </p>
            <a href="https://crm.yachtway.app" style="display:inline-block;background:#0b1f33;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">
              Open your dashboard
            </a>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f4f5f7;color:#5b6b7b;font-size:12px;">
            YachtWay · You are receiving this because you signed up at yachtway.com
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const SEED_NEWSLETTER_HTML = `<!doctype html>
<html>
  <body style="margin:0;background:#eef1f4;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;">
          <tr><td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-size:22px;">This month on the water</h1>
            <p style="margin:8px 0 0;color:#5b6b7b;font-size:14px;">New listings, dealer wins and studio openings.</p>
          </td></tr>
          <tr><td style="padding:16px 32px;">
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
              Add your story blocks here, or switch to the drag-and-drop designer to build visually.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

function seed(): EmailTemplate[] {
  const now = new Date().toISOString();
  return [
    {
      id: "tpl_welcome",
      name: "Welcome — new account",
      subject: "Welcome aboard, {{first_name}}!",
      mode: "html",
      html: SEED_WELCOME_HTML,
      design: null,
      updatedAt: now,
      updatedBy: "Seed",
    },
    {
      id: "tpl_newsletter",
      name: "Monthly newsletter",
      subject: "This month on the water ⚓",
      mode: "design",
      html: SEED_NEWSLETTER_HTML,
      design: null,
      updatedAt: now,
      updatedBy: "Seed",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Store internals                                                     */
/* ------------------------------------------------------------------ */

function load(): EmailTemplate[] {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as EmailTemplate[];
    return Array.isArray(parsed) && parsed.length ? parsed : seed();
  } catch {
    return seed();
  }
}

let state: EmailTemplate[] = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function listEmailTemplates(): EmailTemplate[] {
  return [...state].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getEmailTemplate(id: string): EmailTemplate | undefined {
  return state.find((t) => t.id === id);
}

export function newTemplateId(): string {
  return `tpl_${Math.random().toString(36).slice(2, 9)}`;
}

export interface SaveTemplateInput {
  id: string;
  name: string;
  subject: string;
  preheader?: string;
  title?: string;
  kind?: EmailKind;
  provider?: ProviderId;
  mode: EmailMode;
  html: string;
  design?: unknown | null;
  updatedBy?: string;
}

export function saveEmailTemplate(input: SaveTemplateInput): EmailTemplate {
  const record: EmailTemplate = {
    id: input.id,
    name: input.name.trim() || "Untitled email",
    subject: input.subject,
    preheader: input.preheader?.trim() || undefined,
    title: input.title?.trim() || undefined,
    kind: input.kind,
    provider: input.provider,
    mode: input.mode,
    html: input.html,
    design: input.design ?? null,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? "You",
  };
  const idx = state.findIndex((t) => t.id === record.id);
  state = idx >= 0 ? state.map((t) => (t.id === record.id ? record : t)) : [record, ...state];
  persist();
  emit();
  return record;
}

export function deleteEmailTemplate(id: string) {
  state = state.filter((t) => t.id !== id);
  persist();
  emit();
}

/**
 * Stable snapshot for useSyncExternalStore. MUST return the same reference
 * between mutations — returning a freshly-sorted array here would make React
 * throw ("getSnapshot should be cached"). Sorting is done by the consumer
 * (or via listEmailTemplates()).
 */
const snapshot = () => state;

/** Reactive hook — re-renders on any template change. Returns unsorted state;
 *  sort in the component (see emails.index.tsx). */
export function useEmailTemplatesStore(): EmailTemplate[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
