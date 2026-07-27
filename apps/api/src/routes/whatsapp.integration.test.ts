import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  process.env.WHATSAPP_APP_SECRET = "itest-wa-secret";
  process.env.WHATSAPP_VERIFY_TOKEN = "itest-verify-token";
  process.env.WHATSAPP_ACCESS_TOKEN = "itest-access";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "itest-phone";
  return { secret: "itest-wa-secret", verify: "itest-verify-token" };
});

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";
import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";

/**
 * Phase 4 — WhatsApp (Meta Cloud API): GET subscription handshake, signed inbound
 * webhook creates/append to a thread keyed by wa_id, delivery statuses update the
 * sent message, redelivered messages are idempotent, bad signatures rejected, and
 * an operator reply sends to the customer's number. Writes run under INTEGRATION.
 * Requires the local DB + policies. Excluded from the unit suite.
 */
const app = createApp();

const IN_PHONE = "15551230000";
const OUT_PHONE = "15559990000";
const IN_WAMID = "wamid.ITEST_IN";
const OUT_WAMID = "wamid.ITEST_OUT";
const OUT_CONV = "itest_wa_out_conv";
const OUT_MSG = "itest_wa_out_msg";

function inboundBody(over: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "itest-phone" },
              contacts: [{ wa_id: IN_PHONE }],
              messages: [{ from: IN_PHONE, id: IN_WAMID, type: "text", timestamp: "1769000000", text: { body: "Hi via WhatsApp" }, ...over }],
            },
          },
        ],
      },
    ],
  };
}

function statusBody(wamid: string, status: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { statuses: [{ id: wamid, status, recipient_id: OUT_PHONE }] } }] }],
  };
}

function postSigned(payload: Record<string, unknown>, opts: { badSig?: boolean } = {}) {
  const rawBody = JSON.stringify(payload);
  const signature = opts.badSig
    ? "sha256=deadbeef"
    : "sha256=" + createHmac("sha256", H.secret).update(rawBody).digest("hex");
  return request(app)
    .post("/webhooks/whatsapp")
    .set("Content-Type", "application/json")
    .set("X-Hub-Signature-256", signature)
    .send(rawBody);
}

beforeAll(async () => {
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
      where: { id: OUT_CONV },
      create: { id: OUT_CONV, channel: "whatsapp", status: "open", sensitivityClass: "general", externalThreadId: OUT_PHONE },
      update: { externalThreadId: OUT_PHONE, messageCount: 0 },
    });
    // A prior outbound message to receive a delivery status.
    await tx.message.upsert({
      where: { id: OUT_MSG },
      create: {
        id: OUT_MSG,
        conversationId: OUT_CONV,
        channel: "whatsapp",
        direction: "outbound",
        body: "earlier reply",
        provider: "whatsapp",
        providerMessageId: OUT_WAMID,
        deliveryStatus: "sent",
        sensitivityClass: "general",
        activityTimestamp: new Date(),
      },
      update: { deliveryStatus: "sent" },
    });
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM webhook_events WHERE provider = 'whatsapp' AND external_id = ${IN_WAMID}`;
    await tx.$executeRaw`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE external_thread_id IN (${IN_PHONE}, ${OUT_PHONE}))`;
    await tx.$executeRaw`DELETE FROM conversations WHERE external_thread_id IN (${IN_PHONE}, ${OUT_PHONE})`;
  });
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe("WhatsApp webhook + send (HTTP)", () => {
  it("GET verifies the subscription and echoes the challenge", async () => {
    const res = await request(app)
      .get("/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": H.verify, "hub.challenge": "CH_42" })
      .expect(200);
    expect(res.text).toBe("CH_42");
  });

  it("GET rejects a wrong verify token (403)", async () => {
    await request(app)
      .get("/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "CH" })
      .expect(403);
  });

  it("POST rejects a bad signature (401)", async () => {
    await postSigned(inboundBody(), { badSig: true }).expect(401);
  });

  it("ingests an inbound message into a wa_id-keyed thread", async () => {
    const res = await postSigned(inboundBody()).expect(200);
    expect(res.body.ingested).toBe(1);
    const convo = await withRole("ADMIN", (tx) =>
      tx.conversation.findFirst({ where: { externalThreadId: IN_PHONE, channel: "whatsapp" } }),
    );
    expect(convo?.messageCount).toBe(1);
    const msgs = await withRole("ADMIN", (tx) => tx.message.findMany({ where: { conversationId: convo!.id } }));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ direction: "inbound", provider: "whatsapp", body: "Hi via WhatsApp" });
  });

  it("is idempotent on wamid", async () => {
    const res = await postSigned(inboundBody()).expect(200);
    expect(res.body.duplicates).toBe(1);
    const convo = await withRole("ADMIN", (tx) =>
      tx.conversation.findFirst({ where: { externalThreadId: IN_PHONE, channel: "whatsapp" } }),
    );
    expect(convo?.messageCount).toBe(1);
  });

  it("applies a delivery status to the sent message", async () => {
    await postSigned(statusBody(OUT_WAMID, "delivered")).expect(200);
    const msg = await withRole("ADMIN", (tx) => tx.message.findUnique({ where: { id: OUT_MSG } }));
    expect(msg?.deliveryStatus).toBe("delivered");
  });

  it("an operator reply sends to the customer's number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: "wamid.SENT_9" }] }),
        text: async () => "",
      })),
    );
    const res = await request(app)
      .post(`/conversations/${OUT_CONV}/messages`)
      .set("x-crm-role", "SALES_REP")
      .set("x-crm-user-id", "itest_user_rep")
      .send({ provider: "whatsapp", body: "Thanks for reaching out!" })
      .expect(201);
    expect(res.body.provider).toBe("whatsapp");
    expect(res.body.providerMessageId).toBe("wamid.SENT_9");
    expect(res.body.deliveryStatus).toBe("sent");
  });
});
