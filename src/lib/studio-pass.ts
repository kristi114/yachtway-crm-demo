import { useSyncExternalStore } from "react";

import type { CurrencyCode } from "@/lib/currency";

/**
 * YachtWay Studio Pass - the month-to-month membership ($199 / EUR 199) that
 * unlocks member rates on the Studio price list.
 *
 * A company only gets member pricing while it holds an ACTIVE, paid pass.
 * Sales cannot flip a line to "Member" manually: the pass has to be on the
 * document (and paid / accepted by the client) or already active on the account.
 * localStorage-backed for the demo; swap for the API later.
 */

export const STUDIO_PASS_PRICE = 199;

export interface StudioPassSubscription {
  companyId: string;
  currency: CurrencyCode;
  status: "active" | "cancelled";
  /** ISO date the month-to-month subscription started. */
  startedAt: string;
  cancelledAt?: string;
  /** Invoice / estimate that activated it. */
  sourceDocId?: string;
  sourceDocNumber?: string;
}

const STORAGE_KEY = "yw:studio-pass:v1";

let cache: StudioPassSubscription[] | null = null;
const listeners = new Set<() => void>();

function read(): StudioPassSubscription[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as StudioPassSubscription[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(next: StudioPassSubscription[]) {
  cache = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  listeners.forEach((l) => l());
}

export function listStudioPasses(): StudioPassSubscription[] {
  return read();
}

export function getStudioPass(companyId?: string): StudioPassSubscription | undefined {
  if (!companyId) return undefined;
  return read().find((p) => p.companyId === companyId);
}

/** True only while the company holds a paid, active month-to-month pass. */
export function isStudioPassActive(companyId?: string): boolean {
  return getStudioPass(companyId)?.status === "active";
}

export function activateStudioPass(
  companyId: string,
  currency: CurrencyCode,
  source?: { docId?: string; docNumber?: string },
): StudioPassSubscription {
  const existing = getStudioPass(companyId);
  const sub: StudioPassSubscription = {
    companyId,
    currency,
    status: "active",
    startedAt: existing?.status === "active" ? existing.startedAt : new Date().toISOString(),
    sourceDocId: source?.docId ?? existing?.sourceDocId,
    sourceDocNumber: source?.docNumber ?? existing?.sourceDocNumber,
  };
  persist([...read().filter((p) => p.companyId !== companyId), sub]);
  return sub;
}

export function cancelStudioPass(companyId: string) {
  persist(
    read().map((p) =>
      p.companyId === companyId
        ? { ...p, status: "cancelled", cancelledAt: new Date().toISOString() }
        : p,
    ),
  );
}

export function useStudioPass(companyId?: string): StudioPassSubscription | undefined {
  const subs = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(),
    () => [] as StudioPassSubscription[],
  );
  if (!companyId) return undefined;
  return subs.find((p) => p.companyId === companyId);
}
