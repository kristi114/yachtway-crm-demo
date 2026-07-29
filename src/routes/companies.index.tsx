import { formatDate } from "@/lib/format-date";
import { FIELD_OPTIONS, dynamicOptions } from "@/lib/field-options";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Filter, X, Plus } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { CompanyLogo } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import { CreateRecordDialog } from "@/components/create-record-dialog";
import { COMPANY_SECTIONS } from "@/lib/field-schema";
import { RecordFilterBar } from "@/components/record-filter-bar";
import { applyClauses, filterableFields, type FilterClause } from "@/lib/record-filter";
import { studioToursForCompany, useStudioTours } from "@/lib/studio-tours";
import { Video } from "lucide-react";
import {
  COMPANIES, contactsForCompany, addCompany, subscribeMockData, getMockDataVersion,
  type Vertical, type CompanyType, type CompanyStatus, type Company,
} from "@/lib/mock-data";
import type { CurrencyCode } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { useApiCompanyOverlay } from "@/lib/api/overlays";

const SERVICE_KEYS = ["saas", "studio", "live", "drive", "vato", "easyfund", "mastercover", "easyclose", "connectCrm", "customWebsite"] as const;
type ServiceKey = typeof SERVICE_KEYS[number];
const SERVICE_LABEL: Record<ServiceKey, string> = {
  saas: "SaaS",
  studio: "Studio",
  live: "LIVE",
  drive: "Drive",
  vato: "VATO",
  easyfund: "Loan applications",
  mastercover: "PFS",
  easyclose: "eNotary",
  connectCrm: "Connect CRM",
  customWebsite: "Custom Website",
};
// Not launched yet - hidden from service filters until available.
const UNAVAILABLE: Set<ServiceKey> = new Set(["connectCrm", "easyclose"]);
const VISIBLE_SERVICE_KEYS = SERVICE_KEYS.filter((k) => !UNAVAILABLE.has(k));
const COMING_SOON: Set<ServiceKey> = new Set();


const searchSchema = z.object({
  vertical: z.enum(["Main", "FinTech"]).optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  uses: z.string().optional(),        // csv of ServiceKey - dealer IS using
  notUses: z.string().optional(),     // csv of ServiceKey - dealer is NOT using
  maxBrokers: z.coerce.number().int().optional(),
  noListings: z.coerce.boolean().optional(),
  portalInactive: z.coerce.boolean().optional(), // never logged in OR >30d
  studioNever: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/companies/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: CompaniesList,
});

function csvToSet(csv: string | undefined): Set<ServiceKey> {
  if (!csv) return new Set();
  return new Set(
    csv.split(",").filter((v): v is ServiceKey => (SERVICE_KEYS as readonly string[]).includes(v)),
  );
}
function setToCsv(s: Set<ServiceKey>): string | undefined {
  return s.size ? Array.from(s).join(",") : undefined;
}
function daysSince(iso: string): number {
  if (!iso) return Infinity;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return Infinity;
  return (Date.now() - d) / (1000 * 60 * 60 * 24);
}

function fmtDate(iso: string): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  return formatDate(d);
}
function fmtAgo(iso: string): string {
  if (!iso) return "never";
  const days = Math.floor(daysSince(iso));
  if (!Number.isFinite(days)) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}


const TABS: { label: string; vertical?: Vertical; type?: CompanyType }[] = [
  { label: "All" },
  { label: "Shipyards", vertical: "Main", type: "Shipyard" },
  { label: "Dealers", vertical: "Main", type: "Dealer" },
  { label: "Brokerages", vertical: "Main", type: "Brokerage" },
  { label: "Lenders", vertical: "FinTech", type: "Lender" },
  { label: "Insurance", vertical: "FinTech", type: "Insurance Firm" },
];

function statusBadge(s: string) {
  const map: Record<string, string> = {
    // Canonical company_status (catalog)
    Lead: "bg-warning text-warning-foreground",
    MQL: "bg-brand/70 text-brand-foreground",
    SQL: "bg-brand text-brand-foreground",
    "Active Customer": "bg-success text-success-foreground",
    "Past Customer": "bg-muted text-muted-foreground",
    // Legacy / enriched values still present in data
    Member: "bg-brand text-brand-foreground",
    Customer: "bg-success text-success-foreground",
    Partner: "bg-brand text-brand-foreground",
    Prospect: "bg-muted text-muted-foreground",
  };
  return map[s] ?? "bg-secondary text-secondary-foreground";
}

function tierBadge(tier: string) {
  const map: Record<string, string> = {
    Platinum: "bg-brand text-brand-foreground",
    Gold: "bg-warning text-warning-foreground",
    Silver: "bg-muted text-muted-foreground",
    Bronze: "bg-muted text-muted-foreground",
    Prospect: "bg-secondary text-secondary-foreground",
  };
  return map[tier] ?? "bg-muted text-muted-foreground";
}

type SortKey = "name" | "companyType" | "status" | "dealerTier" | "location" | "location_count" | "broker_count" | "activeListings" | "contact_count" | "customWebsite" | "studio_tours";

// Deterministic derived "office locations" count for a company.
// Roughly scales with broker footprint; shipyards get 1, big brokerages get more.
function locationCount(c: typeof COMPANIES[number]): number {
  if (c.companyType === "Shipyard") return 1;
  const brokers = Math.max(c.crmBrokerCount, c.scrapedBrokerCount);
  if (brokers >= 20) return 4;
  if (brokers >= 12) return 3;
  if (brokers >= 5) return 2;
  return 1;
}

function CompaniesList() {
  const { user } = useAuth();
  const allowedVertical: Vertical | null =
    user.role === "sales_rep" ? "Main"
    : null; // fintech / marketing / admin see both verticals

  const search = Route.useSearch();
  const { vertical, type, status, uses, notUses, maxBrokers, noListings, portalInactive, studioNever } = search;
  const navigate = Route.useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [q, setQ] = useState("");
  const [clauses, setClauses] = useState<FilterClause[]>([]);
  const filterFields = useMemo(() => filterableFields(COMPANY_SECTIONS), []);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const routerNavigate = useNavigate();
  // Re-render when a new company is appended via the create dialog.
  useSyncExternalStore(subscribeMockData, getMockDataVersion, getMockDataVersion);
  useStudioTours();
  const { byId: apiById } = useApiCompanyOverlay();

  const usesSet = useMemo(() => csvToSet(uses), [uses]);
  const notUsesSet = useMemo(() => csvToSet(notUses), [notUses]);


  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const toggleService = (svc: ServiceKey, mode: "uses" | "notUses") => {
    const cur = mode === "uses" ? new Set(usesSet) : new Set(notUsesSet);
    const other = mode === "uses" ? new Set(notUsesSet) : new Set(usesSet);
    if (cur.has(svc)) cur.delete(svc);
    else { cur.add(svc); other.delete(svc); }
    navigate({
      to: "/companies",
      search: {
        ...search,
        uses: mode === "uses" ? setToCsv(cur) : setToCsv(other),
        notUses: mode === "notUses" ? setToCsv(cur) : setToCsv(other),
      },
    });
  };

  const activeFilterCount =
    usesSet.size + notUsesSet.size +
    (maxBrokers != null ? 1 : 0) +
    (noListings ? 1 : 0) +
    (portalInactive ? 1 : 0) +
    (studioNever ? 1 : 0);

  const rows = useMemo(() => {
    let list = COMPANIES;
    if (allowedVertical) list = list.filter((c) => c.vertical === allowedVertical);
    if (vertical) list = list.filter((c) => c.vertical === vertical);
    if (type) list = list.filter((c) => c.companyType === (type as CompanyType));
    if (status) list = list.filter((c) => c.status === (status as CompanyStatus));
    if (usesSet.size) list = list.filter((c) => Array.from(usesSet).every((k) => c.servicesUsed[k]));
    if (notUsesSet.size) list = list.filter((c) => Array.from(notUsesSet).every((k) => !c.servicesUsed[k]));
    if (maxBrokers != null) list = list.filter((c) => c.crmBrokerCount <= maxBrokers);
    if (noListings) list = list.filter((c) => (c.activeListings ?? 0) === 0);
    if (portalInactive) list = list.filter((c) => daysSince(c.lastLogin) >= 30);
    if (studioNever) list = list.filter((c) => !c.lastStudioSessionAt);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((c) =>
        [c.name, c.website, c.companyType, c.billingCity, c.billingCountry, c.status]
          .filter(Boolean).join(" ").toLowerCase().includes(needle),
      );
    }
    // Field-schema-driven advanced filters (any company field).
    list = applyClauses(list as unknown as Record<string, unknown>[], clauses, filterFields) as unknown as typeof list;
    const enriched = list.map((c) => {
      const tours = studioToursForCompany(c.id);
      const active = tours.filter((t) => t.status !== "expired");
      const nextExpiry = active.length
        ? active.reduce((min, t) => (t.days_until_expiry < min ? t.days_until_expiry : min), Infinity)
        : Infinity;
      // API overlay: when apps/api is online and returns this id, prefer its
      // canonical fields over the mock record.
      const api = apiById.get(c.id);
      const merged = api
        ? {
            ...c,
            name: api.name ?? c.name,
            website: api.website ?? c.website,
            phone: api.phone ?? c.phone,
            status: (api.companyStatus as CompanyStatus | null) ?? c.status,
            _fromApi: true as const,
          }
        : { ...c, _fromApi: false as const };
      return {
        ...merged,
        contact_count: contactsForCompany(c.id).length,
        studio_tours_count: tours.length,
        studio_next_expiry_days: nextExpiry,
      };
    });

    const getVal = (c: typeof enriched[number]): string | number => {
      switch (sortKey) {
        case "location": return [c.billingCity, c.billingCountry].filter(Boolean).join(", ");
        case "location_count": return locationCount(c);
        case "broker_count": return c.crmBrokerCount ?? 0;
        case "activeListings": return c.activeListings ?? 0;
        case "contact_count": return c.contact_count ?? 0;
        case "customWebsite": return c.customWebsiteEnabled ? 1 : 0;
        case "studio_tours": return c.studio_tours_count ?? 0;
        default: return (c[sortKey] ?? "") as string;
      }
    };
    const sorted = [...enriched].sort((a, b) => {
      const av = getVal(a); const bv = getVal(b);
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [allowedVertical, vertical, type, status, usesSet, notUsesSet, maxBrokers, noListings, portalInactive, studioNever, sortKey, sortDir, apiById, q, clauses, filterFields]);


  // Tabs follow the vertical the user actually opened (Companies vs Banks &
  // Lenders in the sidebar), plus any hard role restriction.
  const scopeVertical: Vertical | null = allowedVertical ?? vertical ?? null;
  const visibleTabs = TABS.filter(
    (t) => !scopeVertical || !t.vertical || t.vertical === scopeVertical,
  );
  const totalVisible = scopeVertical
    ? COMPANIES.filter((c) => c.vertical === scopeVertical).length
    : COMPANIES.length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Companies"
        title="All companies"
        subtitle={
          scopeVertical === "Main"
            ? `${totalVisible} yacht-industry accounts in your book`
            : scopeVertical === "FinTech"
              ? `${totalVisible} fintech accounts (banks & lenders) in your book`
              : `${totalVisible} accounts across both verticals`
        }
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New company
          </Button>
        }
      />
      <CreateRecordDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New company"
        description="All catalog fields are available - only Name is required."
        sections={COMPANY_SECTIONS}
        requiredKeys={["name"]}
        onSave={(values) => {
          const partial: Partial<Company> & { name: string } = {
            name: String(values.name ?? "").trim(),
          };
          // Best-effort map of catalog keys to Company shape (matching keys only).
          for (const [k, v] of Object.entries(values)) {
            if (v === "" || v === null || v === undefined) continue;
            if (k in ({} as Company) || [
              "vertical","name","companyType","companyStatus","status","website","phone","billingCity",
              "billingState","billingCountry","currency","dealerTier","primaryContactId",
              "ownerUserId","parentCompanyId","yachtwayDealerPage","lastContactedAt",
              "nextStep","nextStepDate",
            ].includes(k)) {
              (partial as Record<string, unknown>)[k] = v;
            }
          }
          if (typeof values.accountCurrency === "string") {
            partial.currency = values.accountCurrency as CurrencyCode;
          }
          if (typeof values.companyType === "string") {
            partial.companyType = values.companyType as CompanyType;
          }
          if (typeof values.companyStatus === "string") {
            partial.status = values.companyStatus as CompanyStatus;
          }
          const created = addCompany(partial);
          routerNavigate({ to: "/companies/$id", params: { id: created.id } });
        }}
      />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border">
          {visibleTabs.map((tab) => {
            // The "All" tab keeps the current vertical scope and only clears the type.
            const isAll = !tab.type;
            const active = isAll ? !type : tab.type === type;
            return (
              <button
                key={tab.label}
                onClick={() =>
                  navigate({
                    to: "/companies",
                    search: {
                      ...search,
                      vertical: isAll ? (scopeVertical ?? undefined) : tab.vertical,
                      type: tab.type,
                    },
                  })
                }
                className={`border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  active
                    ? "border-brand text-brand-deep"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-1 py-2 text-xs">
            {dynamicOptions(FIELD_OPTIONS.companyStatus, ...COMPANIES.map((c) => c.status)).map((s) => {
              const active = status === s;
              return (
                <button
                  key={s}
                  onClick={() =>
                    navigate({
                      to: "/companies",
                      search: { ...search, status: active ? undefined : s },
                    })
                  }
                  className={`rounded-sm px-2 py-1 text-[11px] font-medium uppercase tracking-wide ${
                    active ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`ml-2 inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                activeFilterCount > 0 || filtersOpen
                  ? "bg-brand text-brand-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              <Filter className="h-3 w-3" />
              Feature filters
              {activeFilterCount > 0 && (
                <span className="rounded-sm bg-brand-foreground/20 px-1 tabular-nums">{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>

        <RecordFilterBar
          fields={filterFields}
          query={q}
          onQueryChange={setQ}
          clauses={clauses}
          onClausesChange={setClauses}
          searchPlaceholder="Search name, website, city…"
        />

        {filtersOpen && (
          <div className="mb-3 rounded-sm border border-border bg-surface p-3 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Has activated
                </div>
                <div className="flex flex-wrap gap-1">
                  {VISIBLE_SERVICE_KEYS.map((svc) => {
                    const on = usesSet.has(svc);
                    const soon = COMING_SOON.has(svc);
                    return (
                      <button
                        key={svc}
                        type="button"
                        disabled={soon}
                        title={soon ? "Coming soon" : undefined}
                        onClick={() => toggleService(svc, "uses")}
                        className={`rounded-sm px-2 py-1 text-[11px] font-medium ${
                          soon
                            ? "cursor-not-allowed border border-dashed border-border bg-muted/50 text-muted-foreground/70"
                            : on
                              ? "bg-success text-success-foreground"
                              : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {SERVICE_LABEL[svc]}
                        {soon && <span className="ml-1 opacity-70">(soon)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Has NOT used
                </div>
                <div className="flex flex-wrap gap-1">
                  {VISIBLE_SERVICE_KEYS.map((svc) => {
                    const on = notUsesSet.has(svc);
                    const soon = COMING_SOON.has(svc);
                    return (
                      <button
                        key={svc}
                        type="button"
                        disabled={soon}
                        title={soon ? "Coming soon" : undefined}
                        onClick={() => toggleService(svc, "notUses")}
                        className={`rounded-sm px-2 py-1 text-[11px] font-medium ${
                          soon
                            ? "cursor-not-allowed border border-dashed border-border bg-muted/50 text-muted-foreground/70"
                            : on
                              ? "bg-warning text-warning-foreground"
                              : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {SERVICE_LABEL[svc]}
                        {soon && <span className="ml-1 opacity-70">(soon)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Activity & coverage
                </div>
                <label className="flex items-center gap-2 text-[13px]">
                  <span className="text-muted-foreground">Max CRM brokers</span>
                  <input
                    type="number"
                    min={0}
                    value={maxBrokers ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      navigate({
                        to: "/companies",
                        search: { ...search, maxBrokers: v === "" ? undefined : Number(v) },
                      });
                    }}
                    className="w-20 rounded-sm border border-border bg-background px-2 py-1 text-[13px] tabular-nums"
                    placeholder="-"
                  />
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={!!noListings}
                    onChange={(e) =>
                      navigate({ to: "/companies", search: { ...search, noListings: e.target.checked || undefined } })
                    }
                  />
                  <span>No active listings</span>
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={!!portalInactive}
                    onChange={(e) =>
                      navigate({ to: "/companies", search: { ...search, portalInactive: e.target.checked || undefined } })
                    }
                  />
                  <span>Portal inactive 30+ days</span>
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={!!studioNever}
                    onChange={(e) =>
                      navigate({ to: "/companies", search: { ...search, studioNever: e.target.checked || undefined } })
                    }
                  />
                  <span>Never used Studio</span>
                </label>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[12px] text-muted-foreground">
                <span>{rows.length} of {COMPANIES.length} companies match</span>
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/companies",
                      search: { vertical, type, status },
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-sm px-2 py-1 font-medium text-brand hover:bg-accent"
                >
                  <X className="h-3 w-3" /> Clear feature filters
                </button>
              </div>
            )}
          </div>
        )}


        <div className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
          <table className="w-full text-[13px]">
            <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {([
                  ["name", "Company", "left"],
                  ["companyType", "Type", "left"],
                  ["status", "Status", "left"],
                  ["dealerTier", "Dealer Tier", "left"],
                  ["customWebsite", "Custom Website", "left"],
                  ["location", "Location", "left"],
                  ["location_count", "Locations", "right"],
                  ["broker_count", "Brokers", "right"],
                  ["activeListings", "Listings", "right"],
                  ["contact_count", "Contacts", "right"],
                  ["studio_tours", "3D Tours", "right"],
                ] as [SortKey, string, "left" | "right"][]).map(([key, label, align]) => {
                  const active = sortKey === key;
                  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <th key={key} className={`px-3 py-2 font-semibold ${align === "right" ? "text-right" : ""}`}>
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground ${active ? "text-foreground" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}
                      >
                        <span>{label}</span>
                        <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <CompanyLogo company={c} size="sm" />
                      <Link
                        to="/companies/$id" params={{ id: c.id }}
                        className="font-medium text-brand hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.enrichedFromAws && !["Customer", "Partner"].includes(c.status) && (
                        <span className="ml-1 rounded-sm bg-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Enriched
                        </span>
                      )}
                    </div>
                    {activeFilterCount > 0 && (() => {
                      const chips: { label: string; tone: "ok" | "warn" | "muted" }[] = [];
                      for (const svc of usesSet) {
                        if (svc === "studio") {
                          chips.push({ label: `Studio · last ${fmtAgo(c.lastStudioSessionAt)}`, tone: c.lastStudioSessionAt ? "ok" : "warn" });
                        } else if (svc === "saas") {
                          chips.push({ label: `SaaS · portal ${fmtAgo(c.lastLogin)}`, tone: c.lastLogin ? "ok" : "warn" });
                        } else if (svc === "customWebsite") {
                          chips.push({ label: `Custom Website · ${c.customWebsiteEnabled ? "active" : "not active"}`, tone: c.customWebsiteEnabled ? "ok" : "warn" });
                        } else {
                          chips.push({ label: `${SERVICE_LABEL[svc]} · activated`, tone: "ok" });
                        }
                      }
                      for (const svc of notUsesSet) {
                        chips.push({ label: `No ${SERVICE_LABEL[svc]}`, tone: "warn" });
                      }
                      if (maxBrokers != null) chips.push({ label: `${c.crmBrokerCount} broker${c.crmBrokerCount === 1 ? "" : "s"}`, tone: "muted" });
                      if (noListings) chips.push({ label: `${c.activeListings ?? 0} listings`, tone: "warn" });
                      if (portalInactive) chips.push({ label: `Portal ${fmtAgo(c.lastLogin)}`, tone: "warn" });
                      if (studioNever) chips.push({ label: `Studio · ${fmtDate(c.lastStudioSessionAt)}`, tone: "warn" });
                      if (!chips.length) return null;
                      return (
                        <div className="mt-1 flex flex-wrap gap-1 pl-8">
                          {chips.map((chip, i) => (
                            <span
                              key={i}
                              className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${
                                chip.tone === "ok"
                                  ? "bg-success/15 text-success"
                                  : chip.tone === "warn"
                                    ? "bg-warning/20 text-warning-foreground"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </td>

                  <td className="px-3 py-2 text-muted-foreground">{c.companyType}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadge(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tierBadge(c.dealerTier)}`}>
                      {c.dealerTier}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {c.customWebsiteEnabled ? (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                        Yes
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {[c.billingCity, c.billingCountry].filter(Boolean).join(", ")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{locationCount(c)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.crmBrokerCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.activeListings}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.contact_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.studio_tours_count > 0 ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="inline-flex items-center gap-1 font-medium text-brand-deep">
                          <Video className="h-3 w-3 text-brand" />
                          {c.studio_tours_count}
                        </span>
                        {Number.isFinite(c.studio_next_expiry_days) && (
                          <span
                            className={`text-[10px] ${
                              c.studio_next_expiry_days < 0
                                ? "text-destructive"
                                : c.studio_next_expiry_days <= 30
                                  ? "text-warning"
                                  : "text-muted-foreground"
                            }`}
                            title="Days until nearest 3D Tour storage renewal charge"
                          >
                            {c.studio_next_expiry_days < 0
                              ? `expired ${Math.abs(c.studio_next_expiry_days)}d`
                              : c.studio_next_expiry_days === 0
                                ? "renews today"
                                : `${c.studio_next_expiry_days}d to charge`}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No companies match your filters
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageBody>
    </AppShell>
  );
}

// Re-export for other components using the badge helper if needed
export { statusBadge as _statusBadge };
