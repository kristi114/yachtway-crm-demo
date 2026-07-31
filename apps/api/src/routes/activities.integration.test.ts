import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { withRole } from "../permissions/rls.js";

/**
 * Record activity exit proof:
 *   - tasks/notes/appointments attach to exactly one record and come back with
 *     the relatedType/relatedId pair the UI speaks;
 *   - completing a task stamps completedAt, reopening clears it;
 *   - NOTE VISIBILITY is enforced by Postgres, not just the API: a private note
 *     is invisible to everyone but its author, a secure note is visible to its
 *     author and ADMIN only, and team/public are visible to any grant holder;
 *   - a personal calendar entry belongs to its creator and nobody else can see
 *     it, ADMIN included;
 *   - deleting the parent record takes its activity with it (ON DELETE CASCADE).
 *
 * Requires the local DB with 20260731160000_record_activity applied, plus
 * `pnpm db:policies` (the notes/personal-calendar policies and current_user_id())
 * and `prisma:seed` for the new grants.
 */
const app = createApp();

const COMPANY = "itest_act_company";
const CONTACT = "itest_act_contact";
const REP_A = "itest_rep_a";
const REP_B = "itest_rep_b";

const asRepA = { "x-crm-role": "SALES_REP", "x-crm-user-id": REP_A };
const asRepB = { "x-crm-role": "SALES_REP", "x-crm-user-id": REP_B };
const asAdmin = { "x-crm-role": "ADMIN", "x-crm-user-id": "itest_admin" };

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.company.upsert({
      where: { id: COMPANY },
      create: { id: COMPANY, name: "Itest Activity Dealer" },
      update: {},
    });
    await tx.contact.upsert({
      where: { id: CONTACT },
      create: { id: CONTACT, companyId: COMPANY, recordType: "Broker" },
      update: { companyId: COMPANY },
    });
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.personalCalendarEntry.deleteMany({ where: { title: { startsWith: "[itest]" } } });
    await tx.contact.deleteMany({ where: { id: CONTACT } });
    await tx.company.deleteMany({ where: { id: COMPANY } });
  });
});

describe("tasks", () => {
  it("creates against a record and round-trips the related ref", async () => {
    const res = await request(app)
      .post("/tasks")
      .set(asRepA)
      .send({
        relatedType: "company",
        relatedId: COMPANY,
        title: "[itest] Call the dealer",
        priority: "High",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.relatedType).toBe("company");
    expect(res.body.data.relatedId).toBe(COMPANY);
    expect(res.body.data.status).toBe("Open");

    const list = await request(app)
      .get(`/tasks?relatedType=company&relatedId=${COMPANY}`)
      .set(asRepA);
    expect(list.status).toBe(200);
    expect(list.body.data.some((t: { id: string }) => t.id === res.body.data.id)).toBe(true);
  });

  it("stamps completedAt on Done and clears it on reopen", async () => {
    const created = await request(app)
      .post("/tasks")
      .set(asRepA)
      .send({ relatedType: "contact", relatedId: CONTACT, title: "[itest] Send quote" });

    const done = await request(app)
      .patch(`/tasks/${created.body.data.id}`)
      .set(asRepA)
      .send({ status: "Done" });
    expect(done.body.data.completedAt).toBeTruthy();

    const reopened = await request(app)
      .patch(`/tasks/${created.body.data.id}`)
      .set(asRepA)
      .send({ status: "Open" });
    expect(reopened.body.data.completedAt).toBeNull();
  });
});

describe("note visibility (enforced in Postgres)", () => {
  async function noteAs(headers: Record<string, string>, visibility: string): Promise<string> {
    const res = await request(app)
      .post("/notes")
      .set(headers)
      .send({
        relatedType: "company",
        relatedId: COMPANY,
        body: `[itest] ${visibility} note`,
        visibility,
      });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  it("hides a private note from everyone but its author — including ADMIN", async () => {
    const id = await noteAs(asRepA, "private");

    const authorList = await request(app)
      .get(`/notes?relatedType=company&relatedId=${COMPANY}`)
      .set(asRepA);
    expect(authorList.body.data.some((n: { id: string }) => n.id === id)).toBe(true);

    for (const who of [asRepB, asAdmin]) {
      const list = await request(app)
        .get(`/notes?relatedType=company&relatedId=${COMPANY}`)
        .set(who);
      expect(list.body.data.some((n: { id: string }) => n.id === id)).toBe(false);
    }

    // Another rep cannot edit it either — 404, not 403: its existence is private.
    const edit = await request(app).patch(`/notes/${id}`).set(asRepB).send({ body: "nope" });
    expect(edit.status).toBe(404);
  });

  it("shows a secure note to its author and to ADMIN, but not to another rep", async () => {
    const id = await noteAs(asRepA, "secure");

    for (const [who, expected] of [
      [asRepA, true],
      [asAdmin, true],
      [asRepB, false],
    ] as const) {
      const list = await request(app)
        .get(`/notes?relatedType=company&relatedId=${COMPANY}`)
        .set(who);
      expect(list.body.data.some((n: { id: string }) => n.id === id)).toBe(expected);
    }
  });

  it("shows team and public notes to any grant holder", async () => {
    const team = await noteAs(asRepA, "team");
    const pub = await noteAs(asRepA, "public");
    const list = await request(app)
      .get(`/notes?relatedType=company&relatedId=${COMPANY}`)
      .set(asRepB);
    const ids = list.body.data.map((n: { id: string }) => n.id);
    expect(ids).toContain(team);
    expect(ids).toContain(pub);
  });
});

describe("appointments", () => {
  it("creates a meeting on a record and filters by date range", async () => {
    const startAt = new Date(Date.now() + 3 * 86_400_000);
    const res = await request(app)
      .post("/appointments")
      .set(asRepA)
      .send({
        relatedType: "contact",
        relatedId: CONTACT,
        title: "[itest] Sea trial",
        startAt,
        attendees: ["marco@example.com"],
      });
    expect(res.status).toBe(201);

    const inRange = await request(app)
      .get(
        `/appointments?relatedType=contact&relatedId=${CONTACT}` +
          `&from=${new Date(Date.now() + 86_400_000).toISOString()}` +
          `&to=${new Date(Date.now() + 5 * 86_400_000).toISOString()}`,
      )
      .set(asRepA);
    expect(inRange.body.data.some((a: { id: string }) => a.id === res.body.data.id)).toBe(true);

    const outOfRange = await request(app)
      .get(
        `/appointments?relatedType=contact&relatedId=${CONTACT}` +
          `&from=${new Date(Date.now() + 10 * 86_400_000).toISOString()}`,
      )
      .set(asRepA);
    expect(outOfRange.body.data.some((a: { id: string }) => a.id === res.body.data.id)).toBe(false);
  });
});

describe("personal calendar", () => {
  it("is visible only to its owner, not to another rep or an admin", async () => {
    const created = await request(app)
      .post("/calendar/personal")
      .set(asRepA)
      .send({ title: "[itest] 1:1 with Mavil", startAt: new Date().toISOString() });
    expect(created.status).toBe(201);

    const own = await request(app).get("/calendar/personal").set(asRepA);
    expect(own.body.data.some((e: { id: string }) => e.id === created.body.data.id)).toBe(true);

    for (const who of [asRepB, asAdmin]) {
      const other = await request(app).get("/calendar/personal").set(who);
      expect(other.body.data.some((e: { id: string }) => e.id === created.body.data.id)).toBe(false);
    }
  });
});

describe("combined activity feed", () => {
  it("returns tasks, notes and appointments for one record in a single call", async () => {
    const res = await request(app).get(`/companies/${COMPANY}/activity`).set(asRepA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.tasks)).toBe(true);
    expect(Array.isArray(res.body.data.notes)).toBe(true);
    expect(Array.isArray(res.body.data.appointments)).toBe(true);
    expect(res.body.data.tasks.length).toBeGreaterThan(0);
  });
});

describe("cascade", () => {
  it("deleting the parent record removes its activity", async () => {
    const doomedCompany = "itest_act_doomed";
    await withRole("ADMIN", (tx) =>
      tx.company.upsert({
        where: { id: doomedCompany },
        create: { id: doomedCompany, name: "Itest Doomed" },
        update: {},
      }),
    );
    const task = await request(app)
      .post("/tasks")
      .set(asRepA)
      .send({ relatedType: "company", relatedId: doomedCompany, title: "[itest] orphan check" });
    expect(task.status).toBe(201);

    await withRole("ADMIN", (tx) => tx.company.delete({ where: { id: doomedCompany } }));

    const left = await withRole("ADMIN", (tx) =>
      tx.task.count({ where: { id: task.body.data.id } }),
    );
    expect(left).toBe(0);
  });
});
