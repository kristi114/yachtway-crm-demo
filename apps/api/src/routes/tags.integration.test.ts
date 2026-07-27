import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Proves tag behavior end-to-end: case-insensitive dedupe into a shared Tag
 * pool, linkage from both Company and Contact, and PATCH replace-semantics.
 * Requires the local DB + `pnpm db:setup`. Excluded from the default suite.
 * Uses ITEST-* tag names so it never touches real/manual data.
 */
const app = createApp();
const H = { "x-crm-role": "SALES_REP" };
const KEYS = ["itest-vip", "itest-show 2026", "itest-premier"];
const companyIds: string[] = [];
const contactIds: string[] = [];

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    if (companyIds.length) await tx.company.deleteMany({ where: { id: { in: companyIds } } });
    if (contactIds.length) await tx.contact.deleteMany({ where: { id: { in: contactIds } } });
  });
  await prisma.tag.deleteMany({ where: { nameKey: { in: KEYS } } });
  await prisma.$disconnect();
});

describe("Tags (dedupe + linkage + replace)", () => {
  it("creates a company with tags and echoes them back as names", async () => {
    const res = await request(app)
      .post("/companies")
      .set(H)
      .send({ name: "ITEST Tag Co", tags: ["ITEST-VIP", "ITEST-Show 2026"] })
      .expect(201);
    companyIds.push(res.body.id);
    expect([...res.body.tags].sort()).toEqual(["ITEST-Show 2026", "ITEST-VIP"]);
  });

  it("dedupes case/whitespace variants to the SAME tag from a Contact", async () => {
    const res = await request(app)
      .post("/contacts")
      .set(H)
      .send({ recordType: "Buyer", firstName: "Tag", tags: ["itest-vip", "  ITEST-VIP  "] })
      .expect(201);
    contactIds.push(res.body.id);
    // both variants collapse to the single existing display name
    expect(res.body.tags).toEqual(["ITEST-VIP"]);

    const vip = await prisma.tag.findMany({ where: { nameKey: "itest-vip" } });
    expect(vip).toHaveLength(1);
    expect(vip[0]!.name).toBe("ITEST-VIP"); // first-writer casing preserved
  });

  it("returns tags on the detail read path", async () => {
    const res = await request(app).get(`/companies/${companyIds[0]}`).set(H).expect(200);
    expect([...res.body.tags].sort()).toEqual(["ITEST-Show 2026", "ITEST-VIP"]);
  });

  it("PATCH replaces the tag set (adds Premier, drops Show 2026)", async () => {
    const res = await request(app)
      .patch(`/companies/${companyIds[0]}`)
      .set(H)
      .send({ tags: ["ITEST-VIP", "ITEST-Premier"] })
      .expect(200);
    expect([...res.body.tags].sort()).toEqual(["ITEST-Premier", "ITEST-VIP"]);
  });
});
