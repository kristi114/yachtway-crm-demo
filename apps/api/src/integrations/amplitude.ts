import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/**
 * Amplitude destination (product analytics → CRM).
 *
 * The CRM is registered in Amplitude as a "Webhook" destination for three data
 * types (matching Amplitude's Create Destinations screen):
 *   - Events           → POST /webhooks/amplitude/events
 *   - User Properties   → POST /webhooks/amplitude/user-properties
 *   - Cohorts          → POST /webhooks/amplitude/cohorts
 *
 * These are PUBLIC endpoints (no CRM session), so each request authenticates
 * itself. Amplitude signs outbound webhooks by attaching configurable headers,
 * so we require a shared secret and — when configured — an HMAC over the body:
 *
 *   1. Shared secret (required): `Authorization: Bearer <secret>` OR
 *      `X-Amplitude-Secret: <secret>`, constant-time compared.
 *   2. HMAC signature (optional, defense in depth): if AMPLITUDE_SIGNING_KEY is
 *      set, `X-Amplitude-Signature` must equal HMAC-SHA256(signingKey, rawBody)
 *      as lowercase hex.
 *
 * The join key to the CRM is Amplitude's `user_id`, which the frontend sets to
 * the YachtWay DB ID (see Amplitude-Frontend-Requirements.md). We resolve a
 * Contact by `yachtwayDbId` first, then fall back to `amplitudeUserId` /
 * `amplitudeDeviceId`. PII never appears in `user_id`.
 */

export class AmplitudeConfigError extends Error {
  constructor(missing: string) {
    super(`Amplitude destination not configured: missing ${missing}`);
    this.name = "AmplitudeConfigError";
  }
}

export type AmplitudeDataType = "events" | "user-properties" | "cohorts";

/** True once a shared secret is configured. */
export function amplitudeConfigured(): boolean {
  return Boolean(env.AMPLITUDE_WEBHOOK_SECRET);
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Pull the presented shared secret from either supported header. */
export function extractPresentedSecret(headers: {
  authorization?: string;
  xAmplitudeSecret?: string;
}): string | null {
  const bearer = headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer.trim();
  if (headers.xAmplitudeSecret) return headers.xAmplitudeSecret.trim();
  return null;
}

export interface AmplitudeAuthInput {
  presentedSecret: string | null;
  signature?: string;
  rawBody: string;
}

/**
 * Authenticate an inbound Amplitude webhook. Returns false (never throws for a
 * bad credential) so the route answers 401 without leaking why. Throws only
 * AmplitudeConfigError when the destination isn't configured at all.
 */
export function verifyAmplitudeAuth(
  input: AmplitudeAuthInput,
  secret: string | undefined = env.AMPLITUDE_WEBHOOK_SECRET,
  signingKey: string | undefined = env.AMPLITUDE_SIGNING_KEY,
): boolean {
  if (!secret) throw new AmplitudeConfigError("AMPLITUDE_WEBHOOK_SECRET");

  if (!input.presentedSecret) return false;
  if (!constantTimeEquals(input.presentedSecret, secret)) return false;

  // Optional HMAC layer.
  if (signingKey) {
    if (!input.signature) return false;
    const expected = createHmac("sha256", signingKey).update(input.rawBody).digest("hex");
    if (!constantTimeEquals(input.signature.toLowerCase(), expected)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Payload parsing                                                     */
/* ------------------------------------------------------------------ */

/**
 * Amplitude batches records, but the exact envelope varies by destination
 * config. Accept a bare array, `{ events: [...] }`, `{ data: [...] }`, or a
 * single object, and normalize to an array.
 */
function toRecords(body: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const k of keys) {
      if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[];
    }
    return [obj];
  }
  return [];
}

export interface ParsedAmplitudeEvent {
  /** Stable idempotency key. Prefer Amplitude's insert_id, then event id. */
  externalId: string;
  userId: string | null;
  deviceId: string | null;
  amplitudeId: string | null;
  eventType: string;
  eventTime: Date | null;
  sessionId: string | null;
  eventProperties: Record<string, unknown> | null;
  userProperties: Record<string, unknown> | null;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asDate(v: unknown): Date | null {
  if (v == null) return null;
  // Amplitude sends epoch millis (number) or ISO string.
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseAmplitudeEvents(body: unknown): ParsedAmplitudeEvent[] {
  const records = toRecords(body, ["events", "data"]);
  const out: ParsedAmplitudeEvent[] = [];
  for (const r of records) {
    const insertId = asString(r.insert_id ?? r.insertId ?? r.uuid ?? r.id);
    const userId = asString(r.user_id ?? r.userId);
    const deviceId = asString(r.device_id ?? r.deviceId);
    const eventType = asString(r.event_type ?? r.eventType) ?? "unknown";
    // Derive a stable key even when insert_id is absent.
    const externalId =
      insertId ??
      `${userId ?? deviceId ?? "anon"}:${eventType}:${asString(r.event_time ?? r.eventTime) ?? ""}`;
    out.push({
      externalId,
      userId,
      deviceId,
      amplitudeId: asString(r.amplitude_id ?? r.amplitudeId),
      eventType,
      eventTime: asDate(r.event_time ?? r.eventTime ?? r.time),
      sessionId: asString(r.session_id ?? r.sessionId),
      eventProperties: asRecord(r.event_properties ?? r.eventProperties),
      userProperties: asRecord(r.user_properties ?? r.userProperties),
    });
  }
  return out;
}

export interface ParsedAmplitudeUserProperties {
  externalId: string;
  userId: string | null;
  deviceId: string | null;
  amplitudeId: string | null;
  properties: Record<string, unknown>;
  updatedAt: Date | null;
}

export function parseAmplitudeUserProperties(body: unknown): ParsedAmplitudeUserProperties[] {
  const records = toRecords(body, ["user_properties", "users", "data"]);
  const out: ParsedAmplitudeUserProperties[] = [];
  for (const r of records) {
    const userId = asString(r.user_id ?? r.userId);
    const deviceId = asString(r.device_id ?? r.deviceId);
    const properties =
      asRecord(r.user_properties ?? r.userProperties ?? r.properties) ??
      // Some configs flatten props onto the record itself.
      Object.fromEntries(
        Object.entries(r).filter(([k]) => !["user_id", "userId", "device_id", "deviceId", "amplitude_id", "amplitudeId"].includes(k)),
      );
    const updatedAt = asDate(r.updated_at ?? r.updatedAt ?? r.event_time ?? r.time);
    out.push({
      externalId: `${userId ?? deviceId ?? "anon"}:${updatedAt?.toISOString() ?? "latest"}`,
      userId,
      deviceId,
      amplitudeId: asString(r.amplitude_id ?? r.amplitudeId),
      properties,
      updatedAt,
    });
  }
  return out;
}

export interface ParsedAmplitudeCohort {
  amplitudeCohortId: string;
  name: string | null;
  description: string | null;
  /** Full membership snapshot (Amplitude cohort webhooks send the member list). */
  memberUserIds: string[];
  syncedAt: Date | null;
}

export function parseAmplitudeCohort(body: unknown): ParsedAmplitudeCohort | null {
  const obj = asRecord(body);
  if (!obj) return null;
  const amplitudeCohortId = asString(obj.cohort_id ?? obj.cohortId ?? obj.id);
  if (!amplitudeCohortId) return null;
  const rawMembers =
    (obj.member_ids as unknown) ??
    (obj.memberIds as unknown) ??
    (obj.members as unknown) ??
    (obj.user_ids as unknown) ??
    [];
  const memberUserIds = Array.isArray(rawMembers)
    ? rawMembers.map((m) => String(m)).filter(Boolean)
    : [];
  return {
    amplitudeCohortId,
    name: asString(obj.name ?? obj.cohort_name),
    description: asString(obj.description),
    memberUserIds,
    syncedAt: asDate(obj.synced_at ?? obj.syncedAt ?? obj.last_computed),
  };
}
