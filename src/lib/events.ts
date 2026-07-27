import { useSyncExternalStore } from "react";

/**
 * Dealer Events - boat shows, onboarding sessions, open houses, etc.
 * localStorage-backed for the demo; replace with the real backend later.
 */

export interface BoatShow {
  /** Stored value / code */
  code: string;
  /** Full official name */
  name: string;
  /** Short name most people use */
  short: string;
  region: "Europe" | "Americas" | "Middle East & Asia-Pacific";
}

export const BOAT_SHOWS: readonly BoatShow[] = [
  // Europe
  { code: "MYS", name: "Monaco Yacht Show", short: "MYS", region: "Europe" },
  { code: "CYF", name: "Cannes Yachting Festival", short: "CYF", region: "Europe" },
  { code: "BOOT", name: "boot Düsseldorf", short: "BOOT", region: "Europe" },
  { code: "SALONE_NAUTICO", name: "Genoa International Boat Show", short: "Salone Nautico", region: "Europe" },
  { code: "SALONE_NAUTICO_VENEZIA", name: "Venice Boat Show", short: "Salone Nautico Venezia", region: "Europe" },
  { code: "METS", name: "METSTRADE Amsterdam", short: "METS", region: "Europe" },
  { code: "PIBS", name: "Palma International Boat Show", short: "PIBS", region: "Europe" },
  { code: "SALON_NAUTICO", name: "Barcelona International Boat Show", short: "Salón Náutico", region: "Europe" },
  { code: "SIBS", name: "Southampton International Boat Show", short: "SIBS", region: "Europe" },
  { code: "NAUTIC_PARIS", name: "Salon Nautique Paris", short: "Nautic Paris", region: "Europe" },
  { code: "IBS", name: "Istanbul Boat Show", short: "IBS", region: "Europe" },
  { code: "CROATIA_BOAT_SHOW", name: "Split Boat Show", short: "Croatia Boat Show", region: "Europe" },
  { code: "VYR", name: "Versilia Yachting Rendez-vous", short: "VYR", region: "Europe" },
  { code: "MEBC", name: "Monaco Energy Boat Challenge", short: "MEBC", region: "Europe" },
  { code: "TULLN", name: "Tulln Boat Show", short: "Austrian Boat Show", region: "Europe" },
  // Americas
  { code: "FLIBS", name: "Fort Lauderdale International Boat Show", short: "FLIBS", region: "Americas" },
  { code: "MIBS", name: "Miami International Boat Show", short: "MIBS", region: "Americas" },
  { code: "PBIBS", name: "Palm Beach International Boat Show", short: "PBIBS", region: "Americas" },
  { code: "NIBS", name: "Newport International Boat Show", short: "NIBS", region: "Americas" },
  { code: "ACYS", name: "Antigua Charter Yacht Show", short: "ACYS", region: "Americas" },
  // Middle East & Asia-Pacific
  { code: "DIBS", name: "Dubai International Boat Show", short: "DIBS", region: "Middle East & Asia-Pacific" },
  { code: "SYF", name: "Singapore Yachting Festival", short: "SYF", region: "Middle East & Asia-Pacific" },
  { code: "HKIBS", name: "Hong Kong International Boat Show", short: "HKIBS", region: "Middle East & Asia-Pacific" },
  { code: "SCIBS", name: "Sanctuary Cove International Boat Show", short: "SCIBS", region: "Middle East & Asia-Pacific" },
  { code: "SIBS_SYDNEY", name: "Sydney International Boat Show", short: "SIBS Sydney", region: "Middle East & Asia-Pacific" },
  { code: "ABS", name: "Auckland Boat Show", short: "ABS", region: "Middle East & Asia-Pacific" },
];

export const BOAT_SHOW_REGIONS = [
  "Europe",
  "Americas",
  "Middle East & Asia-Pacific",
] as const;

export function getBoatShow(code: string | null | undefined): BoatShow | undefined {
  if (!code) return undefined;
  return BOAT_SHOWS.find((s) => s.code === code);
}

export function boatShowLabel(code: string | null | undefined): string {
  const show = getBoatShow(code);
  if (!show) return code || "-";
  return show.short === show.name ? show.name : `${show.name} - ${show.short}`;
}

export const EVENT_TYPES = [
  "Dealer onboarding",
  "Dealer refresh course",
  "Boat show",
  "Open house",
  "Sea trial",
  "Dealer meeting",
  "Webinar",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Event types that require a boat show to be selected. */
export const BOAT_SHOW_EVENT_TYPES: readonly EventType[] = ["Boat show"];

export const EVENT_VISIBILITY = ["Public", "Private"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITY)[number];

export const EVENT_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Athens",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

export interface DealerEvent {
  id: string;
  dealerId: string;
  dealerName: string;
  eventName: string;
  eventType: EventType;
  boatShowName: string | null;
  eventDetails: string;
  eventStartDate: string; // yyyy-mm-dd
  eventStartTime: string; // HH:mm
  eventEndDate: string;
  eventEndTime: string;
  eventTimeZone: string;
  eventLocationCity: string;
  eventLocationCountry: string;
  eventLocationStreet: string;
  eventLocationState: string;
  eventLocationPostalCode: string;
  publicOrPrivate: EventVisibility;
  invitedGuestsEmails: string;
  repeating: boolean;
  isActive: boolean;
  isCancelled: boolean;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "yw:dealer-events:v1";

const SEED: DealerEvent[] = [
  {
    id: "evt_seed_1",
    dealerId: "cmp_001",
    dealerName: "Riviera Yachts Miami",
    eventName: "FLIBS 2026 - YachtWay booth walkthrough",
    eventType: "Boat show",
    boatShowName: "FLIBS",
    eventDetails: "Joint booth presence. Demo Studio 3D tours to walk-in buyers.",
    eventStartDate: "2026-10-28",
    eventStartTime: "10:00",
    eventEndDate: "2026-11-01",
    eventEndTime: "18:00",
    eventTimeZone: "America/New_York",
    eventLocationCity: "Fort Lauderdale",
    eventLocationCountry: "United States",
    eventLocationStreet: "Bahia Mar Yachting Center",
    eventLocationState: "FL",
    eventLocationPostalCode: "33316",
    publicOrPrivate: "Public",
    invitedGuestsEmails: "",
    repeating: false,
    isActive: true,
    isCancelled: false,
    createdByName: "Mavil",
    createdAt: "2026-07-02T10:00:00.000Z",
    updatedAt: "2026-07-02T10:00:00.000Z",
  },
  {
    id: "evt_seed_2",
    dealerId: "cmp_003",
    dealerName: "Sunseeker Fort Lauderdale",
    eventName: "Dealer onboarding - sales team",
    eventType: "Dealer onboarding",
    boatShowName: null,
    eventDetails: "Full platform onboarding: listings, Studio, EasySign.",
    eventStartDate: "2026-08-12",
    eventStartTime: "09:30",
    eventEndDate: "2026-08-12",
    eventEndTime: "12:00",
    eventTimeZone: "America/New_York",
    eventLocationCity: "Fort Lauderdale",
    eventLocationCountry: "United States",
    eventLocationStreet: "",
    eventLocationState: "FL",
    eventLocationPostalCode: "",
    publicOrPrivate: "Private",
    invitedGuestsEmails: "",
    repeating: false,
    isActive: true,
    isCancelled: false,
    createdByName: "Mavil",
    createdAt: "2026-07-05T10:00:00.000Z",
    updatedAt: "2026-07-05T10:00:00.000Z",
  },
  {
    id: "evt_seed_3",
    dealerId: "cmp_shipyard_azimut",
    dealerName: "Azimut-Benetti Group",
    eventName: "Dealer refresh course - Q3",
    eventType: "Dealer refresh course",
    boatShowName: null,
    eventDetails: "Refresher on new Studio workflow and lead routing.",
    eventStartDate: "2026-09-03",
    eventStartTime: "14:00",
    eventEndDate: "2026-09-03",
    eventEndTime: "15:30",
    eventTimeZone: "Europe/Rome",
    eventLocationCity: "Avigliana",
    eventLocationCountry: "Italy",
    eventLocationStreet: "",
    eventLocationState: "",
    eventLocationPostalCode: "",
    publicOrPrivate: "Private",
    invitedGuestsEmails: "",
    repeating: true,
    isActive: true,
    isCancelled: false,
    createdByName: "Mavil",
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z",
  },
];

function load(): DealerEvent[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DealerEvent[]) : SEED;
  } catch {
    return SEED;
  }
}

let state: DealerEvent[] = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore */
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const snapshot = () => state;

export function useEventsStore() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function listEvents(): DealerEvent[] {
  return [...state].sort((a, b) =>
    a.eventStartDate < b.eventStartDate ? -1 : a.eventStartDate > b.eventStartDate ? 1 : 0,
  );
}

export function eventsForCompany(companyId: string): DealerEvent[] {
  return listEvents().filter((e) => e.dealerId === companyId);
}

export function getEvent(id: string): DealerEvent | undefined {
  return state.find((e) => e.id === id);
}

export type NewDealerEvent = Omit<DealerEvent, "id" | "createdAt" | "updatedAt">;

export function addEvent(input: NewDealerEvent): DealerEvent {
  const now = new Date().toISOString();
  const event: DealerEvent = {
    ...input,
    id: `evt_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now,
    updatedAt: now,
  };
  state = [...state, event];
  persist();
  emit();
  return event;
}

export function updateEvent(id: string, patch: Partial<DealerEvent>) {
  state = state.map((e) =>
    e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
  );
  persist();
  emit();
}

export function removeEvent(id: string) {
  state = state.filter((e) => e.id !== id);
  persist();
  emit();
}

export function isUpcoming(e: DealerEvent, today = new Date()): boolean {
  const end = e.eventEndDate || e.eventStartDate;
  return !e.isCancelled && end >= today.toISOString().slice(0, 10);
}

export function formatEventDates(e: DealerEvent): string {
  const fmt = (d: string) =>
    d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  const start = fmt(e.eventStartDate);
  const end = e.eventEndDate && e.eventEndDate !== e.eventStartDate ? fmt(e.eventEndDate) : "";
  return end ? `${start} - ${end}` : start;
}

export function eventLocationLine(e: DealerEvent): string {
  return [e.eventLocationStreet, e.eventLocationCity, e.eventLocationState, e.eventLocationPostalCode, e.eventLocationCountry]
    .filter(Boolean)
    .join(", ");
}
