import { useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { UserPlus, UserMinus, Undo2, Users, Sparkles, Check, ExternalLink, Ruler, Inbox, Filter, ChevronDown, Building2, UserX } from "lucide-react";
import { BoatIcon } from "@/components/icons/boat-icon";
import type { Company, Contact } from "@/lib/mock-data";
import { COMPANY_ROLES, COMPANIES, setPrimaryContact } from "@/lib/mock-data";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

// ==========================================================
// Broker roster
// - "On YachtWay" = existing contacts of type Broker for the company
// - "Not yet on YachtWay" = enriched brokers scraped from public sources
//   (deterministically synthesized from company.scrapedBrokerCount so
//   the roster is stable between renders and page loads).
// - Sales rep can mark an enriched broker as either:
//     "In company - invite to YachtWay"   -> stays as pending invite (shown separately)
//     "No longer at company"              -> removed from roster
// - Overrides persist to localStorage so the demo state survives reloads.
// ==========================================================

export type BrokerOverride = "invited" | "left" | "moved";
interface OverrideEntry { status: BrokerOverride; movedTo?: string }
type Store = Record<string, Record<string, OverrideEntry>>; // companyId -> broker_id -> entry

const STORAGE_KEY = "yw:broker-roster:v2";

function load(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch { return {}; }
}
let state: Store = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function persist() {
  try { if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* ignore */ }
}
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function snapshot() { return state; }
function useRosterStore() { return useSyncExternalStore(subscribe, snapshot, snapshot); }

function setOverride(companyId: string, brokerId: string, entry: OverrideEntry | null) {
  const forCo = { ...(state[companyId] ?? {}) };
  if (entry === null) delete forCo[brokerId];
  else forCo[brokerId] = entry;
  state = { ...state, [companyId]: forCo };
  persist();
  emit();
}

// ---------- deterministic broker generator ----------
const FIRST = ["Alex","Morgan","Jordan","Taylor","Casey","Riley","Quinn","Dakota","Sasha","Reese","Skyler","Rowan","Emerson","Hayden","Peyton","Sydney","Blake","Cameron","Devon","Elliot","Finley","Gray","Harper","Indigo","Jesse","Kendall","Logan","Micah","Nico","Parker"];
const LAST  = ["Whitmore","Delacroix","Kensington","Ashford","Bellamy","Cavanaugh","Donovan","Everhart","Fairbanks","Grayson","Halloway","Ives","Jennings","Kirkland","Langley","Marchetti","Northrop","Oakley","Prescott","Quintero","Ravenscroft","Sinclair","Thorne","Ulbrich","Vandermeer","Winslow","Yates","Zimmerman","Ashby","Blackwood"];
const SOURCES = ["YachtWorld", "Boat Trader", "Marketplace scrape", "Broker directory"] as const;
const SPECIALTIES = [
  "Center consoles", "Sail yachts", "Motor yachts", "Sportfish",
  "Performance boats", "Catamarans", "Trawlers", "Express cruisers", "Superyachts",
] as const;
const SIZE_RANGES = ["25-40ft", "40-60ft", "60-80ft", "80-120ft", "120-180ft", "180ft+"] as const;

// Small deterministic hash so the same company always produces the same list.
function seed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rand(seedVal: number) {
  let x = seedVal || 1;
  return () => { x = Math.imul(48271, x) % 0x7fffffff; return x / 0x7fffffff; };
}

export interface BrokerProfile {
  specialties: string[];   // 1-2 boat categories
  sizeRange: string;       // e.g. "80-120ft"
  leadsFromYachtway: number;
}

// Deterministic enrichment profile for ANY broker (roster or enriched).
// Keyed on a stable string (contact id or enriched broker id).
export function brokerProfile(key: string): BrokerProfile {
  const r = rand(seed(`profile::${key}`));
  const s1 = SPECIALTIES[Math.floor(r() * SPECIALTIES.length)];
  const includeSecond = r() > 0.55;
  let s2 = SPECIALTIES[Math.floor(r() * SPECIALTIES.length)];
  if (s2 === s1) s2 = SPECIALTIES[(SPECIALTIES.indexOf(s2) + 1) % SPECIALTIES.length];
  const specialties = includeSecond ? [s1, s2] : [s1];
  const sizeRange = SIZE_RANGES[Math.floor(r() * SIZE_RANGES.length)];
  const leadsFromYachtway = Math.floor(r() * 42);
  return { specialties, sizeRange, leadsFromYachtway };
}

export interface EnrichedBroker {
  id: string;
  name: string;
  source: string;
  listings: number;
  since_year: number;
  profile: BrokerProfile;
}

function enrichedBrokersFor(company: Company): EnrichedBroker[] {
  const n = company.scrapedBrokerCount ?? 0;
  if (n <= 0) return [];
  const r = rand(seed(company.id));
  const out: EnrichedBroker[] = [];
  for (let i = 0; i < n; i++) {
    const first = FIRST[Math.floor(r() * FIRST.length)];
    const last  = LAST[Math.floor(r() * LAST.length)];
    const id = `${company.id}::eb${i}`;
    out.push({
      id,
      name: `${first} ${last}`,
      source: SOURCES[Math.floor(r() * SOURCES.length)],
      listings: 1 + Math.floor(r() * 8),
      since_year: 2019 + Math.floor(r() * 6),
      profile: brokerProfile(id),
    });
  }
  return out;
}

// ==========================================================
// UI
// ==========================================================
export function BrokerRosterPanel({
  company, contacts,
}: {
  company: Company;
  contacts: Contact[];
}) {
  const overrides = useRosterStore()[company.id] ?? {};

  const [roleFilter, setRoleFilter] = useState<string>("all");

  const yachtwayContacts = useMemo(() => contacts, [contacts]);

  const filteredContacts = useMemo(() => {
    if (roleFilter === "all") return yachtwayContacts;
    return yachtwayContacts.filter((c) =>
      c.companyRole === roleFilter ||
      c.roleAtDealership === roleFilter ||
      c.contactType === roleFilter
    );
  }, [yachtwayContacts, roleFilter]);

  const enriched = useMemo(() => enrichedBrokersFor(company), [company]);

  const statusOf = (id: string) => overrides[id]?.status;
  const active = enriched.filter((b) => statusOf(b.id) !== "left" && statusOf(b.id) !== "moved");
  const invited = active.filter((b) => statusOf(b.id) === "invited");
  const pending = active.filter((b) => statusOf(b.id) !== "invited");
  const left = enriched.filter((b) => statusOf(b.id) === "left" || statusOf(b.id) === "moved");

  const [showLeft, setShowLeft] = useState(false);

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          <Users className="h-3.5 w-3.5 text-brand" /> Contact roster
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-7 w-[140px] text-xs" aria-label="Filter contacts by role">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All roles</SelectItem>
                {COMPANY_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {filteredContacts.length} on YachtWay · {pending.length} to invite
            {invited.length > 0 ? ` · ${invited.length} invited` : ""}
          </span>
        </div>
      </header>

      {/* On YachtWay */}
      <div className="border-b border-border">
        <div className="flex items-center gap-1.5 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-success">
          <Check className="h-3 w-3" /> On YachtWay ({filteredContacts.length})
        </div>
        {filteredContacts.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            {roleFilter === "all"
              ? "No contacts from this company on YachtWay yet."
              : `No ${roleFilter.toLowerCase()} contacts on YachtWay.`}
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {filteredContacts.map((c) => {
              const p = brokerProfile(c.id);
              const isPrimary = company.primaryContactId === c.id;
              return (
                <li key={c.id} className="flex items-start gap-2 px-4 py-2">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success/15 text-[10px] font-semibold text-success">
                    {(c.firstName[0] ?? "") + (c.lastName[0] ?? "")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Link
                        to="/contacts/$id"
                        params={{ id: c.id }}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 truncate text-sm font-medium text-brand hover:underline"
                        title="Open contact profile in a new tab"
                      >
                        {c.firstName} {c.lastName}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </Link>
                      {isPrimary ? (
                        <span className="shrink-0 rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-deep ring-1 ring-brand/25">
                          Primary
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPrimaryContact(company.id, c.id)}
                          className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        >
                          Make primary
                        </button>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {c.roleAtDealership || c.contactType}
                      {c.brokerLicenseState ? ` · Lic. ${c.brokerLicenseState}` : ""}
                    </div>
                    <BrokerProfileMeta profile={p} />
                  </div>
                </li>
              );
            })}

          </ul>
        )}
      </div>



      {/* Invited (moved from enriched, awaiting YachtWay activation) */}
      {invited.length > 0 && (
        <div className="border-b border-border bg-brand/5">
          <div className="flex items-center gap-1.5 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-brand">
            <Sparkles className="h-3 w-3" /> Invited to YachtWay ({invited.length})
          </div>
          <ul className="divide-y divide-border/70">
            {invited.map((b) => (
              <EnrichedRow
                key={b.id}
                broker={b}
                companyId={company.id}
                onInvite={() => setOverride(company.id, b.id, null)}
                onMoved={(targetId) => setOverride(company.id, b.id, { status: "moved", movedTo: targetId })}
                onLeft={() => setOverride(company.id, b.id, { status: "left" })}
                inviteLabel="Undo invite"
                inviteIcon={Undo2}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Not on YachtWay - enriched from public sources */}
      <div className={left.length > 0 && !showLeft ? "" : "border-b border-border"}>
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-warning">
            <ExternalLink className="h-3 w-3" /> Not yet on YachtWay ({pending.length})
          </div>
          <span className="text-[10px] text-muted-foreground">enriched from public listings</span>
        </div>
        {pending.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            {enriched.length === 0
              ? "No brokers found in enrichment data for this company."
              : "All enriched brokers actioned. Nice work!"}
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {pending.map((b) => (
              <EnrichedRow
                key={b.id}
                broker={b}
                companyId={company.id}
                onInvite={() => setOverride(company.id, b.id, { status: "invited" })}
                onMoved={(targetId) => setOverride(company.id, b.id, { status: "moved", movedTo: targetId })}
                onLeft={() => setOverride(company.id, b.id, { status: "left" })}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Removed (marked as no longer at company) */}
      {left.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowLeft((s) => !s)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/40"
          >
            <span>No longer at company ({left.length})</span>
            <span className="normal-case tracking-normal text-[10px] font-medium">
              {showLeft ? "Hide" : "Show"}
            </span>
          </button>
          {showLeft && (
            <ul className="divide-y divide-border/70 bg-muted/30">
              {left.map((b) => {
                const entry = overrides[b.id];
                const movedCompany = entry?.movedTo ? COMPANIES.find((c) => c.id === entry.movedTo) : undefined;
                return (
                  <li key={b.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground line-through">
                      {b.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-muted-foreground line-through">{b.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {movedCompany
                          ? <>Moved to <span className="font-medium text-brand-deep">{movedCompany.name}</span></>
                          : "No longer with the company"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOverride(company.id, b.id, null)}
                      className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent"
                      title="Restore to roster"
                    >
                      <Undo2 className="h-3 w-3" /> Restore
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function EnrichedRow({
  broker, companyId, onInvite, onMoved, onLeft, inviteLabel = "In company", inviteIcon: InviteIcon = UserPlus,
}: {
  broker: EnrichedBroker;
  companyId: string;
  onInvite: () => void;
  onMoved: (targetCompanyId: string) => void;
  onLeft: () => void;
  inviteLabel?: string;
  inviteIcon?: typeof UserPlus;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "moved">("menu");
  const [movedTo, setMovedTo] = useState<string>("");

  const otherCompanies = useMemo(
    () => COMPANIES.filter((c) => c.id !== companyId),
    [companyId]
  );

  function reset() { setMode("menu"); setMovedTo(""); }

  return (
    <li className="flex items-start gap-2 px-4 py-2">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-warning/15 text-[10px] font-semibold text-warning">
        {broker.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-brand-deep">{broker.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {broker.source} · {broker.listings} listing{broker.listings === 1 ? "" : "s"} · since {broker.since_year}
        </div>
        <BrokerProfileMeta profile={broker.profile} showLeads={false} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-sm border border-brand/40 bg-brand/10 px-1.5 py-1 text-[10px] font-semibold text-brand-deep transition hover:bg-brand/20"
              title="Update this broker's status"
            >
              <InviteIcon className="h-3 w-3" /> {inviteLabel}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            {mode === "menu" ? (
              <div className="flex flex-col gap-1">
                <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Update status
                </div>
                <button
                  type="button"
                  onClick={() => { onInvite(); setOpen(false); reset(); }}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-brand-deep hover:bg-brand/10"
                >
                  <UserPlus className="h-3.5 w-3.5 text-brand" />
                  Confirm at this company
                </button>
                <button
                  type="button"
                  onClick={() => setMode("moved")}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-accent"
                >
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Moved to another company
                </button>
                <button
                  type="button"
                  onClick={() => { onLeft(); setOpen(false); reset(); }}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <UserX className="h-3.5 w-3.5" />
                  No longer with the company
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Select new company
                </div>
                <Select value={movedTo} onValueChange={setMovedTo}>
                  <SelectTrigger className="h-8 text-xs" aria-label="Select the company this broker moved to">
                    <SelectValue placeholder="Choose a company" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {otherCompanies.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-end gap-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("menu")}
                    className="rounded-sm px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!movedTo}
                    onClick={() => { onMoved(movedTo); setOpen(false); reset(); }}
                    className="rounded-sm bg-brand px-2 py-1 text-[11px] font-semibold text-brand-foreground disabled:opacity-40 hover:bg-brand-deep"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </li>
  );
}

// ==========================================================
// Broker enrichment chips (specialties, size range, leads)
// ==========================================================
function BrokerProfileMeta({
  profile, showLeads = true,
}: { profile: BrokerProfile; showLeads?: boolean }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {profile.specialties.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded-sm bg-brand/8 px-2 py-0.5 text-[11px] font-medium text-brand-deep"
          title={`Boat specialty: ${s}`}
        >
          <BoatIcon className="h-3.5 w-3.5" aria-hidden="true" /> {s}
        </span>
      ))}
      <span
        className="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        title={`Typical listing size: ${profile.sizeRange}`}
      >
        <Ruler className="h-3.5 w-3.5" aria-hidden="true" /> {profile.sizeRange}
      </span>
      {showLeads && (
        <span
          className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-semibold ${
            profile.leadsFromYachtway > 0
              ? "bg-success/12 text-success"
              : "bg-muted text-muted-foreground"
          }`}
          title="Leads received from YachtWay on this broker's listings"
        >
          <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
          {profile.leadsFromYachtway} lead{profile.leadsFromYachtway === 1 ? "" : "s"} from YachtWay
        </span>
      )}
    </div>
  );
}
