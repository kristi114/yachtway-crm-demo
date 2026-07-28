import { useSyncExternalStore } from "react";
import type { Role, User } from "@/lib/auth";
import { usersForAudience, notifyPrefsForName } from "@/lib/admin-config";
import { sendSystemEmail } from "@/lib/email-send";

/**
 * Lightweight in-app notification store (mock).
 *
 * Notifications can be targeted at a role (e.g. everyone in Fintech) and/or a
 * specific user by name (e.g. an account owner). `banner: true` items render as
 * a dismissible strip at the top of the home dashboard for their audience,
 * gated per viewer's banner pref. At push time an email is also dispatched via
 * SES to recipients who enabled email notifications; `emailedTo` records who
 * was emailed. Real delivery is wired at the API layer later.
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
  /** Render as a home-dashboard banner (gated per viewer's banner pref). */
  banner?: boolean;
  /** Names of recipients an email was actually dispatched to (per their pref). */
  emailedTo?: string[];
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
  input: Omit<AppNotification, "id" | "createdAt" | "read" | "dismissed" | "emailedTo">,
): AppNotification {
  // Deliver per each recipient's channel prefs: email (via SES system mail) to
  // those who enabled email; banners are gated per viewer at render time.
  const recipients = usersForAudience(input.audienceRole, input.audienceUserName);
  const emailUsers = recipients.filter((u) => u.notifyEmail);
  if (emailUsers.length > 0) {
    try {
      sendSystemEmail(emailUsers.map((u) => u.email), input.title, `<p>${input.message}</p>`);
    } catch {
      /* SES disconnected → skip email delivery, banner still applies */
    }
  }

  const n: AppNotification = {
    ...input,
    emailedTo: emailUsers.map((u) => u.name),
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

/** Active banner notifications for a given user, honouring their banner pref. */
export function bannersForUser(
  list: AppNotification[],
  user: Pick<User, "role" | "name">,
): AppNotification[] {
  if (!notifyPrefsForName(user.name).banner) return [];
  return list.filter((n) => n.banner && !n.dismissed && targetsUser(n, user));
}
