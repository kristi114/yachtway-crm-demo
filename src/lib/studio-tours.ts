import { useSyncExternalStore } from "react";
import { OPPORTUNITIES, getCompany, type Opportunity } from "@/lib/mock-data";
import { addTask, tasksFor } from "@/lib/tasks-log";
import { logComms } from "@/lib/comms-log";

/**
 * 3D Tour storage tracking.
 *
 * Every YachtWay Studio shoot includes 1 year of hosted storage. After that
 * the dealer must renew to keep the tour live. Tours are auto-derived from
 * Studio-pipeline opportunities that have been delivered/completed.
 */

export const STUDIO_STORAGE_YEARS = 1;
export const STUDIO_STORAGE_RENEWAL_PRICE_USD = 99;
export const STUDIO_REMINDER_WINDOW_DAYS = 30;

const DELIVERED_STAGES = new Set([
  "Completed",
  "Delivered",
  "Content Delivered",
  "Closed Won",
]);

export type StudioTourStatus = "active" | "expiring" | "expired" | "renewed";

export interface StudioTour {
  /** Same id as the source opportunity. */
  id: string;
  opportunity: Opportunity;
  companyId: string | null;
  delivered_at: string;   // ISO date, start of the storage clock
  expires_at: string;     // ISO date
  reminder_at: string;    // ISO date (30d before expires_at)
  days_until_expiry: number;
  status: StudioTourStatus;
  reminder_sent_at: string | null;
  renewed_until: string | null;
  renewal_price_usd: number;
}

interface TourOverride {
  delivered_at?: string;
  reminder_sent_at?: string | null;
  /** expires_at value the auto reminder task was already raised for. */
  reminder_task_for?: string | null;
  renewed_until?: string | null;
}

const STORAGE_KEY = "yachtway:studio-tours:v1";

function loadOverrides(): Record<string, TourOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, TourOverride>) : {};
  } catch {
    return {};
  }
}

let overrides: Record<string, TourOverride> = loadOverrides();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      /* ignore */
    }
  }
  for (const l of listeners) l();
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addYears(iso: string, years: number): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildTour(opp: Opportunity): StudioTour {
  const ov = overrides[opp.id] ?? {};
  const delivered_at = ov.delivered_at ?? opp.closeDate;
  const baseExpires = addYears(delivered_at, STUDIO_STORAGE_YEARS);
  const expires_at = ov.renewed_until ?? baseExpires;
  const reminder_at = addDays(expires_at, -STUDIO_REMINDER_WINDOW_DAYS);
  const days_until_expiry = daysBetween(todayIso(), expires_at);

  let status: StudioTourStatus;
  if (ov.renewed_until) status = "renewed";
  else if (days_until_expiry < 0) status = "expired";
  else if (days_until_expiry <= STUDIO_REMINDER_WINDOW_DAYS) status = "expiring";
  else status = "active";

  return {
    id: opp.id,
    opportunity: opp,
    companyId: opp.companyId ?? null,
    delivered_at,
    expires_at,
    reminder_at,
    days_until_expiry,
    status,
    reminder_sent_at: ov.reminder_sent_at ?? null,
    renewed_until: ov.renewed_until ?? null,
    renewal_price_usd: STUDIO_STORAGE_RENEWAL_PRICE_USD,
  };
}

export function isStudioDelivered(opp: Opportunity): boolean {
  return opp.pipeline === "Studio" && DELIVERED_STAGES.has(opp.stage);
}

export function allStudioTours(): StudioTour[] {
  return OPPORTUNITIES.filter(isStudioDelivered)
    .map(buildTour)
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at));
}

export function studioToursForCompany(companyId: string): StudioTour[] {
  return allStudioTours().filter((t) => t.companyId === companyId);
}

export function getStudioTour(opportunityId: string): StudioTour | null {
  const opp = OPPORTUNITIES.find((o) => o.id === opportunityId);
  if (!opp || !isStudioDelivered(opp)) return null;
  return buildTour(opp);
}

/** Manual override for the delivery/shoot date. */
export function setDeliveredDate(opportunityId: string, deliveredAt: string) {
  overrides[opportunityId] = { ...overrides[opportunityId], delivered_at: deliveredAt };
  persist();
}

/** Mark the dealer as having paid for another year of storage. */
export function markRenewed(opportunityId: string, years = 1) {
  const tour = getStudioTour(opportunityId);
  if (!tour) return;
  const base = tour.renewed_until ?? tour.expires_at;
  overrides[opportunityId] = {
    ...overrides[opportunityId],
    renewed_until: addYears(base, years),
    reminder_sent_at: null,
    reminder_task_for: null,
  };
  persist();
}

/**
 * Fire the 30-day renewal notice: creates an internal reminder task for the
 * account owner and logs an outbound email to the dealer. This is the mock
 * stand-in for the automated email that will go out in production.
 */
export function sendRenewalReminder(opportunityId: string) {
  const tour = getStudioTour(opportunityId);
  if (!tour) return;
  const company = tour.companyId ? getCompany(tour.companyId) : null;
  const owner = tour.opportunity.owner || "Account owner";
  const nowIso = new Date().toISOString();

  addTask({
    relatedType: "company",
    relatedId: tour.companyId ?? "",
    title: `3D Tour storage renewal - ${tour.opportunity.name}`,
    assignee: owner,
    dueDate: tour.expires_at,
    status: "Open",
    priority: tour.days_until_expiry <= 7 ? "High" : "Med",
    notes:
      `Storage for this 3D Tour expires ${tour.expires_at} ` +
      `($${STUDIO_STORAGE_RENEWAL_PRICE_USD}/yr to renew). ` +
      `Automated reminder email queued to ${company?.name ?? "dealer"}.`,
  });

  if (tour.companyId) {
    logComms({
      relatedType: "company",
      relatedId: tour.companyId,
      channel: "Email",
      direction: "outbound",
      author: "YachtWay Studio (automated)",
      subject: `Your 3D Tour storage renews on ${tour.expires_at}`,
      body:
        `Hi ${company?.primaryContactId ? "" : "there"},\n\n` +
        `Your 3D Tour "${tour.opportunity.name}" was delivered on ${tour.delivered_at}. ` +
        `The included 1 year of hosted storage expires on ${tour.expires_at}.\n\n` +
        `Renew for another year for $${STUDIO_STORAGE_RENEWAL_PRICE_USD} to keep the tour live on your listings and website.\n\n` +
        `- YachtWay Studio`,
      occurred_at: nowIso,
      follow_up_at: tour.expires_at,
    });
  }

  overrides[opportunityId] = {
    ...overrides[opportunityId],
    reminder_sent_at: nowIso,
  };
  persist();
}

/** Title used for the auto-generated renewal task (also the dedupe key). */
export function renewalTaskTitle(tour: StudioTour): string {
  return `3D Tour storage renewal - ${tour.opportunity.name}`;
}

/**
 * Automatic 30-day-before-annual-mark sweep.
 *
 * Any delivered tour inside the reminder window (or already past expiry)
 * gets an internal task assigned to the account owner, due on the expiry
 * date. Idempotent: one task per tour per storage term, and it is re-created
 * if the task log was cleared (e.g. after a reload).
 */
export function ensureRenewalTasks(): number {
  let created = 0;
  for (const tour of allStudioTours()) {
    if (tour.status !== "expiring" && tour.status !== "expired") continue;
    const ov = overrides[tour.id] ?? {};
    const title = renewalTaskTitle(tour);
    const alreadyLogged =
      tour.companyId != null &&
      tasksFor("company", tour.companyId).some((t) => t.title === title);
    if (ov.reminder_task_for === tour.expires_at && alreadyLogged) continue;

    const company = tour.companyId ? getCompany(tour.companyId) : null;
    addTask({
      relatedType: "company",
      relatedId: tour.companyId ?? "",
      title,
      assignee: tour.opportunity.owner || "Account owner",
      dueDate: tour.expires_at,
      status: "Open",
      priority: tour.days_until_expiry <= 7 ? "High" : "Med",
      notes:
        `Auto-raised ${STUDIO_REMINDER_WINDOW_DAYS} days before the annual mark. ` +
        `Storage for this 3D Tour expires ${tour.expires_at} ` +
        `($${STUDIO_STORAGE_RENEWAL_PRICE_USD}/yr to renew). ` +
        `Contact ${company?.name ?? "the dealer"} to confirm renewal.`,
    });
    overrides[tour.id] = { ...ov, reminder_task_for: tour.expires_at };
    created += 1;
  }
  if (created > 0) persist();
  return created;
}

export function subscribeStudioTours(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Subscribe hook so components re-render when tours change. */
export function useStudioTours() {
  return useSyncExternalStore(
    subscribeStudioTours,
    () => overrides,
    () => overrides,
  );
}
