import { useSyncExternalStore } from "react";
import type { Role } from "@/lib/auth";
import { logAudit } from "@/lib/admin-config";
import {
  DEFAULT_SIGNATURE_LINKS,
  buildSignatureHtml,
  buildSignatureText,
  type SignatureLink,
  type SignatureProfile,
} from "@/lib/signature-html";


/**
 * Email signature store.
 *
 * Two layers, same as the backend contract:
 *  - an org-wide default template written by an admin (token based), and
 *  - an optional per-user signature that overrides it.
 *
 * Persisted to localStorage until the signature endpoints land; screens read
 * only the helpers below so swapping the storage layer is a one-file change.
 */

export interface UserSignature {
  /** Raw template text (tokens allowed). */
  body: string;
  /** When false the user falls back to the org default. */
  useDefault: boolean;
  updatedAt: string;
}

export interface SignatureState {
  /** Org-wide default template. */
  defaultTemplate: string;
  /** Append the active signature to outbound emails automatically. */
  autoAppend: boolean;
  /** userId -> personal signature. */
  byUser: Record<string, UserSignature>;
  /** userId -> rich (HTML) signature profile. */
  profiles: Record<string, Partial<SignatureProfile>>;
  /** Product links shown at the bottom of every rich signature. */
  links: SignatureLink[];
  /** Emails of directory entries an admin removed from the CRM listing. */
  hiddenDirectory: string[];
}


/** Tokens an admin or user can drop into a signature template. */
export const SIGNATURE_TOKENS: { token: string; label: string }[] = [
  { token: "{{name}}", label: "Full name" },
  { token: "{{firstName}}", label: "First name" },
  { token: "{{email}}", label: "Email address" },
  { token: "{{role}}", label: "Role / job title" },
  { token: "{{company}}", label: "Company name" },
  { token: "{{website}}", label: "Website" },
  { token: "{{phone}}", label: "Support phone" },
];

export const ORG_DEFAULTS = {
  company: "YachtWay",
  website: "YachtWay.com",
  phone: "+1 (954) 555-0142",
};

const DEFAULT_TEMPLATE = [
  "-",
  "{{name}}",
  "{{role}} · {{company}}",
  "{{email}} · {{phone}}",
  "{{website}}",
].join("\n");

const STORAGE_KEY = "yw_email_signatures_v1";

const DEFAULT_STATE: SignatureState = {
  defaultTemplate: DEFAULT_TEMPLATE,
  autoAppend: true,
  byUser: {},
  profiles: {},
  links: DEFAULT_SIGNATURE_LINKS,
  hiddenDirectory: [],
};

let state: SignatureState = DEFAULT_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SignatureState>;
      state = {
        defaultTemplate: parsed.defaultTemplate ?? DEFAULT_TEMPLATE,
        autoAppend: parsed.autoAppend ?? true,
        byUser: parsed.byUser ?? {},
        profiles: parsed.profiles ?? {},
        links: parsed.links?.length ? parsed.links : DEFAULT_SIGNATURE_LINKS,
        hiddenDirectory: parsed.hiddenDirectory ?? [],
      };
    }

  } catch {
    /* corrupt payload - keep defaults */
  }
}

function emit() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota / private mode - in-memory only */
    }
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  hydrate();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useSignatures(): SignatureState {
  return useSyncExternalStore(
    subscribe,
    () => { hydrate(); return state; },
    () => DEFAULT_STATE,
  );
}

export function readSignatures(): SignatureState {
  hydrate();
  return state;
}

export const DEFAULT_SIGNATURE_TEMPLATE = DEFAULT_TEMPLATE;

type Actor = { name: string; role: Role };
type SigUser = { id: string; name: string; email: string; role: Role };

const ROLE_TITLES: Record<Role, string> = {
  sales_rep: "Account Executive",
  fintech: "FinTech Specialist",
  marketing: "Marketing",
  admin: "Operations",
  lender_partner: "Lending Partner",
  insurance_partner: "Insurance Partner",
};

/** Fill tokens for a given user. */
export function renderSignature(template: string, user: SigUser): string {
  const map: Record<string, string> = {
    "{{name}}": user.name,
    "{{firstName}}": user.name.split(" ")[0] ?? user.name,
    "{{email}}": user.email,
    "{{role}}": ROLE_TITLES[user.role],
    "{{company}}": ORG_DEFAULTS.company,
    "{{website}}": ORG_DEFAULTS.website,
    "{{phone}}": ORG_DEFAULTS.phone,
  };
  return template.replace(/\{\{\w+\}\}/g, (m) => map[m] ?? m);
}

/** The template that applies to a user (personal override or org default). */
export function templateForUser(cfg: SignatureState, userId: string): string {
  const own = cfg.byUser[userId];
  if (own && !own.useDefault) return own.body;
  return cfg.defaultTemplate;
}

/** Ready-to-paste signature text for a user. */
export function signatureFor(cfg: SignatureState, user: SigUser): string {
  const own = cfg.byUser[user.id];
  if (own && !own.useDefault) return renderSignature(own.body, user);
  return buildSignatureText(profileForUser(cfg, user), cfg.links);
}

/** The rich signature profile for a user, filled in from their CRM record. */
export function profileForUser(cfg: SignatureState, user: SigUser): SignatureProfile {
  const saved = cfg.profiles[user.id] ?? {};
  return {
    name: saved.name || user.name,
    position: saved.position || ROLE_TITLES[user.role],
    image: saved.image ?? "",
    website: saved.website || ORG_DEFAULTS.website,
    email: saved.email || user.email,
    phone: saved.phone ?? "",
    phoneOpen: saved.phoneOpen,
    width: saved.width || "250px",
  };
}

/** Ready-to-paste HTML signature for a user. */
export function signatureHtmlFor(cfg: SignatureState, user: SigUser): string {
  return buildSignatureHtml(profileForUser(cfg, user), cfg.links);
}

export function setUserProfile(
  userId: string,
  patch: Partial<SignatureProfile>,
  actor: Actor,
  targetEmail?: string,
) {
  const current = state.profiles[userId] ?? {};
  state = { ...state, profiles: { ...state.profiles, [userId]: { ...current, ...patch } } };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: "Email signature details updated",
    target: targetEmail ?? userId,
  });
  emit();
}

export function setSignatureLinks(links: SignatureLink[], actor: Actor) {
  state = { ...state, links };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: "Email signature links updated",
    target: "email.signature.links",
  });
  emit();
}


export function setDefaultTemplate(template: string, actor: Actor) {
  state = { ...state, defaultTemplate: template };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: "Default email signature updated",
    target: "email.signature.default",
  });
  emit();
}

export function setAutoAppend(enabled: boolean, actor: Actor) {
  state = { ...state, autoAppend: enabled };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: enabled ? "Signature auto-append enabled" : "Signature auto-append disabled",
    target: "email.signature.autoAppend",
  });
  emit();
}

export function setUserSignature(
  userId: string,
  patch: { body?: string; useDefault?: boolean },
  actor: Actor,
  targetEmail?: string,
) {
  const current = state.byUser[userId] ?? { body: state.defaultTemplate, useDefault: true, updatedAt: "" };
  const next: UserSignature = {
    body: patch.body ?? current.body,
    useDefault: patch.useDefault ?? current.useDefault,
    updatedAt: new Date().toISOString(),
  };
  state = { ...state, byUser: { ...state.byUser, [userId]: next } };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: next.useDefault ? "Email signature reset to org default" : "Email signature updated",
    target: targetEmail ?? userId,
  });
  emit();
}

export function clearUserSignature(userId: string, actor: Actor, targetEmail?: string) {
  if (!state.byUser[userId]) return;
  const byUser = { ...state.byUser };
  delete byUser[userId];
  state = { ...state, byUser };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: "Email signature reset to org default",
    target: targetEmail ?? userId,
  });
  emit();
}

/** Remove a person's signature entirely (personal template + rich profile). */
export function deleteUserSignature(userId: string, actor: Actor, targetEmail?: string) {
  const byUser = { ...state.byUser };
  const profiles = { ...state.profiles };
  delete byUser[userId];
  delete profiles[userId];
  state = { ...state, byUser, profiles };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: "Email signature deleted",
    target: targetEmail ?? userId,
  });
  emit();
}

/** Hide a directory entry (repo roster) from the CRM listing. */
export function hideDirectoryEntry(email: string, actor: Actor) {
  const key = email.toLowerCase();
  if (state.hiddenDirectory.includes(key)) return;
  state = { ...state, hiddenDirectory: [...state.hiddenDirectory, key] };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: "Directory signature removed",
    target: email,
  });
  emit();
}

/** Restore every hidden directory entry. */
export function restoreDirectory(actor: Actor) {
  if (!state.hiddenDirectory.length) return;
  state = { ...state, hiddenDirectory: [] };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: "Directory signatures restored",
    target: "email.signature.directory",
  });
  emit();
}
