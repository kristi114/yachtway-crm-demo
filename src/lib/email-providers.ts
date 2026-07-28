import { useSyncExternalStore } from "react";

/**
 * Email provider routing.
 *
 * YachtWay sends three classes of email, each through a dedicated provider:
 *   • system        → AWS SES   (password resets, automation alerts, receipts)
 *   • transactional → Gmail     (1:1 rep ↔ contact email)
 *   • marketing     → Mailgun   (bulk campaigns, newsletters)
 *
 * The mapping is fixed (it mirrors deliverability/compliance requirements); the
 * connection state per provider is admin-managed. Real OAuth/API-key wiring
 * happens at the API layer — this store models connection status + routing.
 */

export type EmailKind = "system" | "transactional" | "marketing";
export type ProviderId = "ses" | "gmail" | "mailgun";

export interface ProviderSpec {
  id: ProviderId;
  name: string;
  handles: EmailKind;
  handlesLabel: string;
  blurb: string;
}

export const PROVIDERS: ProviderSpec[] = [
  {
    id: "ses",
    name: "AWS SES",
    handles: "system",
    handlesLabel: "System emails",
    blurb: "Password resets, automation alerts, receipts and other platform-generated mail.",
  },
  {
    id: "gmail",
    name: "Gmail",
    handles: "transactional",
    handlesLabel: "Transactional emails",
    blurb: "1:1 email between reps and contacts, sent from the rep's mailbox.",
  },
  {
    id: "mailgun",
    name: "Mailgun",
    handles: "marketing",
    handlesLabel: "Marketing emails",
    blurb: "Bulk campaigns and newsletters with open/click tracking.",
  },
];

/** Fixed routing: which provider sends each kind of email. */
export const KIND_PROVIDER: Record<EmailKind, ProviderId> = {
  system: "ses",
  transactional: "gmail",
  marketing: "mailgun",
};

export function providerForKind(kind: EmailKind): ProviderId {
  return KIND_PROVIDER[kind];
}

export function providerName(id: ProviderId): string {
  return PROVIDERS.find((p) => p.id === id)?.name ?? id;
}

/* ------------------------------------------------------------------ */
/* Connection state (mock, localStorage-backed)                        */
/* ------------------------------------------------------------------ */

const KEY = "yw:email-providers:v1";

function load(): Record<ProviderId, boolean> {
  const dflt: Record<ProviderId, boolean> = { ses: true, gmail: true, mailgun: true };
  if (typeof window === "undefined") return dflt;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return dflt;
    return { ...dflt, ...(JSON.parse(raw) as Partial<Record<ProviderId, boolean>>) };
  } catch {
    return dflt;
  }
}

let connected: Record<ProviderId, boolean> = load();
const listeners = new Set<() => void>();
const snapshot = () => connected;

function emit() {
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(KEY, JSON.stringify(connected)); } catch { /* ignore */ }
  }
  for (const l of listeners) l();
}

export function setProviderConnected(id: ProviderId, value: boolean) {
  connected = { ...connected, [id]: value };
  emit();
}

export function isProviderConnected(id: ProviderId): boolean {
  return connected[id];
}

export function isKindSendable(kind: EmailKind): boolean {
  return connected[providerForKind(kind)];
}

export function useEmailProviders(): Record<ProviderId, boolean> {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    snapshot,
    snapshot,
  );
}
