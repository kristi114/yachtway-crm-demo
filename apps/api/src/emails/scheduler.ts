import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "../env.js";
import { withRole } from "../permissions/rls.js";
import { dispatchQueued } from "./sendService.js";

/**
 * Email scheduler — the runner behind `at`, `batch`, `rss` and `smart` sends,
 * plus automatic follow-ups to non-openers.
 *
 * Design notes worth keeping:
 *
 * • POLLING, not timers. State lives in the database (`next_run_at`), so a
 *   restart or a redeploy loses nothing and a second instance can take over.
 * • CLAIM BEFORE WORK. Each tick claims a send with a conditional UPDATE on
 *   `locked_at`; only the instance whose update affected a row proceeds. That is
 *   what stops two API containers mailing the same batch twice. A lease older
 *   than LOCK_STALE_MS is treated as abandoned so a crashed instance can't wedge
 *   a send forever.
 * • Runs as the INTEGRATION system role, so RLS still governs every write — the
 *   scheduler has no privileged back door.
 * • Failure is isolated per send: one bad send logs and the tick continues.
 */

/** A claim older than this is assumed to belong to a dead process. */
const LOCK_STALE_MS = 10 * 60 * 1000;

/** Cap on sends touched per tick, so one huge backlog can't starve the loop. */
const MAX_SENDS_PER_TICK = 25;

const UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;

type BatchConfig = {
  quantity?: number;
  repeatAfter?: number;
  repeatUnit?: keyof typeof UNIT_MS;
  sendOnDays?: number[];
  startsAt?: string | null;
  endsAt?: string | null;
};
type SmartConfig = { windowHours?: number; earliestHour?: number; latestHour?: number };
type RssConfig = { feedUrl?: string; checkEvery?: "hourly" | "daily" | "weekly"; minItems?: number };
type ScheduleConfig = { batch?: BatchConfig | null; rss?: RssConfig | null; smart?: SmartConfig | null };

export interface TickResult {
  claimed: number;
  dispatched: number;
  failed: number;
  followUpsCreated: number;
  rssSendsCreated: number;
}

/**
 * Weekday (0=Sun) and hour in the send's own timezone. Batch windows and smart
 * sending are configured in local time, so evaluating them in UTC would fire on
 * the wrong day either side of midnight.
 */
function localParts(at: Date, timeZone: string | null): { weekday: number; hour: number } {
  const tz = timeZone || "UTC";
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(at);
  const wdName = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wdName);
  return { weekday: weekday < 0 ? 0 : weekday, hour };
}

/** Next time this send should be looked at, given its batch cadence. */
function nextBatchRun(from: Date, cfg: BatchConfig | null | undefined): Date {
  const every = cfg?.repeatAfter && cfg.repeatAfter > 0 ? cfg.repeatAfter : 1;
  const unit = cfg?.repeatUnit && cfg.repeatUnit in UNIT_MS ? cfg.repeatUnit : "hours";
  return new Date(from.getTime() + every * UNIT_MS[unit]);
}

function rssInterval(cfg: RssConfig | null | undefined): number {
  switch (cfg?.checkEvery) {
    case "weekly":
      return 7 * UNIT_MS.days;
    case "daily":
      return UNIT_MS.days;
    default:
      return UNIT_MS.hours;
  }
}

/**
 * Claim one send for this tick. Returns true only for the instance that won.
 * `updateMany` gives us the affected-row count, which is the whole point — a
 * `findFirst` then `update` would race.
 */
async function claim(tx: Prisma.TransactionClient, sendId: string, now: Date): Promise<boolean> {
  const stale = new Date(now.getTime() - LOCK_STALE_MS);
  const res = await tx.emailSend.updateMany({
    where: {
      id: sendId,
      OR: [{ lockedAt: null }, { lockedAt: { lt: stale } }],
    },
    data: { lockedAt: now },
  });
  return res.count === 1;
}

async function release(
  tx: Prisma.TransactionClient,
  sendId: string,
  nextRunAt: Date | null,
): Promise<void> {
  await tx.emailSend.update({ where: { id: sendId }, data: { lockedAt: null, nextRunAt } });
}

/**
 * Spread a send's queued recipients across its smart window, in local time. Each
 * recipient gets its own due time, so the batch trickles out rather than landing
 * in every inbox at once.
 */
async function planSmartWindow(
  tx: Prisma.TransactionClient,
  sendId: string,
  now: Date,
  cfg: SmartConfig | null | undefined,
  timeZone: string | null,
): Promise<void> {
  const windowHours = cfg?.windowHours && cfg.windowHours > 0 ? cfg.windowHours : 6;
  const earliest = cfg?.earliestHour ?? 9;
  const latest = cfg?.latestHour ?? 17;

  const queued = await tx.emailRecipient.findMany({
    where: { sendId, status: "queued", scheduledFor: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (queued.length === 0) return;

  const spanMs = windowHours * UNIT_MS.hours;
  const step = spanMs / queued.length;
  for (let i = 0; i < queued.length; i++) {
    let due = new Date(now.getTime() + Math.round(step * i));
    // Nudge into the allowed local hours rather than mailing at 3am.
    const { hour } = localParts(due, timeZone);
    if (hour < earliest) due = new Date(due.getTime() + (earliest - hour) * UNIT_MS.hours);
    else if (hour > latest) due = new Date(due.getTime() + (24 - hour + earliest) * UNIT_MS.hours);
    await tx.emailRecipient.update({ where: { id: queued[i]!.id }, data: { scheduledFor: due } });
  }
}

/** Minimal RSS/Atom item extraction — title, link and a stable id per item. */
export function parseFeedItems(
  xml: string,
): { id: string; title: string; link: string }[] {
  const blocks = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ].map((m) => m[0]);

  const pick = (block: string, tag: string): string | null => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    if (!m) return null;
    return m[1]!.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || null;
  };

  return blocks.map((b) => {
    const link =
      pick(b, "link") ?? b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    const title = pick(b, "title") ?? "(untitled)";
    const id = pick(b, "guid") ?? pick(b, "id") ?? (link || title);
    return { id, title, link };
  });
}

/**
 * One scheduler pass. Exported so tests can drive it with an explicit `now`
 * instead of waiting on wall-clock time.
 */
export async function runDueSends(now: Date = new Date()): Promise<TickResult> {
  const result: TickResult = {
    claimed: 0,
    dispatched: 0,
    failed: 0,
    followUpsCreated: 0,
    rssSendsCreated: 0,
  };

  const due: { id: string }[] = await withRole("INTEGRATION", (tx) =>
    tx.emailSend.findMany({
      where: {
        status: { in: ["scheduled", "sending"] },
        OR: [{ nextRunAt: { lte: now } }, { nextRunAt: null, scheduledFor: { lte: now } }],
      },
      orderBy: { scheduledFor: "asc" },
      take: MAX_SENDS_PER_TICK,
      select: { id: true },
    }),
  );

  for (const { id } of due) {
    try {
      const outcome = await withRole("INTEGRATION", async (tx) => {
        if (!(await claim(tx, id, now))) return null;
        const send = await tx.emailSend.findUnique({ where: { id } });
        if (!send || send.status === "cancelled" || send.status === "sent") {
          await release(tx, id, null);
          return null;
        }

        const cfg = (send.scheduleConfig ?? {}) as ScheduleConfig;

        // --- RSS: a recurring feed check that spawns a child send per new item.
        if (send.scheduleMode === "rss") {
          const created = await runRssCheck(tx, send, cfg.rss ?? null, now);
          await release(tx, id, new Date(now.getTime() + rssInterval(cfg.rss)));
          return { dispatched: 0, failed: 0, rss: created, followUps: 0 };
        }

        // --- Smart: give each recipient its own due time, then send only those due.
        if (send.scheduleMode === "smart") {
          await planSmartWindow(tx, id, now, cfg.smart ?? null, send.scheduleTimezone);
          const dueNow = await tx.emailRecipient.count({
            where: { sendId: id, status: "queued", scheduledFor: { lte: now } },
          });
          const out = dueNow > 0
            ? await dispatchQueuedDue(tx, id, now)
            : { dispatched: 0, failed: 0, remaining: 1 };
          await release(tx, id, out.remaining > 0 ? new Date(now.getTime() + 15 * 60_000) : null);
          return { ...out, rss: 0, followUps: 0 };
        }

        // --- Batch: a slice per window, only on the allowed local weekdays.
        if (send.scheduleMode === "batch") {
          const b = cfg.batch ?? null;
          const { weekday } = localParts(now, send.scheduleTimezone);
          const allowedDays = b?.sendOnDays?.length ? b.sendOnDays : [0, 1, 2, 3, 4, 5, 6];
          const ended = b?.endsAt ? new Date(b.endsAt).getTime() < now.getTime() : false;

          if (ended) {
            // Window closed with recipients left over: stop, and say so.
            await tx.emailSend.update({
              where: { id },
              data: { status: "sent", syncError: "batch_window_ended_with_recipients_queued" },
            });
            await release(tx, id, null);
            return { dispatched: 0, failed: 0, rss: 0, followUps: 0 };
          }
          if (!allowedDays.includes(weekday)) {
            await release(tx, id, nextBatchRun(now, b));
            return { dispatched: 0, failed: 0, rss: 0, followUps: 0 };
          }

          const quantity = b?.quantity && b.quantity > 0 ? b.quantity : 100;
          const out = await dispatchQueued(tx, id, quantity);
          await release(tx, id, out.remaining > 0 ? nextBatchRun(now, b) : null);
          return { ...out, rss: 0, followUps: 0 };
        }

        // --- "at" (and anything else that got scheduled): send the lot.
        const out = await dispatchQueued(tx, id);
        await release(tx, id, out.remaining > 0 ? new Date(now.getTime() + 60_000) : null);
        return { ...out, rss: 0, followUps: 0 };
      });

      if (!outcome) continue;
      result.claimed += 1;
      result.dispatched += outcome.dispatched;
      result.failed += outcome.failed;
      result.rssSendsCreated += outcome.rss;
    } catch (err) {
      console.error(`[email-scheduler] send ${id} failed:`, err);
    }
  }

  result.followUpsCreated = await createDueFollowUps(now);
  return result;
}

/** Smart mode: dispatch only the recipients whose own due time has arrived. */
async function dispatchQueuedDue(
  tx: Prisma.TransactionClient,
  sendId: string,
  now: Date,
): Promise<{ dispatched: number; failed: number; remaining: number }> {
  // Park the not-yet-due rows out of dispatchQueued's reach by counting them
  // separately: it takes the oldest queued rows, so we cap the pass at the
  // number actually due.
  const dueCount = await tx.emailRecipient.count({
    where: { sendId, status: "queued", scheduledFor: { lte: now } },
  });
  const out = await dispatchQueued(tx, sendId, dueCount);
  return out;
}

/**
 * RSS mode: fetch the feed, and if there are enough genuinely new items, create a
 * child send carrying them. The parent stays scheduled as the recurring watcher.
 */
async function runRssCheck(
  tx: Prisma.TransactionClient,
  send: { id: string; html: string; subject: string; kind: string; provider: string; lastRssItemId: string | null },
  cfg: RssConfig | null,
  now: Date,
): Promise<number> {
  if (!cfg?.feedUrl) return 0;
  let xml: string;
  try {
    const res = await fetch(cfg.feedUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return 0;
    xml = await res.text();
  } catch {
    return 0; // a flaky feed must not fail the tick
  }

  const items = parseFeedItems(xml);
  if (items.length === 0) return 0;

  const seenIdx = send.lastRssItemId ? items.findIndex((i) => i.id === send.lastRssItemId) : -1;
  const fresh = seenIdx >= 0 ? items.slice(0, seenIdx) : items;
  const minItems = cfg.minItems && cfg.minItems > 0 ? cfg.minItems : 1;
  if (fresh.length < minItems) {
    await tx.emailSend.update({ where: { id: send.id }, data: { lastCheckedAt: now } });
    return 0;
  }

  const list = fresh
    .map(
      (i) =>
        `<li><a href="${i.link.replace(/"/g, "&quot;")}">${i.title.replace(/</g, "&lt;")}</a></li>`,
    )
    .join("");
  const html = send.html.includes("{{rss_items}}")
    ? send.html.replace(/\{\{rss_items\}\}/g, `<ul>${list}</ul>`)
    : `${send.html}<ul>${list}</ul>`;

  // Child send inherits the audience by copying the parent's recipient list, so
  // a feed blast reaches exactly who the parent resolved (and nobody who has
  // opted out since — those rows were never queued).
  const child = await tx.emailSend.create({
    data: {
      subject: send.subject,
      html,
      kind: send.kind,
      provider: send.provider,
      status: "sending",
      scheduleMode: "now",
      parentSendId: send.id,
    },
  });
  const parents = await tx.emailRecipient.findMany({
    where: { sendId: send.id },
    select: { contactId: true, email: true, name: true, kind: true },
  });
  if (parents.length > 0) {
    await tx.emailRecipient.createMany({
      data: parents.map((p) => ({
        sendId: child.id,
        contactId: p.contactId,
        email: p.email,
        name: p.name,
        kind: p.kind,
        status: "queued",
        trackingToken: randomUUID(),
      })),
      skipDuplicates: true,
    });
    await tx.emailSend.update({
      where: { id: child.id },
      data: { recipientCount: parents.length },
    });
  }
  await dispatchQueued(tx, child.id);
  await tx.emailSend.update({
    where: { id: send.id },
    data: { lastRssItemId: fresh[0]!.id, lastCheckedAt: now },
  });
  return 1;
}

/**
 * Automatic re-send to non-openers. Fires once per send, `delayDays` after it
 * went out, and only to recipients who were mailed and never opened. Bounced and
 * failed rows are excluded — chasing a bounced address is how you get blocked.
 */
export async function createDueFollowUps(now: Date = new Date()): Promise<number> {
  const candidates: { id: string; followUp: unknown; sentAt: Date | null }[] = await withRole(
    "INTEGRATION",
    (tx) =>
      tx.emailSend.findMany({
        // `followUp` is a nullable Json column, so "has a follow-up" can't be
        // expressed as `not: null` — Prisma requires its DbNull/JsonNull
        // sentinels there. Filter on the flag we actually care about instead:
        // this matches the `!cfg?.enabled → continue` guard below exactly, and
        // narrows the query so disabled and unset configs never leave Postgres.
        where: {
          status: "sent",
          followUpSentAt: null,
          followUp: { path: ["enabled"], equals: true },
        },
        take: MAX_SENDS_PER_TICK,
        select: { id: true, followUp: true, sentAt: true },
      }),
  );

  let created = 0;
  for (const c of candidates) {
    const cfg = c.followUp as { enabled?: boolean; delayDays?: number; subject?: string } | null;
    if (!cfg?.enabled || !c.sentAt) continue;
    const dueAt = new Date(c.sentAt.getTime() + (cfg.delayDays ?? 3) * UNIT_MS.days);
    if (dueAt.getTime() > now.getTime()) continue;

    try {
      const made = await withRole("INTEGRATION", async (tx) => {
        // Claim by stamping first: if another instance already did, skip.
        const claimed = await tx.emailSend.updateMany({
          where: { id: c.id, followUpSentAt: null },
          data: { followUpSentAt: now },
        });
        if (claimed.count !== 1) return false;

        const parent = await tx.emailSend.findUnique({ where: { id: c.id } });
        if (!parent) return false;
        const nonOpeners = await tx.emailRecipient.findMany({
          where: { sendId: c.id, status: { in: ["sent", "delivered"] }, openedAt: null },
          select: { contactId: true, email: true, name: true, kind: true },
        });
        if (nonOpeners.length === 0) return false;

        const child = await tx.emailSend.create({
          data: {
            subject: cfg.subject || parent.subject,
            html: parent.html,
            preheader: parent.preheader,
            title: parent.title,
            kind: parent.kind,
            provider: parent.provider,
            senderName: parent.senderName,
            senderEmail: parent.senderEmail,
            replyTo: parent.replyTo,
            templateId: parent.templateId,
            templateName: parent.templateName,
            campaignId: parent.campaignId,
            audienceId: parent.audienceId,
            audienceName: parent.audienceName,
            status: "sending",
            scheduleMode: "now",
            options: parent.options ?? undefined,
            parentSendId: parent.id,
            recipientCount: nonOpeners.length,
            createdById: parent.createdById,
          },
        });
        await tx.emailRecipient.createMany({
          data: nonOpeners.map((r) => ({
            sendId: child.id,
            contactId: r.contactId,
            email: r.email,
            name: r.name,
            kind: r.kind,
            status: "queued",
            trackingToken: randomUUID(),
          })),
          skipDuplicates: true,
        });
        await dispatchQueued(tx, child.id);
        return true;
      });
      if (made) created += 1;
    } catch (err) {
      console.error(`[email-scheduler] follow-up for ${c.id} failed:`, err);
    }
  }
  return created;
}

let timer: NodeJS.Timeout | null = null;

/**
 * Start the polling loop. No-op when EMAIL_SCHEDULER_INTERVAL_SEC is 0 (the
 * default), so tests, CLI runs and the local dev server don't send mail unless
 * explicitly asked to.
 */
export function startEmailScheduler(): void {
  const seconds = env.EMAIL_SCHEDULER_INTERVAL_SEC;
  if (!seconds || seconds <= 0) return;
  if (timer) return;
  console.log(`[email-scheduler] polling every ${seconds}s`);
  timer = setInterval(() => {
    void runDueSends().catch((err) => console.error("[email-scheduler] tick failed:", err));
  }, seconds * 1000);
  timer.unref();
}

export function stopEmailScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
