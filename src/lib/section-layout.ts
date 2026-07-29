/**
 * Per-user saved order of detail-page sections.
 *
 * Keyed by a layout key (usually the object, e.g. "company") + the user id, so
 * each user gets their own arrangement. Stores an ordered array of section ids;
 * unknown / new section ids fall back to their default position.
 */

const KEY = (layoutKey: string, userId: string) => `yw:section-order:${layoutKey}:${userId}`;

export function loadSectionOrder(layoutKey: string, userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY(layoutKey, userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveSectionOrder(layoutKey: string, userId: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(layoutKey, userId), JSON.stringify(ids));
  } catch {
    /* quota / private mode — in-memory only for this session */
  }
}

/** Apply a saved order to a default-ordered id list: saved ids first (in their
 * saved order), any new/unknown ids kept in their default position at the end. */
export function applyOrder(defaultIds: string[], saved: string[]): string[] {
  const known = saved.filter((id) => defaultIds.includes(id));
  const rest = defaultIds.filter((id) => !known.includes(id));
  return [...known, ...rest];
}
