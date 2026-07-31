import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { EmailKind, EmailSendCreate, ResolvedAudience } from "@yachtway/shared";
import { dispatch, planTransport } from "../integrations/emailRouter.js";
import { resolveAudience } from "./audience.js";

/**
 * Send pipeline: resolve → persist → dispatch (or schedule).
 *
 * Order matters. Recipients are resolved and PERSISTED first — including the
 * suppressed ones, with their reason — so the send is fully auditable even if
 * the transport then fails. Dispatch happens per recipient and is failure
 * isolated: one bad address marks that row failed and never aborts the batch.
 */

export interface BuildResult {
  sendId: string;
  status: string;
  resolved: ResolvedAudience;
  dispatched: number;
  failed: number;
}

/** A/B split: deterministic per recipient index, so a re-resolve is stable. */
function variantFor(index: number, splitPercentB: number | undefined): "A" | "B" | null {
  if (!splitPercentB) return null;
  return index % 100 < splitPercentB ? "B" : "A";
}

function scheduledForOf(input: EmailSendCreate): Date | null {
  const mode = input.schedule?.mode ?? "now";
  if (mode === "now") return null;
  const startAt = input.schedule?.startAt;
  if (!startAt) return null;
  const d = new Date(startAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Create a send, its recipient rows, and either dispatch immediately or leave it
 * scheduled. Runs inside the caller's role transaction so RLS governs every write.
 */
export async function createSend(
  tx: Prisma.TransactionClient,
  input: EmailSendCreate,
  ctx: { userId: string | null; kind: EmailKind },
): Promise<BuildResult> {
  // 1. Transport first: an unconfigured provider fails before anything persists.
  const transport = planTransport(ctx.kind, input.provider ?? null);

  // 2. Resolve recipients through the consent gate.
  let def = {
    contactClauses: input.audience?.contactClauses ?? [],
    contactTags: input.audience?.contactTags ?? [],
    companyTags: input.audience?.companyTags ?? [],
    manualEmails: input.audience?.manualEmails ?? [],
    contactIds: input.contactIds,
    explicitEmails: input.to,
  };
  let audienceName: string | null = null;
  if (input.audienceId) {
    const saved = await tx.emailAudience.findUnique({ where: { id: input.audienceId } });
    if (!saved) throw new Error("audience_not_found");
    audienceName = saved.name;
    def = {
      contactClauses: (saved.contactClauses as typeof def.contactClauses) ?? [],
      contactTags: saved.contactTags,
      companyTags: saved.companyTags,
      manualEmails: saved.manualEmails,
      contactIds: input.contactIds,
      explicitEmails: input.to,
    };
  }
  const resolved = await resolveAudience(tx, def);

  const template = input.templateId
    ? await tx.emailTemplate.findUnique({ where: { id: input.templateId } })
    : null;

  const scheduledFor = scheduledForOf(input);
  const mode = input.schedule?.mode ?? "now";
  const status = mode === "now" ? "sending" : "scheduled";

  // 3. Persist the send.
  const send = await tx.emailSend.create({
    data: {
      subject: input.subject,
      html: input.html,
      preheader: input.preheader ?? null,
      title: input.title ?? null,
      kind: ctx.kind,
      provider: transport.provider,
      providerOverridden: transport.overridden,
      senderName: input.senderName ?? null,
      senderEmail: input.senderEmail ?? null,
      replyTo: input.replyTo ?? null,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      campaignId: input.campaignId ?? null,
      audienceId: input.audienceId ?? null,
      audienceName,
      status,
      scheduleMode: mode,
      scheduleTimezone: input.schedule?.timezone ?? null,
      scheduleConfig: (input.schedule
        ? {
            batch: input.schedule.batch ?? null,
            rss: input.schedule.rss ?? null,
            smart: input.schedule.smart ?? null,
          }
        : undefined) as Prisma.InputJsonValue | undefined,
      scheduledFor,
      // When the scheduler should first look at this send. "at" waits for its
      // time; batch/rss/smart start as soon as the runner next ticks unless a
      // start time was given.
      nextRunAt: mode === "now" ? null : (scheduledFor ?? new Date()),
      options: (input.options ?? undefined) as Prisma.InputJsonValue | undefined,
      abTest: (input.abTest ?? undefined) as Prisma.InputJsonValue | undefined,
      followUp: (input.followUp ?? undefined) as Prisma.InputJsonValue | undefined,
      attachments: input.attachments,
      recipientCount: resolved.members.length,
      suppressedCount:
        resolved.suppressed.noEmail +
        resolved.suppressed.optedOut +
        resolved.suppressed.doNotContact +
        resolved.suppressed.duplicates,
      createdById: ctx.userId,
    },
  });

  // 4. Persist recipient rows (mailable + a record of the suppressed).
  const splitB = input.abTest?.enabled ? input.abTest.splitPercentB : undefined;
  const rows = resolved.members.map((m, i) => ({
    sendId: send.id,
    contactId: m.contactId ?? null,
    email: m.email,
    name: m.name ?? null,
    variant: variantFor(i, splitB),
    kind: ctx.kind,
    status: "queued",
    trackingToken: randomUUID(),
  }));
  if (rows.length) await tx.emailRecipient.createMany({ data: rows, skipDuplicates: true });

  if (status === "scheduled") {
    return { sendId: send.id, status, resolved, dispatched: 0, failed: 0 };
  }

  // 5. Dispatch immediately (mode "now").
  const out = await dispatchQueued(tx, send.id);
  return { sendId: send.id, status: out.remaining > 0 ? "sending" : "sent", resolved, ...out };
}

export interface DispatchOutcome {
  dispatched: number;
  failed: number;
  /** Recipients still queued after this pass (a batch leaves some behind). */
  remaining: number;
}

/**
 * Dispatch queued recipients of one send, oldest first. Shared by the immediate
 * path and the scheduler, so a batched send and a "send now" go through exactly
 * the same transport code.
 *
 * `limit` caps how many go out in this pass (batch mode). Per-recipient failure
 * isolation: a bad address marks its own row failed and never aborts the run.
 * The send's status is only advanced to sent/failed once nothing is left queued.
 */
export async function dispatchQueued(
  tx: Prisma.TransactionClient,
  sendId: string,
  limit?: number,
): Promise<DispatchOutcome> {
  const send = await tx.emailSend.findUnique({ where: { id: sendId } });
  if (!send) return { dispatched: 0, failed: 0, remaining: 0 };

  const ab = send.abTest as { enabled?: boolean; variantB?: { subject: string; html: string } } | null;
  const queued = await tx.emailRecipient.findMany({
    where: { sendId, status: "queued" },
    orderBy: { createdAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  const from = send.senderEmail ?? "hello@yachtway.com";
  let dispatched = 0;
  let failed = 0;

  for (const r of queued) {
    const variantB = ab?.enabled && r.variant === "B" ? ab.variantB : null;
    try {
      const res = await dispatch(send.provider as Parameters<typeof dispatch>[0], {
        to: r.email,
        toName: r.name,
        from,
        fromName: send.senderName,
        replyTo: send.replyTo,
        subject: variantB?.subject ?? send.subject,
        html: variantB?.html ?? send.html,
        trackingToken: r.trackingToken,
      });
      await tx.emailRecipient.update({
        where: { id: r.id },
        data: { status: "sent", sentAt: new Date(), providerMessageId: res.providerMessageId },
      });
      dispatched += 1;
    } catch (err) {
      await tx.emailRecipient.update({
        where: { id: r.id },
        data: {
          status: "failed",
          failureReason: err instanceof Error ? err.message.slice(0, 500) : "dispatch_failed",
        },
      });
      failed += 1;
    }
  }

  const remaining = await tx.emailRecipient.count({ where: { sendId, status: "queued" } });
  const anySent = await tx.emailRecipient.count({ where: { sendId, status: { not: "failed" } } });

  await tx.emailSend.update({
    where: { id: sendId },
    data:
      remaining > 0
        ? { status: "sending", ...(send.sentAt ? {} : { sentAt: new Date() }) }
        : {
            status: anySent === 0 ? "failed" : "sent",
            sentAt: send.sentAt ?? new Date(),
            ...(anySent === 0 ? { syncError: "all_recipients_failed" } : {}),
          },
  });

  return { dispatched, failed, remaining };
}

/**
 * Apply a per-recipient engagement event (open / click / bounce / delivery) and
 * roll the parent send's counters. Idempotent: the first event of each type wins,
 * so a provider redelivery doesn't inflate the numbers.
 */
export async function applyRecipientEvent(
  tx: Prisma.TransactionClient,
  recipientId: string,
  event: "delivered" | "opened" | "clicked" | "bounced",
): Promise<boolean> {
  const r = await tx.emailRecipient.findUnique({ where: { id: recipientId } });
  if (!r) return false;

  const stamp = {
    delivered: "deliveredAt",
    opened: "openedAt",
    clicked: "clickedAt",
    bounced: "bouncedAt",
  }[event] as "deliveredAt" | "openedAt" | "clickedAt" | "bouncedAt";
  if (r[stamp]) return false; // already counted

  // A click implies an open; record both so open rates aren't understated.
  const alsoOpen = event === "clicked" && !r.openedAt;
  await tx.emailRecipient.update({
    where: { id: r.id },
    data: {
      [stamp]: new Date(),
      ...(alsoOpen ? { openedAt: new Date() } : {}),
      status: event === "bounced" ? "bounced" : event,
    },
  });

  const counter = {
    delivered: "deliveredCount",
    opened: "openedCount",
    clicked: "clickedCount",
    bounced: "bouncedCount",
  }[event] as "deliveredCount" | "openedCount" | "clickedCount" | "bouncedCount";
  await tx.emailSend.update({
    where: { id: r.sendId },
    data: {
      [counter]: { increment: 1 },
      ...(alsoOpen ? { openedCount: { increment: 1 } } : {}),
    },
  });
  return true;
}
