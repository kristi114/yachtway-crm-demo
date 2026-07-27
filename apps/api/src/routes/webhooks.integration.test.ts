import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Set Mailgun env BEFORE the app (and its env.ts) load. vi.hoisted runs before imports.
const HOISTED = vi.hoisted(() => {
  process.env.MAILGUN_SIGNING_KEY = "itest-mailgun-signing-key";
  process.env.MAILGUN_API_KEY = "itest-api-key";
  process.env.MAILGUN_DOMAIN = "test.mailgun.org";
  return { signingKey: "itest-mailgun-signing-key" };
});

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";
import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";

/**
 * Phase 4 ii-b exit proof: a Mailgun-sent message accrues tracking from signed
 * event webhooks, redelivered events are idempotent, and a bad signature is
 * rejected. Writes happen under the INTEGRATION system role via RLS. Requires
 * the local DB with the ii-b migration + policies. Excluded from the unit suite.
 */
const app = createApp();

const CONV = "itest_mg_conv";
const EVT_OPEN = "itest_mg_evt_open";
let messageId = "";

function webhookBody(eventId: string, event: string, crmMessageId: string, tsSeconds: number) {
  const timestamp = String(tsSeconds);
  const token = `tok-${eventId}`;
  const signature = createHmac("sha256", HOISTED.signingKey).update(timestamp + token).digest("hex");
  return {
    signature: { timestamp, token, signature },
    "event-data": {
      id: eventId,
      event,
      url: "https://yachtway.com/listing/42",
      "user-variables": { crm_message_id: crmMessageId },
    },
  };
}

beforeAll(async () => {
  // Ensure the INTEGRATION role + grants exist (roles/permission_grants aren't RLS'd).
  const role = await prisma.role.upsert({
    where: { key: "INTEGRATION" },
    update: { isActive: true },
    create: { key: "INTEGRATION", name: "Integration" },
  });
  for (const g of SYSTEM_ROLE_GRANTS.INTEGRATION) {
    await prisma.permissionGrant.upsert({
      where: { roleId_resourceClass: { roleId: role.id, resourceClass: g.resource } },
      update: { canRead: g.read, canWrite: g.write },
      create: { roleId: role.id, resourceClass: g.resource, canRead: g.read, canWrite: g.write },
    });
  }
  await withRole("ADMIN", async (tx) => {
    await tx.conversation.upsert({
      where: { id: CONV },
      create: { id: CONV, channel: "email", status: "open", sensitivityClass: "general" },
      update: { messageCount: 0 },
    });
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM webhook_events WHERE external_id IN (${EVT_OPEN})`;
    await tx.$executeRaw`DELETE FROM messages WHERE conversation_id = ${CONV}`;
    await tx.$executeRaw`DELETE FROM conversations WHERE id = ${CONV}`;
  });
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe("Mailgun send + tracking webhook (HTTP)", () => {
  it("sends via Mailgun and records the provider id + sent status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ id: "<20260724.mg@test.mailgun.org>", message: "Queued. Thank you." }),
        text: async () => "",
      })),
    );

    const res = await request(app)
      .post(`/conversations/${CONV}/messages`)
      .set("x-crm-role", "SALES_REP")
      .set("x-crm-user-id", "itest_user_rep")
      .send({
        provider: "mailgun",
        fromAddress: "crew@yachtway.com",
        toAddress: "dealer@example.com",
        subject: "Your July spotlight results",
        body: "<p>Here are your numbers.</p>",
      })
      .expect(201);

    expect(res.body.provider).toBe("mailgun");
    expect(res.body.providerMessageId).toBe("<20260724.mg@test.mailgun.org>");
    expect(res.body.deliveryStatus).toBe("sent");
    messageId = res.body.id;
    expect(messageId).toBeTruthy();
  });

  it("rejects a webhook with a bad signature (406)", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = webhookBody(EVT_OPEN, "opened", messageId, ts);
    body.signature.signature = "deadbeef";
    await request(app).post("/webhooks/mailgun").send(body).expect(406);
  });

  it("applies an opened event to the message", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await request(app)
      .post("/webhooks/mailgun")
      .send(webhookBody(EVT_OPEN, "opened", messageId, ts))
      .expect(200);
    expect(res.body.matched).toBe(true);

    const msg = await withRole("ADMIN", (tx) => tx.message.findUnique({ where: { id: messageId } }));
    expect(msg?.deliveryStatus).toBe("opened");
    expect(Number(msg?.openCount)).toBe(1);
  });

  it("is idempotent — a redelivered event does not double-count", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await request(app)
      .post("/webhooks/mailgun")
      .send(webhookBody(EVT_OPEN, "opened", messageId, ts))
      .expect(200);
    expect(res.body.duplicate).toBe(true);

    const msg = await withRole("ADMIN", (tx) => tx.message.findUnique({ where: { id: messageId } }));
    expect(Number(msg?.openCount)).toBe(1);
  });
});
