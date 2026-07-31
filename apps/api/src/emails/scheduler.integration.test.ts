import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { withRole } from "../permissions/rls.js";
import { createDueFollowUps, parseFeedItems, runDueSends } from "./scheduler.js";

/**
 * Scheduler exit proof:
 *   - an "at" send fires once its time arrives, and not a moment before;
 *   - a cancelled send is never dispatched even after its time passes;
 *   - batch mode sends `quantity` per window and stops on days it may not send;
 *   - the claim lease makes two concurrent ticks safe (no double send);
 *   - follow-ups go to non-openers only, once, and never to bounced addresses.
 *
 * Drives runDueSends(now) with an explicit clock rather than waiting on
 * wall-time. Needs the local DB with both email migrations + policies + seed.
 */
const app = createApp();

const COMPANY = "itest_sched_company";
const CONTACTS = ["itest_sched_c1", "itest_sched_c2", "itest_sched_c3", "itest_sched_c4"];

vi.mock("../integrations/mailgun.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../integrations/mailgun.js")>();
  return {
    ...actual,
    mailgunSendConfigured: () => true,
    sendMailgunMessage: async () => ({
      providerMessageId: `<sched-${Math.random().toString(36).slice(2)}@mg>`,
      message: "Queued. Thank you.",
    }),
  };
});

const MINUTE = 60_000;
const DAY = 86_400_000;

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.company.upsert({
      where: { id: COMPANY },
      create: { id: COMPANY, name: "Itest Scheduler Dealer" },
      update: {},
    });
    for (const [i, id] of CONTACTS.entries()) {
      await tx.contact.upsert({
        where: { id },
        create: {
          id,
          companyId: COMPANY,
          recordType: "Broker",
          email: `itest.sched${i}@example.com`,
        },
        update: { email: `itest.sched${i}@example.com`, emailOptOut: null },
      });
    }
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.emailRecipient.deleteMany({ where: { email: { startsWith: "itest.sched" } } });
    await tx.emailSend.deleteMany({ where: { subject: { startsWith: "[sched]" } } });
    await tx.contact.deleteMany({ where: { id: { startsWith: "itest_sched_c" } } });
    await tx.company.deleteMany({ where: { id: COMPANY } });
  });
});

async function schedule(body: Record<string, unknown>): Promise<string> {
  const res = await request(app)
    .post("/emails/send")
    .set("x-crm-role", "MARKETING")
    .send({ kind: "marketing", html: "<p>x</p>", contactIds: CONTACTS, ...body });
  expect(res.status).toBe(201);
  return res.body.data.sendId as string;
}

const statusOf = (id: string) =>
  withRole("ADMIN", async (tx) => {
    const s = await tx.emailSend.findUnique({ where: { id } });
    const sent = await tx.emailRecipient.count({ where: { sendId: id, status: "sent" } });
    const queued = await tx.emailRecipient.count({ where: { sendId: id, status: "queued" } });
    return { status: s!.status, nextRunAt: s!.nextRunAt, sent, queued };
  });

describe('"at" mode', () => {
  it("does not fire early, fires when due, and marks the send sent", async () => {
    const startAt = new Date(Date.now() + 2 * DAY);
    const id = await schedule({ subject: "[sched] at-mode", schedule: { mode: "at", startAt } });

    await runDueSends(new Date(startAt.getTime() - MINUTE));
    let s = await statusOf(id);
    expect(s.status).toBe("scheduled");
    expect(s.sent).toBe(0);

    await runDueSends(new Date(startAt.getTime() + MINUTE));
    s = await statusOf(id);
    expect(s.status).toBe("sent");
    expect(s.sent).toBe(CONTACTS.length);
    expect(s.queued).toBe(0);
  });

  it("never dispatches a cancelled send", async () => {
    const startAt = new Date(Date.now() + DAY);
    const id = await schedule({ subject: "[sched] cancelled", schedule: { mode: "at", startAt } });
    await request(app)
      .post(`/emails/sends/${id}/cancel`)
      .set("x-crm-role", "MARKETING")
      .expect(200);

    await runDueSends(new Date(startAt.getTime() + MINUTE));
    const s = await statusOf(id);
    expect(s.status).toBe("cancelled");
    expect(s.sent).toBe(0);
  });
});

describe("batch mode", () => {
  it("sends one quantity per window and leaves the rest queued", async () => {
    const startAt = new Date(Date.now() - MINUTE);
    const id = await schedule({
      subject: "[sched] batch",
      schedule: {
        mode: "batch",
        startAt,
        timezone: "UTC",
        batch: { quantity: 2, repeatAfter: 1, repeatUnit: "hours", sendOnDays: [0, 1, 2, 3, 4, 5, 6] },
      },
    });

    await runDueSends(new Date());
    let s = await statusOf(id);
    expect(s.sent).toBe(2);
    expect(s.queued).toBe(2);
    expect(s.status).toBe("sending");
    expect(s.nextRunAt).toBeTruthy();

    // Second window clears the remainder.
    await runDueSends(new Date(Date.now() + 61 * MINUTE));
    s = await statusOf(id);
    expect(s.sent).toBe(4);
    expect(s.queued).toBe(0);
    expect(s.status).toBe("sent");
  });

  it("skips a day it is not allowed to send on", async () => {
    // Allow only the weekday *after* the one we tick on.
    const now = new Date();
    const todayUtc = now.getUTCDay();
    const id = await schedule({
      subject: "[sched] batch-wrong-day",
      schedule: {
        mode: "batch",
        startAt: new Date(now.getTime() - MINUTE),
        timezone: "UTC",
        batch: { quantity: 2, repeatAfter: 1, repeatUnit: "days", sendOnDays: [(todayUtc + 1) % 7] },
      },
    });

    await runDueSends(now);
    const s = await statusOf(id);
    expect(s.sent).toBe(0);
    expect(s.queued).toBe(CONTACTS.length);
    expect(s.nextRunAt).toBeTruthy(); // rescheduled, not abandoned
  });
});

describe("concurrency", () => {
  it("two simultaneous ticks do not double-send", async () => {
    const startAt = new Date(Date.now() - MINUTE);
    const id = await schedule({ subject: "[sched] race", schedule: { mode: "at", startAt } });

    await Promise.all([runDueSends(new Date()), runDueSends(new Date())]);

    const s = await statusOf(id);
    expect(s.sent).toBe(CONTACTS.length); // exactly once each, not twice
    const total = await withRole("ADMIN", (tx) =>
      tx.emailRecipient.count({ where: { sendId: id } }),
    );
    expect(total).toBe(CONTACTS.length);
  });
});

describe("follow-up to non-openers", () => {
  it("chases only unopened, non-bounced recipients, exactly once", async () => {
    const id = await schedule({
      subject: "[sched] followup parent",
      followUp: { enabled: true, delayDays: 3, subject: "[sched] followup chase" },
    });

    // One opened, one bounced, two untouched.
    await withRole("ADMIN", async (tx) => {
      const rows = await tx.emailRecipient.findMany({
        where: { sendId: id },
        orderBy: { createdAt: "asc" },
      });
      await tx.emailRecipient.update({
        where: { id: rows[0]!.id },
        data: { status: "opened", openedAt: new Date() },
      });
      await tx.emailRecipient.update({
        where: { id: rows[1]!.id },
        data: { status: "bounced", bouncedAt: new Date() },
      });
      // Backdate the send so the follow-up is due.
      await tx.emailSend.update({
        where: { id },
        data: { sentAt: new Date(Date.now() - 4 * DAY) },
      });
    });

    const created = await createDueFollowUps(new Date());
    expect(created).toBe(1);

    const child = await withRole("ADMIN", async (tx) => {
      const c = await tx.emailSend.findFirst({ where: { parentSendId: id } });
      const recips = await tx.emailRecipient.findMany({ where: { sendId: c!.id } });
      return { subject: c!.subject, count: recips.length, sent: recips.filter((r) => r.status === "sent").length };
    });
    expect(child.subject).toBe("[sched] followup chase");
    expect(child.count).toBe(2); // not the opener, not the bounce
    expect(child.sent).toBe(2);

    // Running again must not create a second chase.
    expect(await createDueFollowUps(new Date())).toBe(0);
  });
});

describe("feed parsing", () => {
  it("extracts RSS items with a stable id", () => {
    const items = parseFeedItems(`<rss><channel>
      <item><guid>g1</guid><title><![CDATA[New Azimut listed]]></title><link>https://y.com/a</link></item>
      <item><guid>g2</guid><title>Price drop</title><link>https://y.com/b</link></item>
    </channel></rss>`);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: "g1", title: "New Azimut listed", link: "https://y.com/a" });
  });

  it("handles Atom entries with href links", () => {
    const items = parseFeedItems(
      `<feed><entry><id>t1</id><title>Hello</title><link rel="alternate" href="https://y.com/x"/></entry></feed>`,
    );
    expect(items[0]).toMatchObject({ id: "t1", link: "https://y.com/x" });
  });
});
