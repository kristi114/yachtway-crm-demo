import { useSyncExternalStore } from "react";
import type { CurrencyCode } from "@/lib/currency";
import { formatMoney } from "@/lib/currency";

/**
 * Dealer credit ledger.
 *
 * Records YachtWay-issued credit for a dealer/brokerage. Every entry MUST
 * include a reason and a reference (e.g. deal, invoice, ticket, contract).
 * Balance is the sum of all entries (positive = credit issued, negative =
 * credit consumed / reversed).
 */

export interface CreditEntry {
  id: string;
  companyId: string;
  amount: number;              // in the company's currency; positive issues credit, negative consumes
  currency: CurrencyCode;
  reason: string;              // WHY the credit was granted / consumed
  reference: string;           // WHAT it references (invoice #, deal id, ticket, contract clause…)
  created_by_user_id: string;
  created_by_name: string;
  createdAt: string;          // ISO
}

type Store = Record<string, CreditEntry[]>; // companyId -> entries (newest first)

const STORAGE_KEY = "yw:dealer-credit:v1";

function load(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

let state: Store = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore */
  }
}

export function subscribeCredit(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function snapshot() {
  return state;
}

export function useCreditStore() {
  return useSyncExternalStore(subscribeCredit, snapshot, snapshot);
}

export function getCreditEntries(companyId: string): CreditEntry[] {
  return state[companyId] ?? [];
}

export function getCreditBalance(companyId: string): number {
  return getCreditEntries(companyId).reduce((s, e) => s + e.amount, 0);
}

export function addCreditEntry(entry: Omit<CreditEntry, "id" | "createdAt">) {
  const full: CreditEntry = {
    ...entry,
    id: `cr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  state = {
    ...state,
    [entry.companyId]: [full, ...(state[entry.companyId] ?? [])],
  };
  persist();
  emit();
  return full;
}

export function removeCreditEntry(companyId: string, entryId: string) {
  const list = state[companyId];
  if (!list) return;
  state = {
    ...state,
    [companyId]: list.filter((e) => e.id !== entryId),
  };
  persist();
  emit();
}

export function formatCredit(amount: number, currency: CurrencyCode) {
  return formatMoney(amount, currency);
}
