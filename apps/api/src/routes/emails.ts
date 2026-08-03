import type { Prisma } from "@prisma/client";
import { Router } from "express";
import {
  AudienceDefSchema,
  can,
  CampaignStepCreateSchema,
  EmailAudienceCreateSchema,
  EmailCampaignCreateSchema,
  EmailCampaignUpdateSchema,
  EmailSendCreateSchema,
  EmailSendListQuerySchema,
  EmailTemplateCreateSchema,
  EmailTemplateUpdateSchema,
} from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize, authorizeAny } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";
import { loadEffectivePermissions } from "../permissions/service.js";
import { resolveAudience } from "../emails/audience.js";
import { EmailComplianceError } from "../emails/footer.js";
import { createSend } from "../emails/sendService.js";
import {
  ProviderNotAllowedError,
  ProviderNotConfiguredError,
} from "../integrations/emailRouter.js";

/**
 * Email object routes.
 *
 * Gating mirrors who does the work: templates, campaigns and audiences are
 * marketing assets (`email.marketing`), while sending is split by class —
 * a marketing send needs email.marketing write, a transactional/system send
 * needs email.general write. Reps hold email.general rw + email.marketing ro, so
 * they can mail a contact and read campaign results but cannot blast a list.
 *
 * RLS backs all of it, so a missing grant yields an empty list or a 404 rather
 * than a leak — reads of a send the role can't see 404 instead of 403 so the
 * existence of marketing activity isn't disclosed.
 */
const router: Router = Router();
router.use(authContext);

const MARKETING = "email.marketing" as const;
const GENERAL = "email.general" as const;

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
router.get("/email-templates", authorize(MARKETING, "read"), async (req, res) => {
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.emailTemplate.findMany({ orderBy: { updatedAt: "desc" } }),
  );
  res.json({ data: rows });
});

router.get("/email-templates/:id", authorize(MARKETING, "read"), async (req, res) => {
  const row = await withRole(req.auth!.role, (tx) =>
    tx.emailTemplate.findUnique({ where: { id: String(req.params.id) } }),
  );
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: row });
});

router.post("/email-templates", authorize(MARKETING, "write"), async (req, res) => {
  const input = EmailTemplateCreateSchema.parse(req.body);
  const row = await withRole(req.auth!.role, (tx) =>
    tx.emailTemplate.create({
      data: {
        name: input.name,
        subject: input.subject,
        preheader: input.preheader ?? null,
        title: input.title ?? null,
        kind: input.kind,
        provider: input.provider ?? null,
        mode: input.mode,
        html: input.html,
        design: (input.design ?? undefined) as Prisma.InputJsonValue | undefined,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      },
    }),
  );
  res.status(201).json({ data: row });
});

router.patch("/email-templates/:id", authorize(MARKETING, "write"), async (req, res) => {
  const input = EmailTemplateUpdateSchema.parse(req.body);
  const row = await withRole(req.auth!.role, async (tx) => {
    const existing = await tx.emailTemplate.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) return null;
    return tx.emailTemplate.update({
      where: { id: String(req.params.id) },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.preheader !== undefined ? { preheader: input.preheader ?? null } : {}),
        ...(input.title !== undefined ? { title: input.title ?? null } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.provider !== undefined ? { provider: input.provider ?? null } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.html !== undefined ? { html: input.html } : {}),
        ...(input.design !== undefined
          ? { design: (input.design ?? undefined) as Prisma.InputJsonValue | undefined }
          : {}),
        updatedById: req.auth!.userId,
      },
    });
  });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: row });
});

// ---------------------------------------------------------------------------
// Campaigns + steps
// ---------------------------------------------------------------------------
router.get("/email-campaigns", authorize(MARKETING, "read"), async (req, res) => {
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.emailCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { steps: { orderBy: { step: "asc" } } },
    }),
  );
  res.json({ data: rows });
});

/** Campaign rollup: series definition + aggregate engagement across its sends. */
router.get("/email-campaigns/:id", authorize(MARKETING, "read"), async (req, res) => {
  const out = await withRole(req.auth!.role, async (tx) => {
    const campaign = await tx.emailCampaign.findUnique({
      where: { id: String(req.params.id) },
      include: { steps: { orderBy: { step: "asc" } } },
    });
    if (!campaign) return null;
    const agg = await tx.emailSend.aggregate({
      where: { campaignId: campaign.id, status: "sent" },
      _count: { _all: true },
      _sum: {
        recipientCount: true,
        deliveredCount: true,
        openedCount: true,
        clickedCount: true,
      },
      _max: { sentAt: true },
    });
    const recipients = agg._sum.recipientCount ?? 0;
    const opened = agg._sum.openedCount ?? 0;
    const clicked = agg._sum.clickedCount ?? 0;
    return {
      campaign: { ...campaign, steps: undefined },
      steps: campaign.steps,
      sends: agg._count._all,
      recipients,
      delivered: agg._sum.deliveredCount ?? 0,
      opened,
      clicked,
      openRate: recipients > 0 ? opened / recipients : 0,
      clickRate: recipients > 0 ? clicked / recipients : 0,
      lastSentAt: agg._max.sentAt,
    };
  });
  if (!out) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: out });
});

router.post("/email-campaigns", authorize(MARKETING, "write"), async (req, res) => {
  const input = EmailCampaignCreateSchema.parse(req.body);
  const row = await withRole(req.auth!.role, (tx) =>
    tx.emailCampaign.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        createdById: req.auth!.userId,
      },
    }),
  );
  res.status(201).json({ data: row });
});

router.patch("/email-campaigns/:id", authorize(MARKETING, "write"), async (req, res) => {
  const input = EmailCampaignUpdateSchema.parse(req.body);
  const row = await withRole(req.auth!.role, async (tx) => {
    const existing = await tx.emailCampaign.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) return null;
    return tx.emailCampaign.update({ where: { id: String(req.params.id) }, data: { ...input } });
  });
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: row });
});

/** Add or move a template within the series. Position is unique per campaign. */
router.post("/email-campaigns/:id/steps", authorize(MARKETING, "write"), async (req, res) => {
  const input = CampaignStepCreateSchema.parse(req.body);
  const out = await withRole(req.auth!.role, async (tx) => {
    const campaign = await tx.emailCampaign.findUnique({ where: { id: String(req.params.id) } });
    if (!campaign) return null;
    return tx.emailCampaignStep.upsert({
      where: { campaignId_step: { campaignId: campaign.id, step: input.step } },
      create: {
        campaignId: campaign.id,
        templateId: input.templateId,
        step: input.step,
        delayDays: input.delayDays,
      },
      update: { templateId: input.templateId, delayDays: input.delayDays },
    });
  });
  if (!out) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(201).json({ data: out });
});

// ---------------------------------------------------------------------------
// Audiences
// ---------------------------------------------------------------------------
router.get("/email-audiences", authorize(MARKETING, "read"), async (req, res) => {
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.emailAudience.findMany({ orderBy: { createdAt: "desc" } }),
  );
  res.json({ data: rows });
});

router.post("/email-audiences", authorize(MARKETING, "write"), async (req, res) => {
  const input = EmailAudienceCreateSchema.parse(req.body);
  const row = await withRole(req.auth!.role, (tx) =>
    tx.emailAudience.create({
      data: {
        name: input.name,
        contactClauses: input.contactClauses as unknown as Prisma.InputJsonValue,
        contactTags: input.contactTags,
        companyTags: input.companyTags,
        manualEmails: input.manualEmails,
        createdById: req.auth!.userId,
      },
    }),
  );
  res.status(201).json({ data: row });
});

/**
 * Dry-run an audience: who would receive it, and who is dropped and why. The UI
 * shows these counts before a send, so nobody discovers a suppression after the
 * fact.
 */
router.post("/email-audiences/resolve", authorize(MARKETING, "read"), async (req, res) => {
  const def = AudienceDefSchema.parse(req.body ?? {});
  const out = await withRole(req.auth!.role, (tx) => resolveAudience(tx, def));
  res.json({ data: out });
});

router.post("/email-audiences/:id/resolve", authorize(MARKETING, "read"), async (req, res) => {
  const out = await withRole(req.auth!.role, async (tx) => {
    const saved = await tx.emailAudience.findUnique({ where: { id: String(req.params.id) } });
    if (!saved) return null;
    return resolveAudience(tx, {
      contactClauses: (saved.contactClauses as never) ?? [],
      contactTags: saved.contactTags,
      companyTags: saved.companyTags,
      manualEmails: saved.manualEmails,
    });
  });
  if (!out) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: out });
});

// ---------------------------------------------------------------------------
// Sends
// ---------------------------------------------------------------------------
router.get(
  "/emails/sends",
  authorizeAny([GENERAL, MARKETING], "read"),
  async (req, res) => {
    const q = EmailSendListQuerySchema.parse(req.query);
    const rows = await withRole(req.auth!.role, (tx) =>
      tx.emailSend.findMany({
        where: {
          ...(q.status ? { status: q.status } : {}),
          ...(q.kind ? { kind: q.kind } : {}),
          ...(q.campaignId ? { campaignId: q.campaignId } : {}),
          ...(q.templateId ? { templateId: q.templateId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: q.limit,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      }),
    );
    res.json({ data: rows, nextCursor: rows.length === q.limit ? rows.at(-1)?.id : null });
  },
);

router.get(
  "/emails/sends/:id",
  authorizeAny([GENERAL, MARKETING], "read"),
  async (req, res) => {
    const out = await withRole(req.auth!.role, async (tx) => {
      const send = await tx.emailSend.findUnique({
        where: { id: String(req.params.id) },
        include: { recipients: { orderBy: { createdAt: "asc" } } },
      });
      if (!send) return null;
      const ab = send.abTest as { enabled?: boolean; variantB?: { subject?: string } } | null;
      const labels: ("A" | "B")[] = ab?.enabled ? ["A", "B"] : [];
      const variantStats = labels.map((label) => {
        const rows = send.recipients.filter((r) => r.variant === label);
        return {
          label,
          subject: label === "B" ? (ab?.variantB?.subject ?? send.subject) : send.subject,
          recipients: rows.length,
          delivered: rows.filter((r) => r.deliveredAt).length,
          opened: rows.filter((r) => r.openedAt).length,
          clicked: rows.filter((r) => r.clickedAt).length,
        };
      });
      return { ...send, variantStats };
    });
    if (!out) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ data: out });
  },
);

/**
 * Send or schedule. The class decides the transport and the permission: a
 * marketing send requires email.marketing write, so a rep gets 403 here rather
 * than silently mailing a list.
 */
router.post("/emails/send", authorizeAny([GENERAL, MARKETING], "write"), async (req, res) => {
  const input = EmailSendCreateSchema.parse(req.body);
  const required = input.kind === "marketing" ? MARKETING : GENERAL;
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  if (!can(perms, required, "write")) {
    res.status(403).json({ error: `forbidden: ${req.auth!.role} lacks write on ${required}` });
    return;
  }

  try {
    const out = await withRole(req.auth!.role, (tx) =>
      createSend(tx, input, { userId: req.auth!.userId, kind: input.kind }),
    );
    res.status(201).json({ data: out });
  } catch (err) {
    // Same shape as an unconfigured provider: the deployment is missing config, so
    // 503 rather than 400. Message is email_compliance_not_configured:<VAR>.
    if (err instanceof EmailComplianceError) {
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof ProviderNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof ProviderNotAllowedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error && err.message === "audience_not_found") {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
});

/** Cancel a scheduled send before it goes out. A sent send cannot be cancelled. */
router.post(
  "/emails/sends/:id/cancel",
  authorizeAny([GENERAL, MARKETING], "write"),
  async (req, res) => {
    const out = await withRole(req.auth!.role, async (tx) => {
      const send = await tx.emailSend.findUnique({ where: { id: String(req.params.id) } });
      if (!send) return { notFound: true as const };
      if (send.status !== "scheduled") return { conflict: send.status };
      const updated = await tx.emailSend.update({
        where: { id: send.id },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
      await tx.emailRecipient.updateMany({
        where: { sendId: send.id, status: "queued" },
        data: { status: "failed", failureReason: "send_cancelled" },
      });
      return { data: updated };
    });
    if ("notFound" in out) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if ("conflict" in out) {
      res.status(409).json({ error: `not_scheduled:${out.conflict}` });
      return;
    }
    res.json({ data: out.data });
  },
);

// ---------------------------------------------------------------------------
// Record rollups — the Emails tab on a contact and on a company
// ---------------------------------------------------------------------------
router.get(
  "/contacts/:id/emails",
  authorizeAny([GENERAL, MARKETING], "read"),
  async (req, res) => {
    const rows = await withRole(req.auth!.role, (tx) =>
      tx.emailRecipient.findMany({
        where: { contactId: String(req.params.id) },
        orderBy: { createdAt: "desc" },
        include: { send: true },
      }),
    );
    res.json({ data: rows });
  },
);

router.get(
  "/companies/:id/emails",
  authorizeAny([GENERAL, MARKETING], "read"),
  async (req, res) => {
    const rows = await withRole(req.auth!.role, async (tx) => {
      const contacts = await tx.contact.findMany({
        where: { companyId: String(req.params.id) },
        select: { id: true },
      });
      if (contacts.length === 0) return [];
      return tx.emailRecipient.findMany({
        where: { contactId: { in: contacts.map((c) => c.id) } },
        orderBy: { createdAt: "desc" },
        include: { send: true },
      });
    });
    res.json({ data: rows });
  },
);

export default router;
