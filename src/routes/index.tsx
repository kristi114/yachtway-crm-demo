import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Users, Building2, Briefcase, ArrowRight, Wallet, Clock, AlertTriangle, TrendingUp, Sparkles, Sunrise, Target, Flame, LogIn, Camera, PackageOpen, Boxes, Rocket, Snowflake, Flame as FlameHot, Video, Radio, Layout, Info } from "lucide-react";
import { BoatIcon } from "@/components/icons/boat-icon";


import { AppShell } from "@/components/app-shell";
import { PageBody } from "@/components/page-header";
import { useAuth, useMoney, ROLE_LABELS, DEMO_USER_LIST, isPartnerRole, type Role } from "@/lib/auth";
import { TargetsPanel } from "@/components/targets-panel";
import { RepActivityPanel } from "@/components/rep-activity-panel";
import { StudioBookingsPanel } from "@/components/studio-bookings-panel";
import { ScreenshotLogPanel } from "@/components/screenshot-log-panel";
import { CompanyOverviewPanel } from "@/components/company-overview-panel";
import { ServicesRevenuePanel } from "@/components/services-revenue-panel";
import { FintechRevenuePanel } from "@/components/fintech-revenue-panel";
import { WeeklyReportHeroPill } from "@/components/weekly-report-hero-pill";
import { WeeklyReportsAdminPanel } from "@/components/weekly-reports-admin-panel";
import { MovableSection, useDashboardOrder, DashboardLayoutToolbar } from "@/components/sortable-sections";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  CONTACTS, COMPANIES, LISTINGS, OPPORTUNITIES, STUDIO_BOOKINGS, LOAN_APPLICATIONS,
  companiesOwnedBy, listingsForCompany, daysSince,
  bookInsights, computeDealerScore, TIER_STYLES,
  type Company, type ScoreTier,
} from "@/lib/mock-data";
import { formatDate } from "@/lib/format-date";
import { MyTasksPanel } from "@/components/my-tasks-panel";


export const Route = createFileRoute("/")({
  component: Home,
});

// Kept for backwards compatibility - unused now that fmt() comes from useMoney.
function _fmtCompactUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}
void _fmtCompactUSD;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Return the US state with the most companies in the list, or undefined. */
function pickTopState(companies: Company[]): string | undefined {
  const counts = new Map<string, number>();
  for (const c of companies) {
    if (!c.billingState) continue;
    counts.set(c.billingState, (counts.get(c.billingState) ?? 0) + 1);
  }
  let best: string | undefined; let n = 0;
  for (const [s, k] of counts) if (k > n) { best = s; n = k; }
  return best;
}


function Home() {
  const { user } = useAuth();
  if (isPartnerRole(user.role)) return <PartnerHome role={user.role} />;
  if (user.role === "sales_rep") return <SalesRepHome userId={user.id} name={user.name} />;
  if (user.role === "marketing") return <MarketingHome name={user.name} />;
  if (user.role === "fintech") return <FintechHome name={user.name} />;
  return <GenericHome />;
}

/** Partner logins have no CRM home — send them to their scoped dashboard. */
function PartnerHome({ role }: { role: Role }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: role === "insurance_partner" ? "/insurance" : "/lender" });
  }, [role, navigate]);
  return null;
}

// ==========================================================
// Marketing dashboard - upcoming dealer shoots only, no financials
// ==========================================================
function MarketingHome({ name }: { name: string }) {
  const shoots = [...STUDIO_BOOKINGS]
    .filter((b) => new Date(b.scheduledAt).getTime() >= Date.now() - 3_600_000)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });

  return (
    <AppShell>
      <PageBody>
        <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand/90 via-brand-deep to-[oklch(0.28_0.12_290)] px-6 py-8 text-brand-foreground shadow-lg md:px-10">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-brand-foreground/70">
            <Camera className="h-3.5 w-3.5" /> {greeting()}
          </div>
          <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Welcome back, {name.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-brand-foreground/75">
            Your shoot schedule: dates, vessels, locations and on-site contacts.
          </p>
        </section>

        <div className="mt-6">
          <MyTasksPanel />
        </div>

        <section className="mt-6 overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-brand" />
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                Upcoming dealer shoots
              </h2>
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {shoots.length}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Sorted soonest first</span>
          </header>

          {shoots.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No upcoming shoots scheduled.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {shoots.map((b) => {
                const co = COMPANIES.find((c) => c.id === b.companyId);
                return (
                  <li key={b.id} className="grid grid-cols-1 gap-2 px-4 py-3 text-[13px] md:grid-cols-[1.4fr_1fr_1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-medium">
                        <BoatIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{b.vessel}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {co?.name ?? "Unknown dealer"} · {b.package}
                      </div>
                    </div>

                    <div className="min-w-0 text-xs">
                      <div className="font-medium text-foreground">{fmtWhen(b.scheduledAt)}</div>
                      <div className="mt-0.5 text-muted-foreground">{b.durationHours}h on site</div>
                    </div>

                    <div className="min-w-0 text-xs">
                      <div className="truncate font-medium text-foreground">{b.location}</div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {b.photographer}
                        {b.crew.length ? ` · ${b.crew.join(", ")}` : ""}
                      </div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {b.contactName} · {b.contactPhone}
                      </div>
                    </div>

                    <div className="flex items-start md:justify-end">
                      <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                        {b.status}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </PageBody>
    </AppShell>
  );
}

// ==========================================================
// Fintech dashboard - open fintech pipeline, new pre-qual leads,
// and dealers not yet referring into YachtWay EasyFund
// ==========================================================
const CLOSED_STAGES = ["Closed Won", "Closed Lost", "Won", "Lost", "Funded", "Declined"];

function FintechHome({ name }: { name: string }) {
  const { format: fmt, formatCompact } = useMoney();

  // 1. Open fintech opportunities (EasyFund + MasterCover pipelines)
  const openOpps = OPPORTUNITIES
    .filter((o) => (o.pipeline === "EasyFund" || o.pipeline === "MasterCover") && !CLOSED_STAGES.includes(o.stage))
    .sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  const openValue = openOpps.reduce((s, o) => s + o.amountUsd, 0);

  // 2. New leads for pre-qualification - applications still early in the funnel
  const prequalLeads = LOAN_APPLICATIONS
    .filter((l) => ["Started", "Prequalified", "Docs Requested"].includes(l.stage))
    .sort((a, b) => b.estimatedQualification - a.estimatedQualification);

  // 3. Dealers / brokerages not using EasyFund
  const nonEasyFund = COMPANIES
    .filter((c) => c.vertical === "Main")
    .filter((c) => c.companyType === "Dealer" || c.companyType === "Brokerage")
    .filter((c) => !c.servicesUsed.easyfund)
    .sort((a, b) => b.activeListings - a.activeListings);

  const kpis = [
    { label: "Open fintech pipeline", value: formatCompact(openValue), icon: Briefcase, hint: `${openOpps.length} open deals` },
    { label: "New pre-qual leads", value: String(prequalLeads.length), icon: Wallet, hint: "Started / Prequalified / Docs" },
    { label: "Dealers without EasyFund", value: String(nonEasyFund.length), icon: Building2, hint: "Referral opportunity" },
  ];

  return (
    <AppShell>
      <PageBody>
        <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand/90 via-brand-deep to-[oklch(0.28_0.12_290)] px-6 py-8 text-brand-foreground shadow-lg md:px-10">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-brand-foreground/70">
            <Wallet className="h-3.5 w-3.5" /> {greeting()}
          </div>
          <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Welcome back, {name.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-brand-foreground/75">
            Open fintech deals, fresh pre-qualification leads, and dealers not yet referring into EasyFund.
          </p>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-sm border border-border bg-surface px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <k.icon className="h-3.5 w-3.5 text-brand" /> {k.label}
              </div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.hint}</div>
            </div>
          ))}
        </section>

        <div className="mt-6">
          <MyTasksPanel />
        </div>

        <FintechRevenuePanel />

        {/* Open fintech opportunities */}
        <FintechSection
          icon={Briefcase}
          title="Open fintech opportunities"
          count={openOpps.length}
          meta="EasyFund & MasterCover · soonest close first"
          empty="No open fintech opportunities."
        >
          {openOpps.map((o) => {
            const co = o.companyId ? COMPANIES.find((c) => c.id === o.companyId) : undefined;
            const ct = o.contactId ? CONTACTS.find((c) => c.id === o.contactId) : undefined;
            return (
              <li key={o.id} className="grid grid-cols-1 items-center gap-2 px-4 py-3 text-[13px] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_120px]">
                <div className="min-w-0">
                  <Link to="/opportunities/$id" params={{ id: o.id }} className="font-medium hover:underline">
                    {o.name}
                  </Link>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {co?.name ?? (ct ? `${ct.firstName} ${ct.lastName}` : "Unlinked")} · {o.pipeline}
                  </div>
                </div>
                <div className="min-w-0 text-xs">
                  <div className="truncate font-medium text-foreground">{o.stage}</div>
                  <div className="mt-0.5 text-muted-foreground">{o.probability}% probability</div>
                </div>
                <div className="min-w-0 text-xs">
                  <div className="font-medium tabular-nums text-foreground">{fmt(o.amountUsd)}</div>
                  <div className="mt-0.5 text-muted-foreground">
                    {o.closeDate ? `Close ${formatDate(o.closeDate)}` : "No close date"}
                  </div>
                </div>
                <div className="flex items-start md:justify-end">
                  <span className="max-w-full truncate rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                    {o.owner}
                  </span>
                </div>
              </li>
            );
          })}
        </FintechSection>

        {/* New pre-qual leads */}
        <FintechSection
          icon={Wallet}
          title="New leads for pre-qualification"
          count={prequalLeads.length}
          meta="Highest estimated qualification first"
          empty="No new pre-qualification leads."
        >
          {prequalLeads.map((l) => {
            const ct = CONTACTS.find((c) => c.id === l.contactId);
            const bank = l.bankCompanyId ? COMPANIES.find((c) => c.id === l.bankCompanyId) : undefined;
            return (
              <li key={l.id} className="grid grid-cols-1 gap-2 px-4 py-3 text-[13px] md:grid-cols-[1.4fr_1fr_1fr_auto]">
                <div className="min-w-0">
                  {ct ? (
                    <Link to="/contacts/$id" params={{ id: ct.id }} className="font-medium hover:underline">
                      {ct.firstName} {ct.lastName}
                    </Link>
                  ) : (
                    <span className="font-medium">Unknown applicant</span>
                  )}
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{ct?.email ?? "—"}</div>
                </div>
                <div className="text-xs">
                  <div className="font-medium tabular-nums text-foreground">{fmt(l.estimatedQualification)}</div>
                  <div className="mt-0.5 text-muted-foreground">Credit {l.creditScore}</div>
                </div>
                <div className="text-xs">
                  <div className="font-medium text-foreground">
                    {fmt(l.monthlyPaymentMin)}–{fmt(l.monthlyPaymentMax)}/mo
                  </div>
                  <div className="mt-0.5 truncate text-muted-foreground">{bank?.name ?? "No lender assigned"}</div>
                </div>
                <div className="flex items-start md:justify-end">
                  <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                    {l.stage}
                  </span>
                </div>
              </li>
            );
          })}
        </FintechSection>

        {/* Dealers not using EasyFund */}
        <FintechSection
          icon={AlertTriangle}
          title="Dealers not using YachtWay EasyFund"
          count={nonEasyFund.length}
          meta="Most active listings first"
          empty="Every dealer is on EasyFund."
        >
          {nonEasyFund.map((c) => (
            <li key={c.id} className="grid grid-cols-1 gap-2 px-4 py-3 text-[13px] md:grid-cols-[1.6fr_1fr_1fr_auto]">
              <div className="min-w-0">
                <Link to="/companies/$id" params={{ id: c.id }} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {c.companyType} · {[c.billingCity, c.billingState].filter(Boolean).join(", ") || "—"}
                </div>
              </div>
              <div className="text-xs">
                <div className="font-medium tabular-nums text-foreground">{c.activeListings} listings</div>
                <div className="mt-0.5 text-muted-foreground">{c.status}</div>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">
                  {c.servicesUsed.mastercover ? "Uses MasterCover" : "No fintech services"}
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  {c.lastContactedAt ? `Last contact ${c.lastContactedAt}` : "Never contacted"}
                </div>
              </div>
              <div className="flex items-start md:justify-end">
                <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  EasyFund gap
                </span>
              </div>
            </li>
          ))}
        </FintechSection>
      </PageBody>
    </AppShell>
  );
}

function FintechSection({
  icon: Icon, title, count, meta, empty, children,
}: {
  icon: typeof Wallet;
  title: string;
  count: number;
  meta: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand" />
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">{title}</h2>
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {count}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{meta}</span>
      </header>
      {count === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </section>
  );
}


// ==========================================================
// Sales rep dashboard - inspiring, visual, glanceable
// ==========================================================
function SalesRepHome({ userId, name }: { userId: string; name: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const { formatCompact: fmt } = useMoney();

  const myCompanies = companiesOwnedBy(userId);
  const myMain = myCompanies.filter((c) => c.vertical === "Main");

  const myListings = myCompanies.flatMap((c) => listingsForCompany(c.id));
  const myActiveListings = myListings.filter((l) => l.status === "Active").length;

  const brokersCrm = myMain.reduce((s, c) => s + c.crmBrokerCount, 0);
  const brokersScraped = myMain.reduce((s, c) => s + c.scrapedBrokerCount, 0);
  const brokerGap = Math.max(0, brokersScraped - brokersCrm);

  const myOpps = OPPORTUNITIES.filter(
    (o) => o.companyId && myCompanies.some((c) => c.id === o.companyId),
  );
  const pipelineValue = myOpps.reduce((s, o) => s + o.amountUsd, 0);

  // Pipeline by stage
  const stageBuckets = myOpps.reduce<Record<string, { count: number; value: number }>>((acc, o) => {
    const key = o.stage;
    if (!acc[key]) acc[key] = { count: 0, value: 0 };
    acc[key].count += 1;
    acc[key].value += o.amountUsd;
    return acc;
  }, {});
  const stageOrder = ["Discovery", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
  const stages = stageOrder
    .filter((s) => stageBuckets[s])
    .map((s) => ({ name: s, ...stageBuckets[s] }));
  const maxStageValue = Math.max(1, ...stages.map((s) => s.value));

  // Focus for today - prioritized action items
  const focus = [
    ...myCompanies
      .filter((c) => c.status !== "Prospect")
      .map((c) => ({
        kind: "stale" as const,
        company: c,
        priority: daysSince(c.lastContactedAt),
      }))
      .filter((f) => f.priority > 21),
    ...myMain
      .filter((c) => (c.companyType === "Dealer" || c.companyType === "Brokerage") && !c.lastLogin)
      .map((c) => ({ kind: "portal" as const, company: c, priority: 40 })),
    ...myMain
      .filter((c) => c.servicesUsed.studio && c.lastStudioSessionAt && daysSince(c.lastStudioSessionAt) > 28)
      .map((c) => ({ kind: "studio" as const, company: c, priority: daysSince(c.lastStudioSessionAt) })),
  ]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);

  // Fake 12-week activity trend derived from account count for a sparkline
  const trend = Array.from({ length: 12 }, (_, i) => {
    const seed = (myCompanies.length + 3) * (i + 1);
    return 8 + Math.round(Math.sin(seed) * 4 + (i * 0.6));
  });

  // Data-driven book insights (scoped to this rep)
  const insights = bookInsights(myCompanies);
  const topStudioState = pickTopState(insights.neverStudio) ?? "FL";
  const neverStudioInTopState = insights.neverStudioInState(topStudioState);

  const hasSignals =
    insights.noPortalLogin30d.length > 0 ||
    neverStudioInTopState.length > 0 ||
    insights.neverStudio.length > 0 ||
    insights.studioLapsed4w.length > 0 ||
    insights.noListings.length > 0 ||
    insights.activatedLast7dNoListing.length + insights.activatedLast7dNoBrokers.length > 0 ||
    insights.noThreeDTours.length > 0 ||
    insights.neverLive.length > 0;

  const firstName = name.split(" ")[0];


  return (
    <AppShell>
      <PageBody>
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-2xl border border-border px-6 py-8 text-white shadow-lg md:px-10 md:py-10"
          style={{
            background:
              "linear-gradient(135deg, #3a1878 0%, #23094d 46%, #17063a 100%)",
          }}
        >

          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-brand-foreground/70">
                <Sunrise className="h-3.5 w-3.5" />
                {greeting()}
              </div>
              <h1 className="mt-2 text-3xl font-semibold leading-tight md:text-4xl">
                {firstName}, {focus.length > 0
                  ? <>you have <span className="text-white">{focus.length}</span> accounts to follow up on today.</>
                  : <>your book is in great shape today.</>}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-brand-foreground/75">
                {myCompanies.length} accounts · {fmt(pipelineValue)} in open pipeline · {myActiveListings} active listings live right now.
              </p>
              <WeeklyReportHeroPill userId={userId} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/opportunities"
                className="inline-flex items-center gap-2 rounded-lg bg-white/95 px-4 py-2 text-sm font-semibold text-brand-deep shadow-sm transition hover:bg-white"
              >
                <Target className="h-4 w-4" /> Open pipeline
              </Link>
              <Link
                to="/companies"
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-brand-foreground/90 transition hover:bg-white/10"
              >
                My accounts <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setIsEditing((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition ${
                  isEditing
                    ? "bg-white/20 text-white hover:bg-white/30"
                    : "border border-white/30 text-brand-foreground/90 hover:bg-white/10"
                }`}
              >
                <Layout className="h-4 w-4" />
                {isEditing ? "Done editing" : "Edit dashboard view"}
              </button>
            </div>

          </div>
        </section>

        <div className="mt-6">
          <MyTasksPanel />
        </div>

        {/* KPI row */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Pipeline value"
            value={fmt(pipelineValue)}
            sub={`${myOpps.length} open opps`}
            icon={TrendingUp}
            accent="brand"
            trend={trend}
            to="/opportunities"
          />
          <KpiCard
            label="Active listings"
            value={myActiveListings}
            sub={`${myListings.length} total`}
            icon={BoatIcon}
            accent="success"
            to="/listings"
          />
          <KpiCard
            label="Broker coverage"
            value={`${Math.round((brokersCrm / Math.max(1, brokersScraped)) * 100)}%`}
            sub={`${brokersCrm} of ${brokersScraped} in CRM`}
            icon={Users}
            accent={brokerGap > 0 ? "warning" : "success"}
            to="/contacts"
            tooltip="Share of scraped brokers that already exist as contacts in your CRM. 100% means every broker found is tracked."
          />
          <KpiCard
            label="Needs attention"
            value={focus.length}
            sub={focus.length ? "prioritized below" : "all caught up"}
            icon={Flame}
            accent={focus.length ? "warning" : "success"}
            to="/companies"
          />
        </div>

        {/* Reorderable dashboard sections */}
        <DashboardSections
          userId={userId}
          name={name}
          myCompanies={myCompanies}
          myMain={myMain}
          myOpps={myOpps}
          pipelineValue={pipelineValue}
          stages={stages}
          maxStageValue={maxStageValue}
          focus={focus}
          insights={insights}
          neverStudioInTopState={neverStudioInTopState}
          topStudioState={topStudioState}
          hasSignals={hasSignals}
          brokersCrm={brokersCrm}
          brokersScraped={brokersScraped}
          isEditing={isEditing}
        />

      </PageBody>
    </AppShell>
  );
}

// ==========================================================
// Reorderable section container for the sales rep dashboard
// ==========================================================
type SalesRepSectionsProps = {
  userId: string;
  name: string;
  myCompanies: Company[];
  myMain: Company[];
  myOpps: typeof OPPORTUNITIES;
  pipelineValue: number;
  stages: { name: string; count: number; value: number }[];
  maxStageValue: number;
  focus: { kind: "stale" | "portal" | "studio"; company: Company; priority: number }[];
  insights: ReturnType<typeof bookInsights>;
  neverStudioInTopState: Company[];
  topStudioState: string;
  hasSignals: boolean;
  brokersCrm: number;
  brokersScraped: number;
  isEditing: boolean;
};


function DashboardSections(props: SalesRepSectionsProps) {
  const {
    userId, name, myCompanies, myMain, myOpps, pipelineValue, stages, maxStageValue,
    focus, insights, neverStudioInTopState, topStudioState, hasSignals,
    brokersCrm, brokersScraped, isEditing,
  } = props;

  const { formatCompact: fmt } = useMoney();

  const sections: { id: string; node: React.ReactNode }[] = [
    {
      id: "targets",
      node: <TargetsPanel userId={userId} userName={name} />,
    },
    {
      id: "pipeline-focus",
      node: (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Pipeline by stage */}
          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <header className="flex items-center justify-between px-5 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-brand-deep">Pipeline by stage</h3>
                <p className="text-xs text-muted-foreground">Where your open opportunities sit today</p>
              </div>
              <Link to="/opportunities" className="text-xs font-medium text-brand hover:underline">
                Details
              </Link>
            </header>
            <div className="space-y-3 px-5 py-5">
              {stages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No open opportunities yet.</p>
              ) : (
                stages.map((s, i) => {
                  const pct = (s.value / maxStageValue) * 100;
                  const hue = 300 - i * 12;
                  return (
                    <div key={s.name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{s.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {s.count} · <span className="font-semibold text-brand-deep">{fmt(s.value)}</span>
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-secondary/60">
                        <div
                          className="h-full rounded-full transition-[width] duration-700"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, oklch(0.55 0.18 ${hue}), oklch(0.42 0.16 ${hue - 10}))`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {myOpps.length > 0 && (() => {
              const STAGE_PROB: Record<string, number> = {
                Discovery: 0.1, Qualified: 0.25, Prequalified: 0.3,
                "Proposal Sent": 0.4, Proposal: 0.4, Underwriting: 0.55,
                Negotiation: 0.7, "Closed Won": 1, "Closed Lost": 0,
              };
              const weighted = myOpps.reduce(
                (s, o) => s + o.amountUsd * (STAGE_PROB[o.stage] ?? 0.3), 0,
              );
              const avg = pipelineValue / myOpps.length;
              const largest = myOpps.reduce((a, b) => (a.amountUsd > b.amountUsd ? a : b));
              const now = Date.now();
              const thirty = now + 30 * 24 * 60 * 60 * 1000;
              const closingSoon = myOpps
                .filter((o) => {
                  const t = new Date(o.closeDate).getTime();
                  return t >= now && t <= thirty && !o.stage.startsWith("Closed");
                })
                .sort((a, b) => +new Date(a.closeDate) - +new Date(b.closeDate));
              const closingSoonValue = closingSoon.reduce((s, o) => s + o.amountUsd, 0);

              return (
                <>
                  <div className="grid grid-cols-3 divide-x divide-border border-t border-border bg-muted/30">
                    <div className="px-4 py-3">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Weighted forecast</div>
                      <div className="mt-1 text-base font-semibold text-brand-deep tabular-nums">{fmt(weighted)}</div>
                    </div>
                    <div className="px-4 py-3">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Avg deal</div>
                      <div className="mt-1 text-base font-semibold text-brand-deep tabular-nums">{fmt(avg)}</div>
                    </div>
                    <div className="px-4 py-3">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Largest</div>
                      <div className="mt-1 text-base font-semibold text-brand-deep tabular-nums">{fmt(largest.amountUsd)}</div>
                    </div>
                  </div>

                  <div className="border-t border-border px-5 py-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-brand-deep">Closing in the next 30 days</div>
                        <div className="text-[11px] text-muted-foreground">
                          {closingSoon.length} deal{closingSoon.length === 1 ? "" : "s"} · {fmt(closingSoonValue)}
                        </div>
                      </div>
                      <Link to="/opportunities" className="text-[11px] font-medium text-brand hover:underline">
                        Plan close
                      </Link>
                    </div>
                    {closingSoon.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No deals scheduled to close in the next 30 days.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {closingSoon.slice(0, 3).map((o) => {
                          const days = Math.max(0, Math.round((+new Date(o.closeDate) - now) / 86400000));
                          const company = myCompanies.find((c) => c.id === o.companyId);
                          return (
                            <li key={o.id} className="flex items-center justify-between rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-foreground">{company?.name ?? "Account"}</div>
                                <div className="text-[11px] text-muted-foreground">{o.stage} · in {days}d</div>
                              </div>
                              <span className="ml-2 shrink-0 font-semibold tabular-nums text-brand-deep">
                                {fmt(o.amountUsd)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              );
            })()}
          </section>

          {/* Focus for today */}
          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <header className="flex items-center justify-between px-5 pt-5">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
                  <Sparkles className="h-4 w-4 text-brand" /> Focus for today
                </h3>
                <p className="text-xs text-muted-foreground">Ranked by urgency across your book</p>
              </div>
            </header>
            <ul className="mt-3 divide-y divide-border">
              {focus.length === 0 ? (
                <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                  Nothing urgent - great time to prospect.
                </li>
              ) : (
                focus.map((f) => <FocusItem key={`${f.kind}-${f.company.id}`} kind={f.kind} company={f.company} priority={f.priority} />)
              )}
            </ul>
          </section>
        </div>
      ),
    },
    ...(hasSignals ? [{
      id: "signals",
      node: (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-sm font-semibold text-brand-deep">Signals from your book</h2>
              <p className="text-xs text-muted-foreground">
                Concrete moves you can make today, computed from real dealer activity.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insights.noPortalLogin30d.length > 0 && (
              <InsightCard
                icon={LogIn}
                tone="warning"
                headline={`${insights.noPortalLogin30d.length} dealer${insights.noPortalLogin30d.length === 1 ? "" : "s"} haven't logged into YachtWay in 30 days`}
                detail="Ping them before they slip further. A friendly nudge often re-activates the account."
                sample={insights.noPortalLogin30d.slice(0, 3)}
              />
            )}
            {(neverStudioInTopState.length > 0 || insights.neverStudio.length > 0) && (
              <InsightCard
                icon={Camera}
                tone="warning"
                headline={
                  neverStudioInTopState.length > 0
                    ? `${neverStudioInTopState.length} dealer${neverStudioInTopState.length === 1 ? "" : "s"} in ${topStudioState} have never used YachtWay Studio`
                    : `${insights.neverStudio.length} dealer${insights.neverStudio.length === 1 ? "" : "s"} have never used Studio`
                }
                detail="Book a discovery shoot - a single session usually lifts listing views by 3x."
                sample={(neverStudioInTopState.length > 0 ? neverStudioInTopState : insights.neverStudio).slice(0, 3)}
              />
            )}
            {insights.studioLapsed4w.length > 0 && (
              <InsightCard
                icon={Clock}
                tone="warning"
                headline={`${insights.studioLapsed4w.length} dealer${insights.studioLapsed4w.length === 1 ? "" : "s"} haven't booked Studio in 4+ weeks`}
                detail="Their listings are getting stale. Suggest a rebook on the top vessel."
                sample={insights.studioLapsed4w.slice(0, 3)}
              />
            )}
            {insights.noListings.length > 0 && (
              <InsightCard
                icon={PackageOpen}
                tone="destructive"
                headline={`${insights.noListings.length} dealer${insights.noListings.length === 1 ? "" : "s"} haven't added a single listing`}
                detail="They activated but never populated. Onboarding follow-up is overdue."
                sample={insights.noListings.slice(0, 3)}
              />
            )}
            {insights.activatedLast7dNoListing.length + insights.activatedLast7dNoBrokers.length > 0 && (
              <InsightCard
                icon={Rocket}
                tone="brand"
                headline={`New this week: ${insights.activatedLast7dNoListing.length} without listings, ${insights.activatedLast7dNoBrokers.length} without brokers`}
                detail="Reach out inside the first 7 days - activation rate drops sharply after that."
                sample={[
                  ...insights.activatedLast7dNoListing,
                  ...insights.activatedLast7dNoBrokers.filter(
                    (c) => !insights.activatedLast7dNoListing.some((x) => x.id === c.id),
                  ),
                ].slice(0, 3)}
              />
            )}
            {insights.noThreeDTours.length > 0 && (
              <InsightCard
                icon={Video}
                tone="brand"
                headline={`${insights.noThreeDTours.length} dealer${insights.noThreeDTours.length === 1 ? "" : "s"} run active listings with zero 3D tours`}
                detail="Clean Studio upsell - the pitch practically writes itself."
                sample={insights.noThreeDTours.slice(0, 3)}
              />
            )}
            {insights.neverLive.length > 0 && (
              <InsightCard
                icon={Radio}
                tone="brand"
                headline={`${insights.neverLive.length} dealer${insights.neverLive.length === 1 ? "" : "s"} haven't tried YachtWay LIVE yet`}
                detail="Pitch livestreamed walkthroughs - fastest wedge for remote buyers."
                sample={insights.neverLive.slice(0, 3)}
              />
            )}
          </div>
        </section>
      ),
    }] : []),
    {
      id: "slacking",
      node: <SlackingDealersSection scope={myCompanies} />,
    },
    {
      id: "studio",
      node: <StudioBookingsPanel userId={userId} />,
    },
    {
      id: "book-mix",
      node: (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MixCard
            title="Book composition"
            slices={[
              { label: "Main", value: myMain.length, color: "oklch(0.55 0.18 300)" },
              { label: "FinTech", value: myCompanies.length - myMain.length, color: "oklch(0.62 0.14 200)" },
            ]}
          />
          <CoverageCard crm={brokersCrm} scraped={brokersScraped} />
        </div>
      ),
    },
  ];

  const defaults = sections.map((s) => s.id);
  const { order, setOrder, reset } = useDashboardOrder(userId, defaults);
  const byId = new Map(sections.map((s) => [s.id, s.node]));

  return (
    <>
      {isEditing && (
        <DashboardLayoutToolbar userId={userId} order={order} setOrder={setOrder} onReset={reset} />
      )}
      {order.map((id) => {
        const node = byId.get(id);
        if (!node) return null;
        return (
          <MovableSection key={id} id={id} order={order} setOrder={setOrder} isEditing={isEditing}>
            {node}
          </MovableSection>
        );
      })}
    </>
  );

}

// ==========================================================
// Building blocks
// ==========================================================
function KpiCard({
  label, value, sub, icon: Icon, accent = "brand", trend, to, tooltip,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Users;
  accent?: "brand" | "success" | "warning";
  trend?: number[];
  to: string;
  tooltip?: string;
}) {
  const accentClass =
    accent === "success" ? "text-success"
    : accent === "warning" ? "text-warning"
    : "text-brand-deep";
  const iconBg =
    accent === "success" ? "bg-success/10 text-success"
    : accent === "warning" ? "bg-warning/15 text-warning"
    : "bg-brand/10 text-brand";
  const labelNode = (
    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {label}
      {tooltip && (
        <Info className="h-3.5 w-3.5 text-muted-foreground/70" />
      )}
    </span>
  );
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        {tooltip ? (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild className="cursor-help">
                {labelNode}
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : labelNode}
        <span className={`grid h-8 w-8 place-items-center rounded-full ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className={`mt-3 text-3xl font-semibold tabular-nums ${accentClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      {trend && trend.length > 1 && (
        <Sparkline data={trend} className="mt-2 h-8 w-full text-brand/70" />
      )}
    </Link>
  );
}

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const w = 100, h = 30;
  const min = Math.min(...data), max = Math.max(...data);
  const range = Math.max(1, max - min);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M${pts.join(" L")}`;
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FocusItem({
  kind, company, priority,
}: {
  kind: "stale" | "portal" | "studio";
  company: Company;
  priority: number;
}) {
  const meta =
    kind === "stale"
      ? { icon: Clock, label: `${priority}d since contact`, tone: "text-warning" }
      : kind === "portal"
      ? { icon: AlertTriangle, label: "Never signed into portal", tone: "text-destructive" }
      : { icon: Sparkles, label: `Studio quiet ${priority}d`, tone: "text-warning" };
  const Icon = meta.icon;
  return (
    <li>
      <Link
        to="/companies/$id" params={{ id: company.id }}
        className="flex items-center gap-3 px-5 py-3 transition hover:bg-accent/40"
      >
        <span className={`grid h-9 w-9 place-items-center rounded-full bg-secondary/60 ${meta.tone}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-brand-deep">{company.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {company.companyType} · {company.billingCity}
          </div>
        </div>
        <div className={`text-xs font-medium ${meta.tone}`}>{meta.label}</div>
      </Link>
    </li>
  );
}

function MixCard({
  title, slices,
}: {
  title: string;
  slices: { label: string; value: number; color: string }[];
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const radius = 42, stroke = 14, circ = 2 * Math.PI * radius;
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-brand-deep">{title}</h3>
      <div className="mt-3 flex items-center gap-6">
        <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="oklch(0.94 0.01 300)" strokeWidth={stroke} />
          {slices.map((s) => {
            const len = (s.value / total) * circ;
            const dash = `${len} ${circ - len}`;
            const offset = -acc;
            acc += len;
            return (
              <circle
                key={s.label}
                cx="60" cy="60" r={radius} fill="none"
                stroke={s.color} strokeWidth={stroke}
                strokeDasharray={dash} strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        <ul className="flex-1 space-y-2 text-sm">
          {slices.map((s) => {
            const pct = Math.round((s.value / total) * 100);
            return (
              <li key={s.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="font-medium text-foreground">{s.label}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {s.value} <span className="text-xs">({pct}%)</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function CoverageCard({ crm, scraped }: { crm: number; scraped: number }) {
  const pct = Math.min(100, Math.round((crm / Math.max(1, scraped)) * 100));
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-brand-deep">Broker coverage</h3>
          <p className="text-xs text-muted-foreground">CRM vs. known brokers across your Main accounts</p>
        </div>
        <span className="text-2xl font-semibold text-brand-deep tabular-nums">{pct}%</span>
      </div>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-secondary/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-deep transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 flex justify-between text-xs text-muted-foreground">
        <span><span className="font-semibold text-brand-deep tabular-nums">{crm}</span> in CRM</span>
        <span><span className="font-semibold text-foreground tabular-nums">{scraped}</span> known</span>
        <span><span className="font-semibold text-warning tabular-nums">{Math.max(0, scraped - crm)}</span> to add</span>
      </div>
    </section>
  );
}

// ==========================================================
// Fallback for non-sales-rep roles
// ==========================================================
function GenericHome() {
  const { user } = useAuth();
  const { formatCompact: fmt } = useMoney();
  const mainCompanies = COMPANIES.filter((c) => c.vertical === "Main").length;
  const fintechCompanies = COMPANIES.filter((c) => c.vertical === "FinTech").length;
  const loanApplicants = CONTACTS.filter((c) => c.contactType === "Loan Applicant").length;
  const pipelineValue = OPPORTUNITIES.reduce((s, o) => s + o.amountUsd, 0);

  const stats = [
    { label: "Main companies", value: mainCompanies, icon: Building2, to: "/companies" },
    { label: "FinTech accounts", value: fintechCompanies, icon: Wallet, to: "/companies" },
    { label: "Contacts", value: CONTACTS.length, icon: Users, to: "/contacts" },
    { label: "Active listings", value: LISTINGS.filter((l) => l.status === "Active").length, icon: BoatIcon, to: "/listings" },
    { label: "Loan applicants", value: loanApplicants, icon: Wallet, to: "/contacts" },
    { label: "Pipeline value", value: fmt(pipelineValue), icon: Briefcase, to: "/opportunities" },
  ];

  return (
    <AppShell>
      <PageBody>
        <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand/90 via-brand-deep to-[oklch(0.28_0.12_290)] px-6 py-8 text-brand-foreground shadow-lg md:px-10">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-brand-foreground/70">
            <Sunrise className="h-3.5 w-3.5" /> {greeting()}
          </div>
          <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Welcome back, {user.name.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-brand-foreground/75">
            Signed in as {ROLE_LABELS[user.role]}. Switch to Sales Rep to see the account-owner dashboard.
          </p>
        </section>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.label}
                to={s.to}
                className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</span>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/10 text-brand">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-3 text-3xl font-semibold text-brand-deep tabular-nums">{s.value}</div>
                <div className="mt-2 flex items-center gap-1 text-xs font-medium text-brand">
                  View <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-6">
          <MyTasksPanel />
        </div>

        {user.role === "admin" && (
          <section className="mt-8 space-y-6">
            <CompanyOverviewPanel />
            <ServicesRevenuePanel />
            <WeeklyReportsAdminPanel />

            <RepTargetsBreakdown />

            <ScreenshotLogPanel />
          </section>
        )}
      </PageBody>
    </AppShell>
  );
}

// ==========================================================
// Admin: per-rep targets & activity breakdown
// Admin picks a specific rep (or "All reps") from a dropdown.
// ==========================================================
function RepTargetsBreakdown() {
  const reps = DEMO_USER_LIST.filter((u) => u.role === "sales_rep" || u.role === "fintech");
  const [selected, setSelected] = useState<string>(reps[0]?.id ?? "");
  const visible = selected === "__all" ? reps : reps.filter((r) => r.id === selected);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-brand-deep">Sales targets by rep</h2>
          <p className="text-xs text-muted-foreground">
            Pick a rep to see their targets, progress, and activity for the current period.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="rep-select" className="text-xs font-medium text-muted-foreground">
            Rep
          </label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="rep-select" className="h-9 w-[240px]">
              <SelectValue placeholder="Choose a rep" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All reps</SelectItem>
              {reps.map((rep) => (
                <SelectItem key={rep.id} value={rep.id}>
                  {rep.name} · {ROLE_LABELS[rep.role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-6">
        {visible.map((rep) => (
          <div key={rep.id}>
            <TargetsPanel userId={rep.id} userName={rep.name} canEdit />
            <RepActivityPanel userId={rep.id} />
          </div>
        ))}
      </div>
    </div>
  );
}



// ==========================================================
// Insight card - one data-driven callout with an example list
// ==========================================================
function InsightCard({
  icon: Icon, tone, headline, detail, sample,
}: {
  icon: typeof Users;
  tone: "brand" | "warning" | "destructive";
  headline: string;
  detail: string;
  sample: Company[];
}) {
  const toneRing =
    tone === "destructive" ? "border-destructive/30 bg-destructive/5"
    : tone === "warning" ? "border-warning/30 bg-warning/5"
    : "border-brand/25 bg-brand/5";
  const iconWrap =
    tone === "destructive" ? "bg-destructive/15 text-destructive"
    : tone === "warning" ? "bg-warning/20 text-warning"
    : "bg-brand/15 text-brand";
  const empty = sample.length === 0;
  return (
    <div className={`rounded-2xl border ${toneRing} p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${iconWrap}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug text-brand-deep">{headline}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      {!empty && (
        <ul className="mt-3 space-y-1">
          {sample.map((c) => (
            <li key={c.id}>
              <Link
                to="/companies/$id" params={{ id: c.id }}
                className="flex items-center justify-between rounded-md px-2 py-1 text-xs transition hover:bg-white/60"
              >
                <span className="truncate font-medium text-foreground">{c.name}</span>
                <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                  {c.billingState || c.billingCountry}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ==========================================================
// Slacking dealers - anyone scoring below Warm
// ==========================================================
function SlackingDealersSection({ scope }: { scope: Company[] }) {
  const insights = bookInsights(scope);
  const slacking = insights.belowWarm;
  if (slacking.length === 0) return null;
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-gradient-to-r from-destructive/10 to-warning/10 px-5 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
            <Snowflake className="h-4 w-4 text-destructive" />
            Dealers slacking - below Warm
          </h3>
          <p className="text-xs text-muted-foreground">
            {slacking.length} account{slacking.length === 1 ? "" : "s"} could be doing more. Sorted by health score.
          </p>
        </div>
      </header>
      <ul className="divide-y divide-border">
        {slacking.slice(0, 8).map(({ company, score }) => (
          <SlackingRow key={company.id} company={company} score={score} />
        ))}
      </ul>
    </section>
  );
}

function SlackingRow({
  company, score,
}: {
  company: Company;
  score: ReturnType<typeof computeDealerScore>;
}) {
  const tier = score.tier as ScoreTier;
  const tierStyle = TIER_STYLES[tier];
  const topReasons = score.reasons.slice(0, 3);
  return (
    <li>
      <Link
        to="/companies/$id" params={{ id: company.id }}
        className="flex items-center gap-4 px-5 py-3 transition hover:bg-accent/40"
      >
        <ScoreDial value={score.score} tier={tier} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-brand-deep">{company.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${tierStyle.bg} ${tierStyle.text} ${tierStyle.ring}`}>
              {tier}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {company.companyType} · {company.billingCity}
            {company.billingState ? `, ${company.billingState}` : ""}
          </div>
          {topReasons.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {topReasons.map((r) => (
                <li key={r.label} className="rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {r.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function ScoreDial({ value, tier }: { value: number; tier: ScoreTier }) {
  const r = 22, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const stroke =
    tier === "On Fire" ? "oklch(0.62 0.19 25)"
    : tier === "Hot" ? "oklch(0.65 0.16 155)"
    : tier === "Warm" ? "oklch(0.55 0.17 300)"
    : tier === "Cool" ? "oklch(0.7 0.15 75)"
    : "oklch(0.6 0.18 25)";
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center">
      <svg viewBox="0 0 60 60" className="h-14 w-14 -rotate-90">
        <circle cx="30" cy="30" r={r} fill="none" stroke="oklch(0.93 0.01 300)" strokeWidth="5" />
        <circle
          cx="30" cy="30" r={r} fill="none" stroke={stroke} strokeWidth="5"
          strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums text-brand-deep">{value}</span>
    </div>
  );
}

