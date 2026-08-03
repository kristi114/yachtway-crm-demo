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

// Email-object fixtures: the same webhook must also resolve v:crm_message_id as
// an email_recipients.tracking_token and move that row instead of a Message.
const E_COMPANY = "itest_mgr_company";
const E_CONTACT = "itest_mgr_contact";
const E_SEND = "itest_mgr_send";
const R_DELIVERED = "itest_mgr_r_delivered";
const R_HARD = "itest_mgr_r_hardbounce";
const R_SOFT = "itest_mgr_r_softfail";
const R_SPAM = "itest_mgr_r_complained";
const TOKEN = {
  delivered: "itest-mgr-token-delivered",
  hard: "itest-mgr-token-hard",
  soft: "itest-mgr-token-soft",
  spam: "itest-mgr-token-spam",
};
const EVT = {
  delivered: "itest_mgr_evt_delivered",
  hard: "itest_mgr_evt_hard",
  soft: "itest_mgr_evt_soft",
  spam: "itest_mgr_evt_spam",
};

function webhookBody(
  eventId: string,
  event: string,
  crmMessageId: string,
  tsSeconds: number,
  extra: Record<string, unknown> = {},
) {
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
      ...extra,
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

    await tx.company.upsert({
      where: { id: E_COMPANY },
      create: { id: E_COMPANY, name: "Itest Mailgun Recipient Dealer" },
      update: {},
    });
    await tx.contact.upsert({
      where: { id: E_CONTACT },
      create: {
        id: E_CONTACT,
        firstName: "Bounce",
        lastName: "Tester",
        email: "itest-mgr-contact@example.com",
        companyId: E_COMPANY,
        // Set explicitly on BOTH branches: the column is nullable with no default,
        // so a fresh database would otherwise start this fixture at null and the
        // precondition below would be asserting the create path, not the feature.
        emailOptOut: false,
      },
      update: { emailOptOut: false },
    });
    await tx.emailSend.upsert({
      where: { id: E_SEND },
      create: {
        id: E_SEND,
        subject: "[itest] mailgun recipient events",
        html: "<p>x</p>",
        kind: "marketing",
        provider: "mailgun",
        status: "sent",
        recipientCount: 4,
      },
      update: {
        status: "sent",
        deliveredCount: 0,
        openedCount: 0,
        clickedCount: 0,
        bouncedCount: 0,
      },
    });
    const rows: [string, string, string][] = [
      [R_DELIVERED, TOKEN.delivered, "itest-mgr-delivered@example.com"],
      [R_HARD, TOKEN.hard, "itest-mgr-hard@example.com"],
      [R_SOFT, TOKEN.soft, "itest-mgr-soft@example.com"],
      [R_SPAM, TOKEN.spam, "itest-mgr-contact@example.com"],
    ];
    for (const [id, trackingToken, email] of rows) {
      await tx.emailRecipient.upsert({
        where: { id },
        create: {
          id,
          sendId: E_SEND,
          email,
          kind: "marketing",
          status: "sent",
          trackingToken,
          sentAt: new Date(),
          // Only the complaint row is linked to a contact, so the opt-out
          // assertion can't be satisfied accidentally by another row.
          ...(id === R_SPAM ? { contactId: E_CONTACT } : {}),
        },
        update: {
          status: "sent",
          deliveredAt: null,
          bouncedAt: null,
          openedAt: null,
          clickedAt: null,
          failureReason: null,
        },
      });
    }
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM webhook_events WHERE external_id IN (${EVT_OPEN}, ${EVT.delivered}, ${EVT.hard}, ${EVT.soft}, ${EVT.spam})`;
    await tx.$executeRaw`DELETE FROM messages WHERE conversation_id = ${CONV}`;
    await tx.$executeRaw`DELETE FROM conversations WHERE id = ${CONV}`;
    // email_recipients cascades from email_sends; contacts do not, so go in order.
    await tx.$executeRaw`DELETE FROM email_sends WHERE id = ${E_SEND}`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${E_CONTACT}`;
    await tx.$executeRaw`DELETE FROM companies WHERE id = ${E_COMPANY}`;
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

/**
 * The same endpoint, the other sender. emailRouter.dispatch() puts each
 * recipient's tracking_token in v:crm_message_id, so these events must land on
 * email_recipients — the path that populates delivered_at and, critically, the
 * bounce state the non-opener follow-up logic filters on.
 */
describe("Mailgun events → email_recipients", () => {
  const post = (eventId: string, event: string, token: string, extra?: Record<string, unknown>) =>
    request(app)
      .post("/webhooks/mailgun")
      .send(webhookBody(eventId, event, token, Math.floor(Date.now() / 1000), extra))
      .expect(200);

  const recipient = (id: string) =>
    withRole("ADMIN", (tx) => tx.emailRecipient.findUnique({ where: { id } }));

  it("stamps a delivered event on the recipient and counts it on the send", async () => {
    const res = await post(EVT.delivered, "delivered", TOKEN.delivered);
    expect(res.body.matched).toBe(true);

    const r = await recipient(R_DELIVERED);
    expect(r?.status).toBe("delivered");
    expect(r?.deliveredAt).toBeTruthy();

    const send = await withRole("ADMIN", (tx) =>
      tx.emailSend.findUnique({ where: { id: E_SEND } }),
    );
    expect(send?.deliveredCount).toBe(1);
  });

  it("treats a PERMANENT failure as a bounce, with the reason", async () => {
    await post(EVT.hard, "failed", TOKEN.hard, {
      severity: "permanent",
      reason: "suppress-bounce",
      "delivery-status": { message: "550 5.1.1 user unknown", code: 550 },
    });

    const r = await recipient(R_HARD);
    expect(r?.status).toBe("bounced");
    expect(r?.bouncedAt).toBeTruthy();
    expect(r?.failureReason).toBe("suppress-bounce");
  });

  it("does NOT bounce a TEMPORARY failure — Mailgun will retry", async () => {
    await post(EVT.soft, "failed", TOKEN.soft, {
      severity: "temporary",
      "delivery-status": { message: "451 4.7.1 try again later", code: 451 },
    });

    const r = await recipient(R_SOFT);
    expect(r?.status).toBe("failed");
    expect(r?.bouncedAt).toBeNull(); // the follow-up filter must still consider it
    expect(r?.failureReason).toBe("451 4.7.1 try again later");
  });

  it("opts the CONTACT out on a spam complaint, not just the row", async () => {
    const before = await withRole("ADMIN", (tx) =>
      tx.contact.findUnique({ where: { id: E_CONTACT } }),
    );
    // null and false both mean "not opted out" — that's how audience.ts reads it —
    // so don't let fixture state masquerade as a behavioural failure.
    expect(before?.emailOptOut ?? false).toBe(false);

    await post(EVT.spam, "complained", TOKEN.spam);

    const r = await recipient(R_SPAM);
    expect(r?.status).toBe("complained");
    const after = await withRole("ADMIN", (tx) =>
      tx.contact.findUnique({ where: { id: E_CONTACT } }),
    );
    // This is the flag audience.ts checks, so the next campaign now skips them.
    expect(after?.emailOptOut).toBe(true);
  });
});
