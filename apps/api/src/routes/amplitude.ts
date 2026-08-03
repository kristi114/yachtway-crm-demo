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

/** Normalised form used by the identity ledger's (kind, value_key) unique index. */
function identityKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve a CRM contact from Amplitude's ids, via the identity ledger.
 *
 * A person may hold SEVERAL platform accounts — they signed up more than once
 * with different email addresses — and once those contacts are merged, every one
 * of those identifiers must keep resolving to the surviving contact. That's why
 * matching goes through `contact_identities` rather than the contact's own
 * columns: those hold only the PRIMARY email and db id, so a merged-away
 * identifier would silently stop matching and the events would look like a
 * tracking bug.
 *
 * Amplitude's `user_id` is whatever the platform passes to setUserId(). As of
 * 2026-07-31 that is the user's email, so `user_id` is checked as BOTH a
 * yachtway_db_id and an email — no need to guess which convention is in force,
 * and the platform can switch to the db id later with no code change.
 *
 * Ledger first, then the contact columns as a fallback (harmless belt-and-braces
 * while the ledger backfills, and it keeps the resolver working if the trigger is
 * ever disabled).
 */
async function resolveContactId(
  tx: Prisma.TransactionClient,
  ids: { userId: string | null; deviceId: string | null; amplitudeId: string | null },
): Promise<string | null> {
  // One indexed lookup covering every identifier we were handed, in one round
  // trip. `kind` is included so an email can never match a db id that happens to
  // hold the same string.
  const candidates: { kind: string; valueKey: string }[] = [];
  if (ids.userId) {
    const key = identityKey(ids.userId);
    candidates.push(
      { kind: "yachtway_db_id", valueKey: key },
      { kind: "amplitude_user_id", valueKey: key },
    );
    if (ids.userId.includes("@")) candidates.push({ kind: "email", valueKey: key });
  }
  if (ids.amplitudeId) {
    candidates.push({ kind: "amplitude_id", valueKey: identityKey(ids.amplitudeId) });
  }
  if (ids.deviceId) {
    candidates.push({ kind: "device_id", valueKey: identityKey(ids.deviceId) });
  }

  if (candidates.length > 0) {
    const hits = await tx.contactIdentity.findMany({
      where: { OR: candidates },
      select: { contactId: true, kind: true },
    });
    if (hits.length > 0) {
      // Prefer the strongest identifier when several match: an account id beats a
      // device, which is shared and gets recycled.
      const rank = ["yachtway_db_id", "email", "amplitude_user_id", "amplitude_id", "device_id"];
      hits.sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind));
      return hits[0]!.contactId;
    }
  }

  // Fallback: the contact row's own primary columns.
  if (ids.userId) {
    const byDbId = await tx.contact.findUnique({ where: { yachtwayDbId: ids.userId } });
    if (byDbId) return byDbId.id;
    const byAmpUser = await tx.contact.findFirst({ where: { amplitudeUserId: ids.userId } });
    if (byAmpUser) return byAmpUser.id;
    if (ids.userId.includes("@")) {
      const byEmail = await tx.contact.findUnique({
        where: { email: identityKey(ids.userId) },
      });
      if (byEmail) return byEmail.id;
    }
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

/**
 * Record an identifier we've just seen against a contact, so a value that only
 * ever arrives from Amplitude (a device id, or a second signup email) becomes
 * matchable later. Never steals an identifier already claimed by another contact —
 * that's a merge decision, not something ingestion should decide.
 */
async function noteIdentity(
  tx: Prisma.TransactionClient,
  contactId: string,
  kind: string,
  value: string | null,
): Promise<void> {
  if (!value || !value.trim()) return;
  const valueKey = identityKey(value);
  const existing = await tx.contactIdentity.findUnique({
    where: { kind_valueKey: { kind, valueKey } },
    select: { id: true, contactId: true },
  });
  if (existing) {
    if (existing.contactId === contactId) {
      await tx.contactIdentity.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
    }
    return;
  }
  await tx.contactIdentity.create({
    data: { contactId, kind, value, valueKey, isPrimary: false, source: "amplitude" },
  });
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
          // Learn the identifiers this event arrived on, so a second signup email
          // or a new browser resolves to the same contact next time. The contacts
          // trigger covers the primaries; these are the extras.
          await noteIdentity(tx, contactId, "device_id", ev.deviceId);
          await noteIdentity(tx, contactId, "amplitude_id", ev.amplitudeId);
          if (ev.userId?.includes("@")) {
            await noteIdentity(tx, contactId, "email", ev.userId);
          } else {
            await noteIdentity(tx, contactId, "yachtway_db_id", ev.userId);
          }
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
