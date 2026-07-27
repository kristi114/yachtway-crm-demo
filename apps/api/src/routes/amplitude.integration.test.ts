import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Configure the Amplitude destination BEFORE the app (and env.ts) load.
const HOISTED = vi.hoisted(() => {
  process.env.AMPLITUDE_WEBHOOK_SECRET = "itest-amp-secret";
  process.env.AMPLITUDE_SIGNING_KEY = "itest-amp-signing";
  return { secret: "itest-amp-secret", signingKey: "itest-amp-signing" };
});

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";
import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";

/**
 * Amplitude destination exit proof: a signed Events webhook links to a contact
 * by yachtwayDbId, redelivery is idempotent, a bad secret is rejected, User
 * Properties land on the contact, and a Cohort snapshot materializes membership.
 * Writes run under the INTEGRATION system role via RLS. Requires the local DB
 * with the amplitude migration + policies. Excluded from the unit suite.
 */
const app = createApp();

const DB_ID = "itest_amp_dbid_84213";
const CONTACT_ID = "itest_amp_contact";
const INSERT_ID = "itest_amp_ins_1";
const COHORT_ID = "itest_amp_coh_1";

function sign(rawBody: string) {
  return createHmac("sha256", HOISTED.signingKey).update(rawBody).digest("hex");
}

async function postSigned(path: string, body: unknown) {
  const raw = JSON.stringify(body);
  return request(app)
    .post(path)
    .set("Authorization", `Bearer ${HOISTED.secret}`)
    .set("X-Amplitude-Signature", sign(raw))
    .set("Content-Type", "application/json")
    .send(raw);
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
    await tx.contact.upsert({
      where: { id: CONTACT_ID },
      create: { id: CONTACT_ID, firstName: "Amp", lastName: "Tester", yachtwayDbId: DB_ID },
      update: { yachtwayDbId: DB_ID, lastAmplitudeEvent: null, amplitudeUserProperties: undefined },
    });
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM amplitude_cohort_memberships WHERE amp_user_id = ${DB_ID}`;
    await tx.$executeRaw`DELETE FROM amplitude_cohorts WHERE amplitude_cohort_id = ${COHORT_ID}`;
    await tx.$executeRaw`DELETE FROM amplitude_events WHERE external_id = ${INSERT_ID}`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${CONTACT_ID}`;
  });
  await prisma.$disconnect();
});

describe("Amplitude Events destination", () => {
  const body = {
    events: [
      {
        insert_id: INSERT_ID,
        user_id: DB_ID,
        device_id: "itest_dev",
        event_type: "listing_viewed",
        event_time: 1_720_000_000_000,
        event_properties: { listing_id: "L1" },
      },
    ],
  };

  it("ingests and links a signed event to the contact", async () => {
    const res = await postSigned("/webhooks/amplitude/events", body);
    expect(res.status).toBe(200);
    expect(res.body.ingested).toBe(1);
    expect(res.body.linked).toBe(1);

    const ev = await withRole("INTEGRATION", (tx) =>
      tx.amplitudeEvent.findUnique({ where: { externalId: INSERT_ID } }),
    );
    expect(ev?.contactId).toBe(CONTACT_ID);
  });

  it("is idempotent on redelivery", async () => {
    const res = await postSigned("/webhooks/amplitude/events", body);
    expect(res.status).toBe(200);
    expect(res.body.duplicates).toBe(1);
    expect(res.body.ingested).toBe(0);
  });

  it("rejects a bad secret with 401", async () => {
    const res = await request(app)
      .post("/webhooks/amplitude/events")
      .set("Authorization", "Bearer wrong")
      .send(body);
    expect(res.status).toBe(401);
  });
});

describe("Amplitude User Properties destination", () => {
  it("applies properties to the matched contact", async () => {
    const res = await postSigned("/webhooks/amplitude/user-properties", [
      { user_id: DB_ID, user_properties: { role: "broker", funnelStage: "active" } },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(1);

    const c = await withRole("INTEGRATION", (tx) =>
      tx.contact.findUnique({ where: { id: CONTACT_ID } }),
    );
    expect(c?.amplitudeUserProperties).toMatchObject({ role: "broker", funnelStage: "active" });
  });
});

describe("Amplitude Cohorts destination", () => {
  it("materializes a cohort membership snapshot", async () => {
    const res = await postSigned("/webhooks/amplitude/cohorts", {
      cohort_id: COHORT_ID,
      name: "High-intent buyers",
      member_ids: [DB_ID],
    });
    expect(res.status).toBe(200);
    expect(res.body.members).toBe(1);
    expect(res.body.linked).toBe(1);

    const cohort = await withRole("INTEGRATION", (tx) =>
      tx.amplitudeCohort.findUnique({ where: { amplitudeCohortId: COHORT_ID } }),
    );
    expect(cohort?.memberCount).toBe(1);
  });
});
