// Simple client-side screenshot event log.
// Backend will replace with a server-side audit trail.

export interface ScreenshotEvent {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  at: number; // epoch ms
  method: string; // e.g. "PrintScreen", "Meta+Shift+3", "Ctrl+Shift+S"
  path: string; // page where it happened
}

const KEY = "yw.screenshot-events.v1";
const LISTENERS = new Set<() => void>();

function read(): ScreenshotEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScreenshotEvent[]) : [];
  } catch {
    return [];
  }
}

function write(events: ScreenshotEvent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(events.slice(-500)));
  } catch {
    // ignore quota
  }
  LISTENERS.forEach((l) => l());
}

export function logScreenshotEvent(evt: Omit<ScreenshotEvent, "id" | "at">) {
  const full: ScreenshotEvent = {
    ...evt,
    id: `ss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
  };
  const events = read();
  events.push(full);
  write(events);
  return full;
}

export function listScreenshotEvents(): ScreenshotEvent[] {
  return read().slice().reverse();
}

export function screenshotCountsByUser(): Array<{
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  count: number;
  lastAt: number;
}> {
  const events = read();
  const map = new Map<string, { userId: string; userName: string; userEmail: string; role: string; count: number; lastAt: number }>();
  for (const e of events) {
    const prev = map.get(e.userId);
    if (prev) {
      prev.count += 1;
      if (e.at > prev.lastAt) prev.lastAt = e.at;
    } else {
      map.set(e.userId, {
        userId: e.userId,
        userName: e.userName,
        userEmail: e.userEmail,
        role: e.role,
        count: 1,
        lastAt: e.at,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function subscribeScreenshotEvents(fn: () => void) {
  LISTENERS.add(fn);
  return () => {
    LISTENERS.delete(fn);
  };
}

export function clearScreenshotEvents() {
  write([]);
}
