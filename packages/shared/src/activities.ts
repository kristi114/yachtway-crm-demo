import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";
import { RoleSchema, type Role } from "./auth.js";

/**
 * Record activity: tasks, notes, appointments and personal calendar entries.
 * Ported from the standalone build's mock stores (tasks-log.ts, notes.ts,
 * note-access.ts, personal-calendar.ts) which are the product spec.
 *
 * Every activity hangs off exactly ONE record. The mocks model that as
 * relatedType + relatedId; the database uses four nullable FK columns with a
 * CHECK, which keeps referential integrity and lets RLS join. The API speaks the
 * relatedType/relatedId shape either way.
 */

export const RelatedTypeSchema = z.enum(["contact", "company", "listing", "opportunity"]);
export type RelatedType = z.infer<typeof RelatedTypeSchema>;

export const RelatedRefSchema = z.object({
  relatedType: RelatedTypeSchema,
  relatedId: IdSchema,
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export const TaskStatusSchema = z.enum(["Open", "In Progress", "Done"]);
export const TaskPrioritySchema = z.enum(["Low", "Med", "High"]);

export const TaskSchema = RelatedRefSchema.extend({
  id: IdSchema,
  title: z.string().min(1),
  /** Free-text assignee name today; assignedToId links a real user when known. */
  assignee: z.string().nullish(),
  assignedToId: IdSchema.nullish(),
  dueDate: IsoDateSchema.nullish(),
  status: TaskStatusSchema.default("Open"),
  priority: TaskPrioritySchema.default("Med"),
  notes: z.string().nullish(),
  completedAt: IsoDateSchema.nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskCreateSchema = TaskSchema.omit({
  id: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
});
export const TaskUpdateSchema = TaskCreateSchema.partial();

// ---------------------------------------------------------------------------
// Notes — with a real access model
// ---------------------------------------------------------------------------
/**
 * `public`  everyone with CRM access
 * `team`    everyone on the account team (all internal roles today)
 * `private` the author only
 * `secure`  the author plus SECURE_NOTE_ROLES (legal, HR, credit, disputes)
 */
export const NoteVisibilitySchema = z.enum(["private", "team", "public", "secure"]);
export type NoteVisibility = z.infer<typeof NoteVisibilitySchema>;

/** Roles that may read someone else's secure note. */
export const SECURE_NOTE_ROLES: Role[] = ["ADMIN"];

export const NoteSchema = RelatedRefSchema.extend({
  id: IdSchema,
  body: z.string(),
  /** Display name of the author, as shown in the UI. */
  author: z.string().nullish(),
  /** Auth subject of the author — the identity the access rules compare against. */
  authorId: z.string().nullish(),
  visibility: NoteVisibilitySchema.default("team"),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Note = z.infer<typeof NoteSchema>;

export const NoteCreateSchema = NoteSchema.omit({
  id: true,
  author: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
});
export const NoteUpdateSchema = z.object({
  body: z.string().optional(),
  visibility: NoteVisibilitySchema.optional(),
});

/**
 * A note the caller may know exists but not read: the row is returned with the
 * body stripped and a reason, so a redacted placeholder can render instead of the
 * note silently vanishing.
 */
export const RedactedNoteSchema = NoteSchema.omit({ body: true }).extend({
  body: z.null(),
  restricted: z.literal(true),
  restrictedReason: z.string(),
});

/** True when this viewer may read the note body. Shared by the API and the UI. */
export function canViewNote(
  note: { visibility?: NoteVisibility | null; authorId?: string | null },
  viewer: { userId: string; role: Role },
): boolean {
  const isAuthor = Boolean(note.authorId && note.authorId === viewer.userId);
  switch (note.visibility) {
    case "private":
      return isAuthor;
    case "secure":
      return isAuthor || SECURE_NOTE_ROLES.includes(viewer.role);
    default:
      return true;
  }
}

/** Editing follows reading: if you can read it, you can change it. */
export const canEditNote = canViewNote;

export function restrictedReason(visibility: NoteVisibility | null | undefined): string {
  return visibility === "secure"
    ? "Secure note — restricted to the author and admins"
    : "Private note — visible to the author only";
}

// ---------------------------------------------------------------------------
// Appointments — meetings on a record (the Google Calendar sync target)
// ---------------------------------------------------------------------------
export const AppointmentSchema = RelatedRefSchema.extend({
  id: IdSchema,
  title: z.string().min(1),
  startAt: IsoDateSchema,
  endAt: IsoDateSchema.nullish(),
  allDay: z.boolean().default(false),
  location: z.string().nullish(),
  notes: z.string().nullish(),
  /** Free-text attendee list, as the mock models it. */
  attendees: z.array(z.string()).default([]),
  timezone: z.string().nullish(),
  /** Google Calendar event id once two-way sync exists. */
  externalEventId: z.string().nullish(),
  ownerId: IdSchema.nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Appointment = z.infer<typeof AppointmentSchema>;

export const AppointmentCreateSchema = AppointmentSchema.omit({
  id: true,
  externalEventId: true,
  createdAt: true,
  updatedAt: true,
});
export const AppointmentUpdateSchema = AppointmentCreateSchema.partial();

// ---------------------------------------------------------------------------
// Personal calendar — a user's own entries, not tied to a record
// ---------------------------------------------------------------------------
export const PersonalEntrySchema = z.object({
  id: IdSchema,
  /** Auth subject who owns it. Only they can see it. */
  userId: z.string(),
  title: z.string().min(1),
  startAt: IsoDateSchema,
  endAt: IsoDateSchema.nullish(),
  allDay: z.boolean().default(false),
  location: z.string().nullish(),
  notes: z.string().nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type PersonalEntry = z.infer<typeof PersonalEntrySchema>;

export const PersonalEntryCreateSchema = PersonalEntrySchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export const PersonalEntryUpdateSchema = PersonalEntryCreateSchema.partial();

// ---------------------------------------------------------------------------
// Combined feed for a record's activity panel
// ---------------------------------------------------------------------------
export const ActivityQuerySchema = z.object({
  relatedType: RelatedTypeSchema.optional(),
  relatedId: IdSchema.optional(),
  status: TaskStatusSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const RecordActivitySchema = z.object({
  tasks: z.array(TaskSchema),
  notes: z.array(z.union([NoteSchema, RedactedNoteSchema])),
  appointments: z.array(AppointmentSchema),
});

export { RoleSchema };
