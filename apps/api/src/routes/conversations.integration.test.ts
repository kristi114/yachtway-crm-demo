import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Phase 4 (increment i) exit proof over HTTP:
 *   - a general thread is fully usable by a rep (list, open, post, read, rollup);
 *   - a financing (easyfund) thread is invisible to a rep — filtered from the
 *     list and the company rollup, 404 on direct fetch — while Fintech sees it;
 *   - a rep cannot open a financing thread (403 on create).
 * Full stack: dev auth -> authorizeAny(conversations.*) -> withRole -> RLS on
 * conversations / messages / conversation_read_state. Requires the local DB with
 * the conversations migration applied + policies. Excluded from the unit suite.
 */
const app = createApp();

const COMPANY = "itest_conv_company";
const CONTACT = "itest_conv_contact";
const GEN_CONV = "itest_conv_general";
const FIN_CONV = "itest_conv_financing";
const READ_CONV = "itest_conv_read";
const SEED_MSG = "itest_conv_seedmsg";

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.company.upsert({ where: { id: COMPANY }, create: { id: COMPANY, name: "Itest Dealer" }, update: {} });
    await tx.contact.upsert({
      where: { id: CONTACT },
      create: { id: CONTACT, companyId: COMPANY },
      update: { companyId: COMPANY },
    });
    for (const [id, cls] of [
      [GEN_CONV, "general"],
      [FIN_CONV, "easyfund"],
      [READ_CONV, "general"],
    ] as const) {
      await tx.conversation.upsert({
        where: { id },
        create: {
          id,
          companyId: COMPANY,
          contactId: id === FIN_CONV ? null : CONTACT,
          channel: "email",
          status: "open",
          sensitivityClass: cls,
        },
        update: { sensitivityClass: cls, messageCount: 0, lastMessageAt: null },
      });
    }
    // One inbound message on READ_CONV so unread has something to count.
    await tx.message.upsert({
      where: { id: SEED_MSG },
      create: {
        id: SEED_MSG,
        conversationId: READ_CONV,
        channel: "email",
        direction: "inbound",
        body: "Hi, question about the listing",
        sensitivityClass: "general",
        activityTimestamp: new Date(),
      },
      update: {},
    });
    await tx.conversation.update({
      where: { id: READ_CONV },
      data: { messageCount: 1, lastMessageAt: new Date() },
    });
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM conversation_read_state WHERE conversation_id IN (${GEN_CONV}, ${FIN_CONV}, ${READ_CONV})`;
    await tx.$executeRaw`DELETE FROM messages WHERE conversation_id IN (${GEN_CONV}, ${FIN_CONV}, ${READ_CONV})`;
    await tx.$executeRaw`DELETE FROM conversations WHERE id IN (${GEN_CONV}, ${FIN_CONV}, ${READ_CONV}) OR id LIKE 'itest_conv_new%'`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${CONTACT}`;
    await tx.$executeRaw`DELETE FROM companies WHERE id = ${COMPANY}`;
  });
  await prisma.$disconnect();
});

describe("Conversations (HTTP)", () => {
  it("unauthenticated gets 401", async () => {
    await request(app).get("/conversations").expect(401);
  });

  it("SALES_REP list excludes the financing thread, includes the general one", async () => {
    const res = await request(app).get("/conversations").set("x-crm-role", "SALES_REP").expect(200);
    const ids = res.body.data.map((c: { id: string }) => c.id);
    expect(ids).toContain(GEN_CONV);
    expect(ids).not.toContain(FIN_CONV);
  });

  it("SALES_REP gets 404 (not 403) opening a financing thread — existence not leaked", async () => {
    await request(app).get(`/conversations/${FIN_CONV}`).set("x-crm-role", "SALES_REP").expect(404);
  });

  it("FINTECH can open the financing thread", async () => {
    const res = await request(app).get(`/conversations/${FIN_CONV}`).set("x-crm-role", "FINTECH").expect(200);
    expect(res.body.id).toBe(FIN_CONV);
    expect(res.body.sensitivityClass).toBe("easyfund");
  });

  it("SALES_REP can create a general thread but not a financing one", async () => {
    const ok = await request(app)
      .post("/conversations")
      .set("x-crm-role", "SALES_REP")
      .set("x-crm-user-id", "itest_user_rep")
      .send({ contactId: CONTACT, channel: "sms", subject: "Follow up" })
      .expect(201);
    expect(ok.body.sensitivityClass).toBe("general");
    // tidy up the created row (afterAll also sweeps itest_conv_new*)
    await withRole("ADMIN", (tx) => tx.$executeRaw`DELETE FROM conversations WHERE id = ${ok.body.id}`);

    await request(app)
      .post("/conversations")
      .set("x-crm-role", "SALES_REP")
      .send({ channel: "email", sensitivityClass: "easyfund" })
      .expect(403);
  });

  it("SALES_REP posts a message and the thread summary rolls forward", async () => {
    await request(app)
      .post(`/conversations/${GEN_CONV}/messages`)
      .set("x-crm-role", "SALES_REP")
      .set("x-crm-user-id", "itest_user_rep")
      .send({ body: "Thanks for reaching out — happy to help." })
      .expect(201);

    const res = await request(app).get(`/conversations/${GEN_CONV}`).set("x-crm-role", "SALES_REP").expect(200);
    expect(res.body.messageCount).toBe(1);
    expect(res.body.lastMessagePreview).toContain("Thanks for reaching out");
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].body).toContain("Thanks for reaching out");
  });

  it("SALES_REP cannot post to a financing thread (404 — invisible)", async () => {
    await request(app)
      .post(`/conversations/${FIN_CONV}/messages`)
      .set("x-crm-role", "SALES_REP")
      .send({ body: "should never land" })
      .expect(404);
  });

  it("unread reflects new messages and clears after marking read", async () => {
    const before = await request(app)
      .get(`/conversations/${READ_CONV}`)
      .set("x-crm-role", "SALES_REP")
      .set("x-crm-user-id", "itest_user_rep")
      .expect(200);
    expect(before.body.unreadCount).toBeGreaterThanOrEqual(1);

    await request(app)
      .post(`/conversations/${READ_CONV}/read`)
      .set("x-crm-role", "SALES_REP")
      .set("x-crm-user-id", "itest_user_rep")
      .send({})
      .expect(200);

    const after = await request(app)
      .get(`/conversations/${READ_CONV}`)
      .set("x-crm-role", "SALES_REP")
      .set("x-crm-user-id", "itest_user_rep")
      .expect(200);
    expect(after.body.unreadCount).toBe(0);
  });

  it("company rollup returns the dealer's general threads and hides financing from a rep", async () => {
    const rep = await request(app)
      .get(`/companies/${COMPANY}/conversations`)
      .set("x-crm-role", "SALES_REP")
      .expect(200);
    const repIds = rep.body.data.map((c: { id: string }) => c.id);
    expect(repIds).toEqual(expect.arrayContaining([GEN_CONV, READ_CONV]));
    expect(repIds).not.toContain(FIN_CONV);

    const fin = await request(app)
      .get(`/companies/${COMPANY}/conversations`)
      .set("x-crm-role", "FINTECH")
      .expect(200);
    const finIds = fin.body.data.map((c: { id: string }) => c.id);
    expect(finIds).toContain(FIN_CONV);
  });
});
