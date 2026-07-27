import { Prisma } from "@prisma/client";
import { Router } from "express";
import { withRole } from "../permissions/rls.js";
import {
  AmplitudeConfigError,
  extractPresentedSecret,
  parseAmplitudeCohort,
  parseAmplitudeEvents,
  parseAmplitudeUserProperties,
  verifyAmplitudeAuth,
  type AmplitudeDataType,
} from "../integrations/amplitude.js";

/**
 * Amplitude destination webhooks (product analytics → CRM). PUBLIC endpoints —
 * no CRM session — so each request authenticates itself with the shared secret
 * (+ optional HMAC). Writes run under the INTEGRATION system role so RLS still
 * governs them. Mirrors the /webhooks/* idempotency approach used for the
 * provider webhooks.
 *
 * Join key: Amplitude `user_id` === Contact.yachtwayDbId (the identity contract
 * in Amplitude-Frontend-Requirements.md). We resolve a contact where possible
 * and always retain the raw Amplitude ids for later reconciliation.
 */
const router: Router = Router();

/** One place to authenticate an inbound Amplitude request. Returns an HTTP
 *  status to answer with on failure, or null when authenticated. */
function authenticate(req: {
  header: (name: string) => string | undefined;
  rawBody?: string;
}): number | null {
  const presentedSecret = extractPresentedSecret({
    authorization: req.header("authorization"),
    xAmplitudeSecret: req.header("x-amplitude-secret"),
  });
  const signature = req.header("x-amplitude-signature");
  const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";
  try {
    return verifyAmplitudeAuth({ presentedSecret, signature, rawBody }) ? null : 401;
  } catch (err) {
    if (err instanceof AmplitudeConfigError) return 503;
    throw err;
  }
}

/** Resolve a CRM contact id from Amplitude ids. Prefers the identity contract
 *  (yachtwayDbId === user_id), then previously-linked amplitude ids. */
async function resolveContactId(
  tx: Prisma.TransactionClient,
  ids: { userId: string | null; deviceId: string | null; amplitudeId: string | null },
): Promise<string | null> {
  if (ids.userId) {
    const byDbId = await tx.contact.findUnique({ where: { yachtwayDbId: ids.userId } });
    if (byDbId) return byDbId.id;
    const byAmpUser = await tx.contact.findFirst({ where: { amplitudeUserId: ids.userId } });
    if (byAmpUser) return byAmpUser.id;
  }
  if (ids.amplitudeId) {
    const byAmpId = await tx.contact.findFirst({ where: { amplitudeId: ids.amplitudeId } });
    if (byAmpId) return byAmpId.id;
  }
  if (ids.deviceId) {
    const byDevice = await tx.contact.findFirst({ where: { amplitudeDeviceId: ids.deviceId } });
    if (byDevice) return byDevice.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Events destination
// ---------------------------------------------------------------------------
router.post("/webhooks/amplitude/events", async (req, res) => {
  const bad = authenticate(req);
  if (bad === 503) {
    res.status(503).json({ error: "amplitude_not_configured" });
    return;
  }
  if (bad === 401) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const events = parseAmplitudeEvents(req.body);
  let ingested = 0;
  let duplicates = 0;
  let linked = 0;

  for (const ev of events) {
    try {
      const r = await withRole("INTEGRATION", async (tx) => {
        const existing = await tx.amplitudeEvent.findUnique({ where: { externalId: ev.externalId } });
        if (existing) return { duplicate: true, linked: false };

        const contactId = await resolveContactId(tx, {
          userId: ev.userId,
          deviceId: ev.deviceId,
          amplitudeId: ev.amplitudeId,
        });

        await tx.amplitudeEvent.create({
          data: {
            externalId: ev.externalId,
            contactId,
            ampUserId: ev.userId,
            deviceId: ev.deviceId,
            amplitudeId: ev.amplitudeId,
            eventType: ev.eventType,
            eventTime: ev.eventTime,
            sessionId: ev.sessionId,
            eventProperties: (ev.eventProperties ?? undefined) as Prisma.InputJsonValue | undefined,
            userProperties: (ev.userProperties ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });

        // Keep the contact's "last event" pointer fresh + link amplitude ids.
        if (contactId) {
          await tx.contact.update({
            where: { id: contactId },
            data: {
              lastAmplitudeEvent: ev.eventType,
              ...(ev.userId ? { amplitudeUserId: ev.userId } : {}),
              ...(ev.deviceId ? { amplitudeDeviceId: ev.deviceId } : {}),
              ...(ev.amplitudeId ? { amplitudeId: ev.amplitudeId } : {}),
            },
          });
        }
        return { duplicate: false, linked: Boolean(contactId) };
      });
      if (r.duplicate) duplicates++;
      else {
        ingested++;
        if (r.linked) linked++;
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        duplicates++;
      } else {
        throw err; // 5xx → Amplitude retries
      }
    }
  }

  res.status(200).json({ ok: true, received: events.length, ingested, duplicates, linked });
});

// ---------------------------------------------------------------------------
// User Properties destination
// ---------------------------------------------------------------------------
router.post("/webhooks/amplitude/user-properties", async (req, res) => {
  const bad = authenticate(req);
  if (bad === 503) {
    res.status(503).json({ error: "amplitude_not_configured" });
    return;
  }
  if (bad === 401) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const updates = parseAmplitudeUserProperties(req.body);
  let applied = 0;
  let unmatched = 0;

  for (const u of updates) {
    const r = await withRole("INTEGRATION", async (tx) => {
      const contactId = await resolveContactId(tx, {
        userId: u.userId,
        deviceId: u.deviceId,
        amplitudeId: u.amplitudeId,
      });
      if (!contactId) return { matched: false };
      await tx.contact.update({
        where: { id: contactId },
        data: {
          amplitudeUserProperties: u.properties as Prisma.InputJsonValue,
          ...(u.userId ? { amplitudeUserId: u.userId } : {}),
          ...(u.deviceId ? { amplitudeDeviceId: u.deviceId } : {}),
          ...(u.amplitudeId ? { amplitudeId: u.amplitudeId } : {}),
        },
      });
      return { matched: true };
    });
    if (r.matched) applied++;
    else unmatched++;
  }

  res.status(200).json({ ok: true, received: updates.length, applied, unmatched });
});

// ---------------------------------------------------------------------------
// Cohorts destination — full-membership snapshot per sync.
// ---------------------------------------------------------------------------
router.post("/webhooks/amplitude/cohorts", async (req, res) => {
  const bad = authenticate(req);
  if (bad === 503) {
    res.status(503).json({ error: "amplitude_not_configured" });
    return;
  }
  if (bad === 401) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const cohort = parseAmplitudeCohort(req.body);
  if (!cohort) {
    res.status(400).json({ error: "malformed_cohort" });
    return;
  }

  const result = await withRole("INTEGRATION", async (tx) => {
    const record = await tx.amplitudeCohort.upsert({
      where: { amplitudeCohortId: cohort.amplitudeCohortId },
      create: {
        amplitudeCohortId: cohort.amplitudeCohortId,
        name: cohort.name,
        description: cohort.description,
        memberCount: cohort.memberUserIds.length,
        lastSyncedAt: cohort.syncedAt ?? new Date(),
      },
      update: {
        name: cohort.name,
        description: cohort.description,
        memberCount: cohort.memberUserIds.length,
        lastSyncedAt: cohort.syncedAt ?? new Date(),
      },
    });

    // Replace the membership snapshot so removals are reflected.
    await tx.amplitudeCohortMembership.deleteMany({ where: { cohortId: record.id } });

    let linked = 0;
    for (const ampUserId of cohort.memberUserIds) {
      const contactId = await resolveContactId(tx, {
        userId: ampUserId,
        deviceId: null,
        amplitudeId: null,
      });
      if (contactId) linked++;
      await tx.amplitudeCohortMembership.create({
        data: { cohortId: record.id, ampUserId, contactId },
      });
    }
    return { cohortId: record.id, members: cohort.memberUserIds.length, linked };
  });

  res.status(200).json({ ok: true, cohort: cohort.amplitudeCohortId, ...result });
});

export const AMPLITUDE_DATA_TYPES: AmplitudeDataType[] = ["events", "user-properties", "cohorts"];

export default router;
