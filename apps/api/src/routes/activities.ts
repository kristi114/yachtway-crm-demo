import type { Prisma } from "@prisma/client";
import { Router } from "express";
import {
  AppointmentCreateSchema,
  AppointmentUpdateSchema,
  canViewNote,
  NoteCreateSchema,
  NoteUpdateSchema,
  type NoteVisibility,
  NoteVisibilitySchema,
  PersonalEntryCreateSchema,
  PersonalEntryUpdateSchema,
  type RelatedType,
  RelatedTypeSchema,
  restrictedReason,
  type Role,
  TaskCreateSchema,
  TaskUpdateSchema,
} from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";

/**
 * Record activity: tasks, notes, appointments, and the caller's own calendar.
 *
 * Two things to know:
 *
 * • The parent is stored as one of four FK columns, not a type/id string pair, so
 *   the API translates. `relatedRef` does the mapping in both directions and is
 *   the only place that knows the shape.
 * • Notes have per-author visibility enforced by RLS (private → author only,
 *   secure → author + ADMIN), so a note the caller may not read simply isn't
 *   returned. On single fetches we answer 404 rather than 403: whether a private
 *   note exists is itself information.
 */
const router: Router = Router();
router.use(authContext);

/**
 * `notes.visibility` is a plain String column, so Prisma hands us `string` while
 * the shared rule (canViewNote, shared with the UI) is typed on the NoteVisibility
 * union. Narrow at this boundary — the database is the untyped edge — and fail
 * CLOSED: a value the enum doesn't recognise is treated as `secure` (author +
 * ADMIN only) rather than falling through canViewNote's permissive default and
 * exposing a note nobody classified. The column is NOT NULL with default 'team',
 * so this only fires on genuinely unexpected data.
 */
function noteVisibility(value: string): NoteVisibility {
  const parsed = NoteVisibilitySchema.safeParse(value);
  return parsed.success ? parsed.data : "secure";
}

type ParentColumns = {
  contactId?: string | null;
  companyId?: string | null;
  listingId?: string | null;
  opportunityId?: string | null;
};

const COLUMN_FOR: Record<RelatedType, keyof ParentColumns> = {
  contact: "contactId",
  company: "companyId",
  listing: "listingId",
  opportunity: "opportunityId",
};

/** relatedType + relatedId → the single FK column the row stores. */
function parentColumns(relatedType: RelatedType, relatedId: string): ParentColumns {
  return { [COLUMN_FOR[relatedType]]: relatedId } as ParentColumns;
}

/** The stored row → the relatedType/relatedId pair the UI speaks. */
function relatedRef(row: ParentColumns): { relatedType: RelatedType; relatedId: string } | null {
  if (row.contactId) return { relatedType: "contact", relatedId: row.contactId };
  if (row.companyId) return { relatedType: "company", relatedId: row.companyId };
  if (row.listingId) return { relatedType: "listing", relatedId: row.listingId };
  if (row.opportunityId) return { relatedType: "opportunity", relatedId: row.opportunityId };
  return null;
}

function withRef<T extends ParentColumns>(row: T): T & { relatedType?: RelatedType; relatedId?: string } {
  const ref = relatedRef(row);
  return ref ? { ...row, ...ref } : row;
}

/** Parse a `?relatedType=&relatedId=` filter into a where clause. */
function parentFilter(query: unknown): ParentColumns | null {
  const q = query as { relatedType?: string; relatedId?: string };
  if (!q?.relatedType || !q?.relatedId) return null;
  const parsed = RelatedTypeSchema.safeParse(q.relatedType);
  if (!parsed.success) return null;
  return parentColumns(parsed.data, String(q.relatedId));
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
router.get("/tasks", authorize("task.general", "read"), async (req, res) => {
  const parent = parentFilter(req.query);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const assignedToId = typeof req.query.assignedToId === "string" ? req.query.assignedToId : undefined;

  const rows = await withRole(
    req.auth!.role,
    (tx) =>
      tx.task.findMany({
        where: { ...(parent ?? {}), ...(status ? { status } : {}), ...(assignedToId ? { assignedToId } : {}) },
        // Newest due date first, matching the panel's ordering.
        orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
        take: 200,
      }),
    { userId: req.auth!.userId },
  );
  res.json({ data: rows.map(withRef) });
});

router.post("/tasks", authorize("task.general", "write"), async (req, res) => {
  const input = TaskCreateSchema.parse(req.body);
  const row = await withRole(
    req.auth!.role,
    (tx) =>
      tx.task.create({
        data: {
          title: input.title,
          assignee: input.assignee ?? null,
          assignedToId: input.assignedToId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          status: input.status,
          priority: input.priority,
          notes: input.notes ?? null,
          createdById: req.auth!.userId,
          ...parentColumns(input.relatedType, input.relatedId),
        },
      }),
    { userId: req.auth!.userId },
  );
  res.status(201).json({ data: withRef(row) });
});

router.patch("/tasks/:id", authorize("task.general", "write"), async (req, res) => {
  const input = TaskUpdateSchema.parse(req.body);
  const row = await withRole(
    req.auth!.role,
    async (tx) => {
      const existing = await tx.task.findUnique({ where: { id: String(req.params.id) } });
      if (!existing) return null;
      // Completing a task stamps completedAt; reopening clears it, so the field
      // never lies about a task that went back to Open.
      const completing = input.status === "Done" && existing.status !== "Done";
      const reopening = input.status && input.status !== "Done" && existing.status === "Done";
      return tx.task.update({
        where: { id: existing.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.assignee !== undefined ? { assignee: input.assignee ?? null } : {}),
          ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId ?? null } : {}),
          ...(input.dueDate !== undefined
            ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
          ...(completing ? { completedAt: new Date() } : {}),
          ...(reopening ? { completedAt: null } : {}),
        },
      });
    },
    { userId: req.auth!.userId },
  );
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: withRef(row) });
});

router.delete("/tasks/:id", authorize("task.general", "write"), async (req, res) => {
  const done = await withRole(
    req.auth!.role,
    async (tx) => {
      const del = await tx.task.deleteMany({ where: { id: String(req.params.id) } });
      return del.count === 1;
    },
    { userId: req.auth!.userId },
  );
  if (!done) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
router.get("/notes", authorize("note.general", "read"), async (req, res) => {
  const parent = parentFilter(req.query);
  // RLS already drops rows this caller may not read, so nothing needs redacting
  // here — the list simply doesn't contain them.
  const rows = await withRole(
    req.auth!.role,
    (tx) =>
      tx.note.findMany({
        where: { ...(parent ?? {}) },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    { userId: req.auth!.userId },
  );
  res.json({ data: rows.map(withRef) });
});

router.post("/notes", authorize("note.general", "write"), async (req, res) => {
  const input = NoteCreateSchema.parse(req.body);
  const row = await withRole(
    req.auth!.role,
    (tx) =>
      tx.note.create({
        data: {
          body: input.body,
          visibility: input.visibility,
          author: req.auth!.userId,
          authorId: req.auth!.userId,
          ...parentColumns(input.relatedType, input.relatedId),
        },
      }),
    { userId: req.auth!.userId },
  );
  res.status(201).json({ data: withRef(row) });
});

router.patch("/notes/:id", authorize("note.general", "write"), async (req, res) => {
  const input = NoteUpdateSchema.parse(req.body);
  const row = await withRole(
    req.auth!.role,
    async (tx) => {
      const existing = await tx.note.findUnique({ where: { id: String(req.params.id) } });
      if (!existing) return null;
      // Belt and braces: RLS already hides notes the caller can't read, but check
      // the same rule in code so the intent is visible at the call site.
      const viewer = { userId: req.auth!.userId, role: req.auth!.role as Role };
      if (!canViewNote({ ...existing, visibility: noteVisibility(existing.visibility) }, viewer))
        return null;
      return tx.note.update({
        where: { id: existing.id },
        data: {
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        },
      });
    },
    { userId: req.auth!.userId },
  );
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: withRef(row) });
});

router.delete("/notes/:id", authorize("note.general", "write"), async (req, res) => {
  const done = await withRole(
    req.auth!.role,
    async (tx) => {
      const del = await tx.note.deleteMany({ where: { id: String(req.params.id) } });
      return del.count === 1;
    },
    { userId: req.auth!.userId },
  );
  if (!done) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
router.get("/appointments", authorize("appointment.general", "read"), async (req, res) => {
  const parent = parentFilter(req.query);
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;

  const rows = await withRole(
    req.auth!.role,
    (tx) =>
      tx.appointment.findMany({
        where: {
          ...(parent ?? {}),
          ...(from || to
            ? {
                startAt: {
                  ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
                  ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
                },
              }
            : {}),
        },
        orderBy: { startAt: "asc" },
        take: 500,
      }),
    { userId: req.auth!.userId },
  );
  res.json({ data: rows.map(withRef) });
});

router.post("/appointments", authorize("appointment.general", "write"), async (req, res) => {
  const input = AppointmentCreateSchema.parse(req.body);
  const row = await withRole(
    req.auth!.role,
    (tx) =>
      tx.appointment.create({
        data: {
          title: input.title,
          startAt: new Date(input.startAt),
          endAt: input.endAt ? new Date(input.endAt) : null,
          allDay: input.allDay,
          location: input.location ?? null,
          notes: input.notes ?? null,
          attendees: input.attendees,
          timezone: input.timezone ?? null,
          ownerId: input.ownerId ?? null,
          createdById: req.auth!.userId,
          ...parentColumns(input.relatedType, input.relatedId),
        },
      }),
    { userId: req.auth!.userId },
  );
  res.status(201).json({ data: withRef(row) });
});

router.patch("/appointments/:id", authorize("appointment.general", "write"), async (req, res) => {
  const input = AppointmentUpdateSchema.parse(req.body);
  const row = await withRole(
    req.auth!.role,
    async (tx) => {
      const existing = await tx.appointment.findUnique({ where: { id: String(req.params.id) } });
      if (!existing) return null;
      return tx.appointment.update({
        where: { id: existing.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.startAt !== undefined ? { startAt: new Date(input.startAt) } : {}),
          ...(input.endAt !== undefined
            ? { endAt: input.endAt ? new Date(input.endAt) : null }
            : {}),
          ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
          ...(input.location !== undefined ? { location: input.location ?? null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
          ...(input.attendees !== undefined ? { attendees: input.attendees } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone ?? null } : {}),
          ...(input.ownerId !== undefined ? { ownerId: input.ownerId ?? null } : {}),
        },
      });
    },
    { userId: req.auth!.userId },
  );
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: withRef(row) });
});

router.delete("/appointments/:id", authorize("appointment.general", "write"), async (req, res) => {
  const done = await withRole(
    req.auth!.role,
    async (tx) => {
      const del = await tx.appointment.deleteMany({ where: { id: String(req.params.id) } });
      return del.count === 1;
    },
    { userId: req.auth!.userId },
  );
  if (!done) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Personal calendar — always the caller's own. There is deliberately no way to
// pass a userId: RLS scopes every row to its owner, and the API never offers the
// parameter that would tempt someone to try.
// ---------------------------------------------------------------------------
router.get("/calendar/personal", authorize("appointment.general", "read"), async (req, res) => {
  const rows = await withRole(
    req.auth!.role,
    (tx) => tx.personalCalendarEntry.findMany({ orderBy: { startAt: "asc" }, take: 500 }),
    { userId: req.auth!.userId },
  );
  res.json({ data: rows });
});

router.post("/calendar/personal", authorize("appointment.general", "write"), async (req, res) => {
  const input = PersonalEntryCreateSchema.parse(req.body);
  const row = await withRole(
    req.auth!.role,
    (tx) =>
      tx.personalCalendarEntry.create({
        data: {
          userId: req.auth!.userId,
          title: input.title,
          startAt: new Date(input.startAt),
          endAt: input.endAt ? new Date(input.endAt) : null,
          allDay: input.allDay,
          location: input.location ?? null,
          notes: input.notes ?? null,
        },
      }),
    { userId: req.auth!.userId },
  );
  res.status(201).json({ data: row });
});

router.patch(
  "/calendar/personal/:id",
  authorize("appointment.general", "write"),
  async (req, res) => {
    const input = PersonalEntryUpdateSchema.parse(req.body);
    const row = await withRole(
      req.auth!.role,
      async (tx) => {
        const existing = await tx.personalCalendarEntry.findUnique({
          where: { id: String(req.params.id) },
        });
        if (!existing) return null;
        return tx.personalCalendarEntry.update({
          where: { id: existing.id },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.startAt !== undefined ? { startAt: new Date(input.startAt) } : {}),
            ...(input.endAt !== undefined
              ? { endAt: input.endAt ? new Date(input.endAt) : null }
              : {}),
            ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
            ...(input.location !== undefined ? { location: input.location ?? null } : {}),
            ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
          },
        });
      },
      { userId: req.auth!.userId },
    );
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ data: row });
  },
);

router.delete(
  "/calendar/personal/:id",
  authorize("appointment.general", "write"),
  async (req, res) => {
    const done = await withRole(
      req.auth!.role,
      async (tx) => {
        const del = await tx.personalCalendarEntry.deleteMany({
          where: { id: String(req.params.id) },
        });
        return del.count === 1;
      },
      { userId: req.auth!.userId },
    );
    if (!done) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Combined feed for a record's activity panel — one call instead of three.
// ---------------------------------------------------------------------------
for (const [segment, type] of [
  ["contacts", "contact"],
  ["companies", "company"],
  ["listings", "listing"],
  ["opportunities", "opportunity"],
] as const) {
  router.get(`/${segment}/:id/activity`, authorize("task.general", "read"), async (req, res) => {
    const where = parentColumns(type, String(req.params.id)) as Prisma.TaskWhereInput;
    const out = await withRole(
      req.auth!.role,
      async (tx) => {
        const [tasks, notes, appointments] = await Promise.all([
          tx.task.findMany({ where, orderBy: [{ dueDate: "desc" }], take: 100 }),
          tx.note.findMany({ where: where as Prisma.NoteWhereInput, orderBy: { createdAt: "desc" }, take: 100 }),
          tx.appointment.findMany({
            where: where as Prisma.AppointmentWhereInput,
            orderBy: { startAt: "desc" },
            take: 100,
          }),
        ]);
        return { tasks, notes, appointments };
      },
      { userId: req.auth!.userId },
    );
    res.json({
      data: {
        tasks: out.tasks.map(withRef),
        notes: out.notes.map(withRef),
        appointments: out.appointments.map(withRef),
      },
    });
  });
}

export { restrictedReason };
export default router;
