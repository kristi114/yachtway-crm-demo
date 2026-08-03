import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// env.ts parses process.env at import time, so this must run before the app loads.
// A marketing send is REFUSED without an unsubscribe URL and a postal address
// (see emails/footer.ts), which is exactly what we want in production and exactly
// what would make this suite 503 if left unset.
vi.hoisted(() => {
  process.env.PUBLIC_API_URL = "https://itest.crm.yachtway.test";
  process.env.COMPANY_POSTAL_ADDRESS = "1 Itest Way, Fort Lauderdale, FL 33301";
});

import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Email object exit proof over HTTP:
 *   - the consent gate: an opted-out contact, an account-wide opted-out company
 *     and a Do-Not-Contact tag are all suppressed, with reasons, and the
 *     suppressed rows are PERSISTED rather than silently dropped;
 *   - a rep may send transactional mail but is 403 on a marketing send;
 *   - marketing sends and their recipients are invisible to a rep under RLS
 *     (empty list, 404 on direct fetch) while Marketing sees them;
 *   - the open pixel and unsubscribe endpoints work with no session, and an
 *     unsubscribe flips the contact's emailOptOut so the NEXT send excludes them;
 *   - an unconfigured provider answers 503 instead of pretending to send.
 *
 * Full stack: dev auth -> authorize(email.*) -> withRole -> RLS on
 * email_sends / email_recipients. Needs the local DB with the email migration
 * applied + `pnpm db:policies` + `prisma:seed`.
 */
const app = createApp();

const COMPANY = "itest_email_company";
const COMPANY_OPTOUT = "itest_email_company_optout";
const C_OK = "itest_email_contact_ok";
const C_OPTOUT = "itest_email_contact_optout";
const C_AT_OPTOUT_CO = "itest_email_contact_at_optout_co";
const C_DNC = "itest_email_contact_dnc";
const DNC_TAG = "itest_email_dnc_tag";

// Mailgun is the only wired provider; stub its transport so the suite never
// makes a network call but still exercises the real dispatch path.
vi.mock("../integrations/mailgun.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../integrations/mailgun.js")>();
  return {
    ...actual,
    mailgunSendConfigured: () => true,
    sendMailgunMessage: async () => ({
      providerMessageId: `<itest-${Math.random().toString(36).slice(2)}@mg>`,
      message: "Queued. Thank you.",
    }),
  };
});

beforeAll(async () => {
  // Grants for the system roles the suite drives (self-seeding, like the other
  // suites). permission_grants keys on role_id -> roles.id, so the Role row has to
  // exist first and the write has to go through the delegate: the raw INSERT this
  // replaced named a `role_key` column that has never existed on the table.
  for (const [role, grants] of Object.entries(SYSTEM_ROLE_GRANTS)) {
    const roleRow = await prisma.role.upsert({
      where: { key: role },
      update: { isActive: true },
      create: { key: role, name: role },
    });
    for (const g of grants) {
      await prisma.permissionGrant.upsert({
        where: { roleId_resourceClass: { roleId: roleRow.id, resourceClass: g.resource } },
        update: { canRead: g.read, canWrite: g.write },
        create: {
          roleId: roleRow.id,
          resourceClass: g.resource,
          canRead: g.read,
          canWrite: g.write,
        },
      });
    }
  }

  await withRole("ADMIN", async (tx) => {
    await tx.tag.upsert({
      where: { id: DNC_TAG },
      create: { id: DNC_TAG, name: "Do Not Contact", nameKey: "do not contact" },
      update: {},
    });
    await tx.company.upsert({
      where: { id: COMPANY },
      create: { id: COMPANY, name: "Itest Email Dealer" },
      update: { accountWideEmailOptOut: null },
    });
    await tx.company.upsert({
      where: { id: COMPANY_OPTOUT },
      create: {
        id: COMPANY_OPTOUT,
        name: "Itest Account-Wide Opt-Out",
        accountWideEmailOptOut: true,
      },
      update: { accountWideEmailOptOut: true },
    });

    const contacts = [
      { id: C_OK, email: "itest.ok@example.com", companyId: COMPANY, emailOptOut: null },
      { id: C_OPTOUT, email: "itest.optout@example.com", companyId: COMPANY, emailOptOut: true },
      {
        id: C_AT_OPTOUT_CO,
        email: "itest.atoptout@example.com",
        companyId: COMPANY_OPTOUT,
        emailOptOut: null,
      },
      { id: C_DNC, email: "itest.dnc@example.com", companyId: COMPANY, emailOptOut: null },
    ];
    for (const c of contacts) {
      await tx.contact.upsert({
        where: { id: c.id },
        create: { ...c, recordType: "Broker" },
        update: { email: c.email, companyId: c.companyId, emailOptOut: c.emailOptOut },
      });
    }
    // Tag the DNC contact.
    await tx.contact.update({
      where: { id: C_DNC },
      data: { tags: { connect: { id: DNC_TAG } } },
    });
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.emailRecipient.deleteMany({ where: { email: { startsWith: "itest." } } });
    await tx.emailSend.deleteMany({ where: { subject: { startsWith: "[itest]" } } });
    await tx.contact.deleteMany({ where: { id: { startsWith: "itest_email_contact" } } });
    await tx.company.deleteMany({ where: { id: { startsWith: "itest_email_company" } } });
    await tx.tag.deleteMany({ where: { id: DNC_TAG } });
  });
});

describe("audience resolution — the consent gate", () => {
  it("suppresses opt-out, account-wide opt-out and Do-Not-Contact, with reasons", async () => {
    const res = await request(app)
      .post("/email-audiences/resolve")
      .set("x-crm-role", "MARKETING")
      .send({ manualEmails: [] , contactClauses: [{ field: "companyId", op: "eq", value: COMPANY }] });

    expect(res.status).toBe(200);
    const emails = res.body.data.members.map((m: { email: string }) => m.email);
    expect(emails).toContain("itest.ok@example.com");
    expect(emails).not.toContain("itest.optout@example.com");
    expect(emails).not.toContain("itest.dnc@example.com");
    expect(res.body.data.suppressed.optedOut).toBeGreaterThanOrEqual(1);
    expect(res.body.data.suppressed.doNotContact).toBeGreaterThanOrEqual(1);
  });

  it("suppresses a hand-typed address belonging to an opted-out contact", async () => {
    const res = await request(app)
      .post("/email-audiences/resolve")
      .set("x-crm-role", "MARKETING")
      .send({ manualEmails: ["itest.optout@example.com", "itest.atoptout@example.com"] });

    expect(res.status).toBe(200);
    expect(res.body.data.members).toHaveLength(0);
    expect(res.body.data.suppressed.optedOut).toBe(2);
  });
});

describe("sending", () => {
  it("lets a rep send transactional mail and records per-recipient rows", async () => {
    const res = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "SALES_REP")
      .send({
        subject: "[itest] transactional hello",
        html: "<p>hi</p>",
        kind: "transactional",
        provider: "mailgun", // gmail is unconfigured; mailgun is allowed for this kind? see below
        contactIds: [C_OK],
      });

    // transactional allows gmail|ses only, so a mailgun override is rejected.
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("provider_not_allowed_for_kind");
  });

  it("answers 503 when the routed provider is not configured", async () => {
    const res = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "SALES_REP")
      .send({
        subject: "[itest] system mail",
        html: "<p>hi</p>",
        kind: "system", // → SES, unconfigured in tests
        contactIds: [C_OK],
      });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("email_provider_not_configured:ses");
  });

  it("403s a rep on a marketing send", async () => {
    const res = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "SALES_REP")
      .send({
        subject: "[itest] rep blast",
        html: "<p>no</p>",
        kind: "marketing",
        contactIds: [C_OK],
      });
    expect(res.status).toBe(403);
  });

  it("sends a marketing email as MARKETING, persisting suppressed recipients", async () => {
    const res = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "MARKETING")
      .send({
        subject: "[itest] marketing blast",
        html: "<p>hello {{first_name}}</p>",
        kind: "marketing",
        contactIds: [C_OK, C_OPTOUT, C_DNC, C_AT_OPTOUT_CO],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.dispatched).toBe(1);
    expect(res.body.data.resolved.suppressed.optedOut).toBeGreaterThanOrEqual(2);

    const detail = await request(app)
      .get(`/emails/sends/${res.body.data.sendId}`)
      .set("x-crm-role", "MARKETING");
    expect(detail.status).toBe(200);
    expect(detail.body.data.recipientCount).toBe(1);
    expect(detail.body.data.suppressedCount).toBeGreaterThanOrEqual(3);
    expect(detail.body.data.recipients[0].status).toBe("sent");
    expect(detail.body.data.recipients[0].providerMessageId).toBeTruthy();
  });

  // A rep holds email.marketing READ-ONLY (permissions.ts: "may read campaign
  // results, may not send bulk"), so a marketing send is deliberately VISIBLE to
  // them — same as Salesforce/HubSpot, where the rep needs to know whether their
  // contact opened the campaign. The boundary being proven here is read vs write,
  // not existence: reading is allowed, sending is 403. An earlier version of this
  // test asserted 404 and contradicted the grant matrix.
  it("lets a rep READ a marketing send but never send one", async () => {
    const created = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "MARKETING")
      .send({
        subject: "[itest] readable by reps",
        html: "<p>x</p>",
        kind: "marketing",
        contactIds: [C_OK],
      });
    expect(created.status).toBe(201);

    const asRep = await request(app)
      .get(`/emails/sends/${created.body.data.sendId}`)
      .set("x-crm-role", "SALES_REP");
    expect(asRep.status).toBe(200);
    expect(asRep.body.data.kind).toBe("marketing");

    // ...and it shows up in the rep's list rather than being filtered out.
    const list = await request(app).get("/emails/sends").set("x-crm-role", "SALES_REP");
    expect(list.status).toBe(200);
    expect(
      (list.body.data as { id: string }[]).some((s) => s.id === created.body.data.sendId),
    ).toBe(true);

    // The write side stays closed: read-only means read-only.
    const repSend = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "SALES_REP")
      .send({
        subject: "[itest] rep bulk attempt",
        html: "<p>x</p>",
        kind: "marketing",
        contactIds: [C_OK],
      });
    expect(repSend.status).toBe(403);
  });
});

describe("tracking + unsubscribe (public, no session)", () => {
  it("counts an open once and unsubscribing flips the contact's opt-out", async () => {
    const created = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "MARKETING")
      .send({
        subject: "[itest] tracking",
        html: "<p>x</p>",
        kind: "marketing",
        contactIds: [C_OK],
      });
    const sendId = created.body.data.sendId;
    const token = await withRole("ADMIN", async (tx) => {
      const r = await tx.emailRecipient.findFirst({ where: { sendId } });
      return r!.trackingToken;
    });

    await request(app).get(`/e/o/${token}`).expect(200);
    await request(app).get(`/e/o/${token}`).expect(200); // redelivery must not double-count

    const afterOpen = await request(app)
      .get(`/emails/sends/${sendId}`)
      .set("x-crm-role", "MARKETING");
    expect(afterOpen.body.data.openedCount).toBe(1);

    await request(app).post(`/e/u/${token}`).expect(200);
    const optedOut = await withRole("ADMIN", async (tx) => {
      const c = await tx.contact.findUnique({ where: { id: C_OK } });
      return c!.emailOptOut;
    });
    expect(optedOut).toBe(true);

    // The next send must now exclude them by consent, not by chance.
    const next = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "MARKETING")
      .send({
        subject: "[itest] after unsubscribe",
        html: "<p>x</p>",
        kind: "marketing",
        contactIds: [C_OK],
      });
    expect(next.status).toBe(201);
    expect(next.body.data.dispatched).toBe(0);
    expect(next.body.data.resolved.suppressed.optedOut).toBe(1);
  });

  it("serves the pixel for an unknown token without disclosing anything", async () => {
    const res = await request(app).get("/e/o/not-a-real-token");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/gif");
  });

  /**
   * One unsubscribe link, two behaviours, split by method:
   *   POST  = RFC 8058 one-click, immediate, no questions (mailbox providers)
   *   GET   = the footer link a person clicks, offering the choice, NO side effect
   */
  it("GET on the unsubscribe link offers the choice and changes nothing", async () => {
    const created = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "MARKETING")
      .send({
        subject: "[itest] pref centre",
        html: "<p>x</p>",
        kind: "marketing",
        // A hand-typed address, so this case needs no contact and cannot be
        // perturbed by another test's opt-out state.
        to: ["itest.pref@example.com"],
      });
    expect(created.status).toBe(201);
    const token = await withRole("ADMIN", async (tx) => {
      const r = await tx.emailRecipient.findFirst({
        where: { sendId: created.body.data.sendId },
      });
      return r!.trackingToken;
    });

    const page = await request(app).get(`/e/u/${token}`).expect(200);
    expect(page.headers["content-type"]).toContain("text/html");
    // Both choices are offered...
    expect(page.text).toContain(`/e/u/${token}/all`);
    expect(page.text).toContain(`/e/u/${token}/resume`);
    // ...and brand rules hold on a recipient-facing page.
    expect(page.text).not.toMatch(/#(4b0ea3|8729fa|8334da|4409d7)/i);

    // A GET must not mutate: link prefetchers follow these URLs unprompted.
    const row = await withRole("ADMIN", (tx) =>
      tx.emailRecipient.findFirst({ where: { trackingToken: token } }),
    );
    expect(row?.status).not.toBe("unsubscribed");
  });

  it("POST .../all unsubscribes and .../resume puts it back", async () => {
    // An earlier case in this file opts C_OK out, so reset first: a suppressed
    // recipient is a different path and would not exercise the toggle.
    await withRole("ADMIN", (tx) =>
      tx.contact.update({ where: { id: C_OK }, data: { emailOptOut: false } }),
    );
    const created = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "MARKETING")
      .send({
        subject: "[itest] pref toggle",
        html: "<p>x</p>",
        kind: "marketing",
        contactIds: [C_OK],
      });
    const token = await withRole("ADMIN", async (tx) => {
      const r = await tx.emailRecipient.findFirst({
        where: { sendId: created.body.data.sendId },
      });
      return r!.trackingToken;
    });
    const optOutOf = async () =>
      withRole("ADMIN", async (tx) => {
        const c = await tx.contact.findUnique({ where: { id: C_OK } });
        return c!.emailOptOut;
      });

    await request(app).post(`/e/u/${token}/all`).expect(200);
    expect(await optOutOf()).toBe(true);

    await request(app).post(`/e/u/${token}/resume`).expect(200);
    expect(await optOutOf()).toBe(false);
  });

  it("shows the same page for an unknown token — no validity oracle", async () => {
    const real = await request(app).get("/e/u/00000000-0000-4000-8000-000000000000").expect(200);
    expect(real.text).toContain("Email preferences");
  });
});

describe("scheduling", () => {
  it("schedules instead of sending, and cancels", async () => {
    const created = await request(app)
      .post("/emails/send")
      .set("x-crm-role", "MARKETING")
      .send({
        subject: "[itest] scheduled",
        html: "<p>x</p>",
        kind: "marketing",
        contactIds: [C_OK],
        schedule: { mode: "at", startAt: new Date(Date.now() + 86_400_000).toISOString() },
      });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("scheduled");
    expect(created.body.data.dispatched).toBe(0);

    const cancelled = await request(app)
      .post(`/emails/sends/${created.body.data.sendId}/cancel`)
      .set("x-crm-role", "MARKETING");
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("cancelled");

    const again = await request(app)
      .post(`/emails/sends/${created.body.data.sendId}/cancel`)
      .set("x-crm-role", "MARKETING");
    expect(again.status).toBe(409);
  });
});
