import { useSyncExternalStore } from "react";

/**
 * Personal calendar entries - anything a user wants on their own calendar that
 * is not a task, Studio shoot, tour renewal or dealer event (1:1s, travel,
 * blocked focus time, internal meetings...).
 *
 * Local-first store, same shape as the dealer-events store so it can be swapped
 * for the API later.
 */
export interface PersonalEntry {
  id: string;
  userId: string;
  title: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:mm ("" = all day)
  endTime: string;
  location: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "yw:personal-calendar:v1";

function load(): PersonalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersonalEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let state: PersonalEntry[] = load();
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

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

const snapshot = () => state;

export function usePersonalEntries() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function listPersonalEntries(userId?: string): PersonalEntry[] {
  return [...state]
    .filter((e) => (userId ? e.userId === userId : true))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export type NewPersonalEntry = Omit<PersonalEntry, "id" | "createdAt" | "updatedAt">;

export function addPersonalEntry(input: NewPersonalEntry): PersonalEntry {
  const now = new Date().toISOString();
  const entry: PersonalEntry = {
    ...input,
    id: `cal_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now,
    updatedAt: now,
  };
  state = [...state, entry];
  persist();
  emit();
  return entry;
}

export function updatePersonalEntry(id: string, patch: Partial<PersonalEntry>) {
  state = state.map((e) =>
    e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
  );
  persist();
  emit();
}

export function removePersonalEntry(id: string) {
  state = state.filter((e) => e.id !== id);
  persist();
  emit();
}
