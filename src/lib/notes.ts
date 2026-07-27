import { NOTES, type RelatedType } from "@/lib/mock-data";
import { getCommsSnapshot } from "@/lib/comms-log";
import { canViewNote, type NoteViewer } from "@/lib/note-access";

/**
 * True if the record has any note the viewer is allowed to see (seeded NOTES
 * or a Note-channel comms entry). Private/secure notes stay hidden from the
 * indicator for anyone who cannot open them.
 */
export function hasNote(type: RelatedType, id: string, viewer?: NoteViewer): boolean {
  const visible = (visibility: Parameters<typeof canViewNote>[0], author: string) =>
    !viewer || canViewNote(visibility, author, viewer);

  if (NOTES.some((n) => n.relatedType === type && n.relatedId === id && visible(n.visibility, n.author))) {
    return true;
  }
  return getCommsSnapshot().some(
    (e) =>
      e.channel === "Note" &&
      e.relatedType === type &&
      e.relatedId === id &&
      visible(e.visibility, e.author),
  );
}
