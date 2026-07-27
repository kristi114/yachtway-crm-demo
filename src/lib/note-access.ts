import type { NoteVisibility } from "@/lib/mock-data";
import type { Role, User } from "@/lib/auth";

/**
 * Note visibility model.
 *
 * - `public`  - everyone with CRM access
 * - `team`    - everyone on the account team (all internal roles today)
 * - `private` - the author only
 * - `secure`  - the author plus roles in `SECURE_NOTE_ROLES` (restricted /
 *               sensitive content: legal, HR, credit or dispute detail)
 */
export const SECURE_NOTE_ROLES: Role[] = ["admin"];

export interface NoteViewer {
  name: string;
  role: Role;
}

export function toNoteViewer(user: Pick<User, "name" | "role">): NoteViewer {
  return { name: user.name, role: user.role };
}

/** True when the viewer may read the note body. */
export function canViewNote(
  visibility: NoteVisibility | undefined,
  author: string,
  viewer: NoteViewer,
): boolean {
  const isAuthor = author.trim().toLowerCase() === viewer.name.trim().toLowerCase();
  switch (visibility) {
    case "private":
      return isAuthor;
    case "secure":
      return isAuthor || SECURE_NOTE_ROLES.includes(viewer.role);
    default:
      return true;
  }
}

/** True when the viewer may change the note body/visibility. */
export function canEditNote(
  visibility: NoteVisibility | undefined,
  author: string,
  viewer: NoteViewer,
): boolean {
  return canViewNote(visibility, author, viewer);
}

/**
 * True when the viewer is allowed to mark a note as secure.
 *
 * Any internal user can write one - the restriction is on reading it (author
 * plus `SECURE_NOTE_ROLES`), not on creating it.
 */
export function canCreateSecureNote(_viewer: NoteViewer): boolean {
  return true;
}

/** Short reason shown on a redacted row. */
export function restrictedReason(visibility: NoteVisibility | undefined): string {
  return visibility === "secure"
    ? "Secure note - restricted to the author and admins"
    : "Private note - visible to the author only";
}

export const VISIBILITY_OPTIONS: { id: NoteVisibility; label: string; hint: string }[] = [
  { id: "private", label: "Private", hint: "Only me" },
  { id: "team", label: "Team", hint: "Account team" },
  { id: "public", label: "Public", hint: "Everyone" },
  { id: "secure", label: "Secure", hint: "Me + admins" },
];
