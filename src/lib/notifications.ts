import { useSyncExternalStore } from "react";
import type { Role, User } from "@/lib/auth";

/**
 * Lightweight in-app notification store (mock).
 *
 * Notifications can be targeted at a role (e.g. everyone in Fintech) and/or a
 * specific user by name (e.g. an account owner). `banner: true` items render as
 * a dismissible strip at the top of the home dashboard for their audience;
 * `emailed: true` records that the mock also "sent" an email to the target
 * (real delivery is wired at the API layer later).
 */
export interface AppNotification {
  id: string;
  createdAt: string;
  title: string;
  message: string;
  /** Audience: shown to users in this role (if set) … */
  audienceRole?: Role;
  /** … and/or to the user with this exact name (account owner routing). */
  audienceUserName?: string;
  /** Render as a home-dashboard banner. */
  banner?: boolean;
  /** The mock also dispatched an email to the audience. */
  emailed?: boolean;
  /** Optional deep link. */
  link?: { to: string; params?: Record<string, string>; label: string };
  read: boolean;
  dismissed: boolean;
}

let state: AppNotification[] = [];
const listeners = new Set<() => void>();
const snapshot = () => state;
const emit = () => { for (const l of listeners) l(); };

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function pushNotification(
  input: Omit<AppNotification, "id" | "createdAt" | "read" | "dismissed">,
): AppNotification {
  const n: AppNotification = {
    ...input,
    id: `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    read: false,
    dismissed: false,
  };
  state = [n, ...state];
  emit();
  return n;
}

export function dismissNotification(id: string) {
  state = state.map((n) => (n.id === id ? { ...n, dismissed: true, read: true } : n));
  emit();
}

/** Reactive read of the full store (stable snapshot). */
export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Does a notification target this user (by role or by name)? */
export function targetsUser(n: AppNotification, user: Pick<User, "role" | "name">): boolean {
  if (n.audienceRole && n.audienceRole === user.role) return true;
  if (n.audienceUserName && n.audienceUserName === user.name) return true;
  // Admins see role-targeted notifications too, so nothing is silently missed.
  if (n.audienceRole && user.role === "admin") return true;
  return false;
}

/** Active banner notifications for a given user. */
export function bannersForUser(
  list: AppNotification[],
  user: Pick<User, "role" | "name">,
): AppNotification[] {
  return list.filter((n) => n.banner && !n.dismissed && targetsUser(n, user));
}
