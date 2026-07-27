import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Configure Crisp env BEFORE the app (env.ts) loads. vi.hoisted runs first.
const H = vi.hoisted(() => {
  process.env.CRISP_WEBHOOK_SECRET = "itest-crisp-secret";
  process.env.CRISP_IDENTIFIER = "itest-id";
  process.env.CRISP_KEY = "itest-key";
  process.env.CRISP_WEBSITE_ID = "itest-website";
  return { secret: "itest-crisp-secret" };
});

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";
import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";

/**
 * Phase 4 — Crisp support chat: a signed inbound webhook creates/append to a
 * thread keyed by the Crisp session, echoes/non-messages are ignored, redelivered
 * events are idempotent, bad signatures are rejected, and an operator reply sends
 * back into the session. Writes run under the INTEGRATION role. Requires the local
 * DB + policies. Excluded from the unit suite.
 */
const app = createApp();

const SESS_IN = "itest_sess_in";
const SESS_OUT = "itest_sess_out";
const OUT_CONV = "itest_crisp_out_conv";
const FP = "itest_fp_1";

function post(payload: Record<string, unknown>, opts: { badSig?: boolean } = {}) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = opts.badSig
    ? "deadbeef"
    : createHmac("sha256", H.secret).update(`${timestamp};${rawBody}`).digest("hex");
  return request(app)
    .post("/webhooks/crisp")
    .set("Content-Type", "application/json")
    .set("X-Crisp-Request-Timestamp", timestamp)
    .set("X-Crisp-Signature", signature)
    .send(rawBody);
}

const inbound = (over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
  website_id: "itest-website",
  event: "message:send",
  data: { session_id: SESS_IN, from: "user", type: "text", content: "I need help", fingerprint: FP, ...data },
  ...over,
});

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
      create: { id: OUT_CONV, channel: "webchat", status: "open", sensitivityClass: "general", externalThreadId: SESS_OUT },
      update: { externalThreadId: SESS_OUT, messageCount: 0 },
    });
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM webhook_events WHERE provider = 'crisp' AND external_id = ${FP}`;
    await tx.$executeRaw`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE external_thread_id IN (${SESS_IN}, ${SESS_OUT}))`;
    await tx.$executeRaw`DELETE FROM conversations WHERE external_thread_id IN (${SESS_IN}, ${SESS_OUT})`;
  });
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

describe("Crisp webhook + send (HTTP)", () => {
  it("rejects a bad signature (406)", async () => {
    await post(inbound(), { badSig: true }).expect(406);
  });

  it("ignores operator echoes and non-message events (200)", async () => {
    const echo = await post(inbound({}, { from: "operator" })).expect(200);
    expect(echo.body.ignored).toBe(true);
    const other = await post({ website_id: "itest-website", event: "session:created", data: { session_id: SESS_IN } }).expect(200);
    expect(other.body.ignored).toBe(true);
  });

  it("creates a thread from a visitor message and logs it inbound", async () => {
    const res = await post(inbound()).expect(200);
    expect(res.body.conversationId).toBeTruthy();

    const convo = await withRole("ADMIN", (tx) =>
      tx.conversation.findFirst({ where: { externalThreadId: SESS_IN, channel: "webchat" } }),
    );
    expect(convo?.messageCount).toBe(1);
    const msgs = await withRole("ADMIN", (tx) => tx.message.findMany({ where: { conversationId: convo!.id } }));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.direction).toBe("inbound");
    expect(msgs[0]!.provider).toBe("crisp");
    expect(msgs[0]!.body).toBe("I need help");
  });

  it("is idempotent — a redelivered fingerprint does not double-log", async () => {
    const res = await post(inbound()).expect(200);
    expect(res.body.duplicate).toBe(true);
    const convo = await withRole("ADMIN", (tx) =>
      tx.conversation.findFirst({ where: { externalThreadId: SESS_IN, channel: "webchat" } }),
    );
    expect(convo?.messageCount).toBe(1);
  });

  it("an operator reply sends back into the Crisp session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { fingerprint: "srv_fp_9" } }),
        text: async () => "",
      })),
    );
    const res = await request(app)
      .post(`/conversations/${OUT_CONV}/messages`)
      .set("x-crm-role", "SALES_REP")
      .set("x-crm-user-id", "itest_user_rep")
      .send({ provider: "crisp", body: "Happy to help!" })
      .expect(201);
    expect(res.body.provider).toBe("crisp");
    expect(res.body.providerMessageId).toBe("srv_fp_9");
    expect(res.body.deliveryStatus).toBe("sent");
  });
});
