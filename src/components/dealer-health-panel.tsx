import { useMemo } from "react";

function formatDate(iso: string | undefined | null) {
  if (!iso) return undefined;
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
import { Link } from "@tanstack/react-router";
import { Activity, Eye, Clock, LogIn, Video, Radio, DollarSign, TrendingUp, TrendingDown, Flame, Snowflake, Users, Camera, Sparkles, FileText, EyeOff, ListChecks, Anchor, Truck } from "lucide-react";
import { HandshakeIcon } from "@/components/icons/handshake-icon";
import { BoatIcon } from "@/components/icons/boat-icon";
import {
  computeDealerScore, TIER_STYLES, has3DTours,
  getBrand, type Company, type Contact, type Listing,
} from "@/lib/mock-data";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";



// ==========================================================
// Dealer health + analytics + listing heat scores
// Everything that lives on the dealer profile "Health" tab.
// ==========================================================
export function DealerHealthPanel({
  company, contacts, listings,
}: {
  company: Company;
  contacts: Contact[];
  listings: Listing[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <HealthScoreCard company={company} />
        </div>
        <EasyFundMiniCard company={company} />
      </div>

      <DealerMetricsGrid company={company} contacts={contacts} listings={listings} />

      <ListingHeatPanel company={company} listings={listings} />
    </div>
  );
}

// ==========================================================
// Health score
// ==========================================================
function HealthScoreCard({ company }: { company: Company }) {
  const score = computeDealerScore(company);
  const style = TIER_STYLES[score.tier];
  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          Dealer health
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${style.bg} ${style.text} ${style.ring}`}>
          {score.tier}
        </span>
      </header>
      <div className="flex items-center gap-4 px-4 py-4">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center">
          <svg viewBox="0 0 60 60" className="h-20 w-20 -rotate-90">
            <circle cx="30" cy="30" r="24" fill="none" stroke="oklch(0.93 0.01 300)" strokeWidth="6" />
            <circle
              cx="30" cy="30" r="24" fill="none" strokeWidth="6" strokeLinecap="round"
              stroke="oklch(0.55 0.17 300)"
              strokeDasharray={`${(2 * Math.PI * 24) * (score.score / 100)} ${2 * Math.PI * 24}`}
            />
          </svg>
          <div className="absolute text-center">
            <div className="text-lg font-semibold tabular-nums text-brand-deep">{score.score}</div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">/ 100</div>
          </div>
        </div>
        <div className="min-w-0 flex-1 text-xs">
          {score.reasons.length === 0 ? (
            <p className="text-muted-foreground">
              This account is firing on all cylinders. Keep the cadence up.
            </p>
          ) : (
            <>
              <p className="mb-1.5 font-medium text-foreground">What's dragging the score</p>
              <ul className="space-y-1">
                {score.reasons.slice(0, 4).map((r) => (
                  <li key={r.label} className="flex items-start justify-between gap-2 text-muted-foreground">
                    <span>· {r.label}</span>
                    <span className="tabular-nums text-destructive">{r.weight}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ==========================================================
// EasyFund funnel snapshot
// ==========================================================
function EasyFundMiniCard({ company }: { company: Company }) {
  const { can } = useAuth();
  const sym = CURRENCY_SYMBOL[company.currency];
  const total = company.easyfundReferralsTotal;
  const approved = company.easyfundReferralsApproved;
  const funded = company.easyfundReferralsFunded;
  const approveRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const fundRate = approved > 0 ? Math.round((funded / approved) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
        <HandshakeIcon className="h-3.5 w-3.5 text-brand" />
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          EasyFund funnel
        </h3>
      </header>
      <div className="grid grid-cols-3 gap-2 px-4 py-3 text-center text-xs">
        <div>
          <div className="text-lg font-semibold tabular-nums text-brand-deep">{total}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Referrals</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums text-brand-deep">{approved}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Approved · {approveRate}%</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums text-brand-deep">{funded}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Funded · {fundRate}%</div>
        </div>
      </div>
      {can("easyfund") && (
        <div className="border-t border-border bg-secondary/30 px-4 py-2 text-[11px] text-muted-foreground">
          Closed volume:{" "}
          <span className="font-semibold text-brand-deep tabular-nums">
            {sym}{(company.easyfundClosedReferralsAmount / 1_000_000).toFixed(2)}M
          </span>
        </div>
      )}

    </section>
  );
}

// ==========================================================
// Metrics grid - roll-ups from company + contact records
// ==========================================================
function DealerMetricsGrid({
  company, contacts, listings,
}: {
  company: Company;
  contacts: Contact[];
  listings: Listing[];
}) {
  const sym = CURRENCY_SYMBOL[company.currency];

  const totals = useMemo(() => {
    const sessions = contacts.reduce((s, c) => s + (c.sessions_30d ?? 0), 0);
    const views = contacts.reduce((s, c) => s + (c.listingViewsToDate ?? 0), 0);
    const withResp = contacts.filter((c) => (c.avgResponseTimeHours ?? 0) > 0);
    const avgResp = withResp.length
      ? withResp.reduce((s, c) => s + c.avgResponseTimeHours, 0) / withResp.length
      : 0;
    const withIntent = contacts.filter((c) => (c.buyerIntentScore ?? 0) > 0);
    const avgIntent = withIntent.length
      ? Math.round(withIntent.reduce((s, c) => s + c.buyerIntentScore, 0) / withIntent.length)
      : 0;
    const tours = has3DTours(company);
    const tourPct = tours.total > 0 ? Math.round((tours.with3d / tours.total) * 100) : 0;
    return { sessions, views, avgResp, avgIntent, tours, tourPct };
  }, [company, contacts]);

  const activeServices = Object.entries(company.servicesUsed)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          <Activity className="h-3.5 w-3.5 text-brand" /> Analytics & engagement
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          rolled up from {contacts.length} contact{contacts.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4">
        <Metric icon={BoatIcon} label="Active listings" value={company.activeListings.toLocaleString()} />
        <Metric icon={Video} label="3D tour coverage" value={`${totals.tourPct}%`} sub={`${totals.tours.with3d}/${totals.tours.total}`} />
        <Metric icon={Users} label="Sessions (30d)" value={totals.sessions.toLocaleString()} />
        <Metric icon={Eye} label="Listing views (LTD)" value={totals.views.toLocaleString()} />
        <Metric
          icon={Clock}
          label="Avg response"
          value={totals.avgResp > 0 ? `${totals.avgResp.toFixed(1)}h` : "-"}
          tone={totals.avgResp > 0 && totals.avgResp <= 3 ? "good" : totals.avgResp > 6 ? "bad" : undefined}
        />
        <Metric
          icon={TrendingUp}
          label="Avg buyer intent"
          value={totals.avgIntent > 0 ? `${totals.avgIntent}` : "-"}
          tone={totals.avgIntent >= 75 ? "good" : totals.avgIntent > 0 && totals.avgIntent < 50 ? "bad" : undefined}
        />
        <Metric icon={DollarSign} label="Studio spend YTD" value={`${sym}${company.studioSpendYtd.toLocaleString()}`} />
        <Metric icon={DollarSign} label="SaaS ARR" value={`$${company.saasArrUsd.toLocaleString()}`} />
        <Metric icon={LogIn} label="Last portal login" value={formatDate(company.lastLogin) || "Never"} tone={!company.lastLogin ? "bad" : undefined} />
        <Metric icon={Video} label="Last Studio session" value={formatDate(company.lastStudioSessionAt) || "Never"} tone={!company.lastStudioSessionAt ? "bad" : undefined} />
        <Metric icon={Radio} label="Last touch" value={formatDate(company.lastContactedAt) || "-"} sub={company.lastContactChannel || undefined} />
        <Metric icon={Users} label="Brokers linked" value={`${company.crmBrokerCount} / ${company.crmBrokerCount + company.scrapedBrokerCount}`} sub="in CRM / total known" />
      </div>
      {activeServices.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Services on:</span>
          {activeServices.map((s) => (
            <span key={s} className="inline-flex items-center rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-deep">
              {s}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  const toneClass =
    tone === "good" ? "text-success" :
    tone === "bad" ? "text-destructive" :
    "text-brand-deep";
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] font-medium text-foreground/70">{sub}</div>}
    </div>
  );
}

// ==========================================================
// Listing heat scores
// Composed from concrete listing-quality signals so sales can
// point at exactly what to fix on each vessel.
// ==========================================================
interface HeatReason {
  label: string;             // shown to the user
  weight: number;            // negative = drag on score
  action?: string;           // recommended fix / upsell for the sales rep
  icon: typeof Camera;
}

interface ListingHeat {
  score: number;             // 0-100
  breakdown: {
    media: number;           // 0-30
    video: number;           // 0-10
    description: number;     // 0-15
    price: number;           // 0-15
    features: number;        // 0-20
    freshness: number;       // 0-10
  };
  reasons: HeatReason[];     // ordered worst-first
  views_30d: number;
  inquiries_30d: number;
  days_on_market: number;
  tone: "hot" | "warm" | "cold";
}

function seed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(s: number) { let x = s || 1; return () => { x = Math.imul(48271, x) % 0x7fffffff; return x / 0x7fffffff; }; }

export function computeListingHeat(listing: Listing): ListingHeat {
  const r = rng(seed(listing.id));
  const listed = new Date(listing.listedAt).getTime();
  const days_on_market = Math.max(1, Math.round((Date.now() - listed) / (1000 * 60 * 60 * 24)));
  const reasons: HeatReason[] = [];

  // ---- Media quality (0-30) ----
  const qualityMap: Record<Listing["mediaQuality"], number> = { poor: 6, fair: 14, good: 22, excellent: 30 };
  let media = qualityMap[listing.mediaQuality];
  // Photos on the dock or on a trailer are the classic AI-enhancement upsell.
  if (listing.photoSetting === "trailer") {
    media = Math.max(0, media - 10);
    reasons.push({
      label: "Photos shot on the trailer",
      weight: -10,
      action: "Push the AI Image Enhancement tool - reframe hull as if on water",
      icon: Truck,
    });
  } else if (listing.photoSetting === "dock") {
    media = Math.max(0, media - 6);
    reasons.push({
      label: "Photos shot at the dock",
      weight: -6,
      action: "Offer AI Image Enhancement to swap backgrounds to open water",
      icon: Anchor,
    });
  }
  if (listing.mediaQuality === "poor") {
    reasons.push({
      label: "Poor-quality photos",
      weight: -12,
      action: "Book a Studio reshoot or run AI Image Enhancement",
      icon: Camera,
    });
  } else if (listing.mediaQuality === "fair") {
    reasons.push({
      label: "Only fair photo quality",
      weight: -6,
      action: "Run AI Image Enhancement to lift exposure and color",
      icon: Sparkles,
    });
  }
  if (listing.photoCount < 15) {
    const w = -Math.min(6, 15 - listing.photoCount);
    media = Math.max(0, media + w);
    reasons.push({
      label: `Only ${listing.photoCount} photos on the listing`,
      weight: w,
      action: "Request at least 20 photos covering exterior, salon, cabins, engine room",
      icon: Camera,
    });
  }

  // ---- Video (0-10) ----
  const video = listing.hasVideo ? 10 : 0;
  if (!listing.hasVideo) {
    reasons.push({
      label: "No walkthrough video",
      weight: -10,
      action: "Ask broker for a YouTube URL or book a Studio video walkthrough",
      icon: Video,
    });
  }

  // ---- Description (0-15) ----
  let description = 0;
  if (listing.descriptionLength === 0) {
    reasons.push({
      label: "Description is missing",
      weight: -15,
      action: "Draft copy from spec sheet - buyers skip listings with no story",
      icon: FileText,
    });
  } else if (listing.descriptionLength < 400) {
    description = 6;
    reasons.push({
      label: "Description is too thin",
      weight: -9,
      action: "Expand to 800-1500 chars covering condition, upgrades, cruising history",
      icon: FileText,
    });
  } else if (listing.descriptionLength < 1000) {
    description = 11;
    reasons.push({
      label: "Description is short",
      weight: -4,
      action: "Add sea-trial notes and recent service history",
      icon: FileText,
    });
  } else {
    description = 15;
  }

  // ---- Price visibility (0-15) ----
  const price = listing.priceHidden ? 0 : 15;
  if (listing.priceHidden) {
    reasons.push({
      label: "Price hidden - buyers bounce",
      weight: -15,
      action: "Publish the asking price; hidden-price listings drop ~40% of buyer clicks",
      icon: EyeOff,
    });
  }

  // ---- Features completeness (0-20) ----
  const filledPct = listing.featuresTotal > 0
    ? listing.featuresFilled / listing.featuresTotal
    : 0;
  const features = Math.round(20 * filledPct);
  const missing = listing.featuresTotal - listing.featuresFilled;
  if (filledPct < 0.9 && missing > 0) {
    const w = -Math.round((1 - filledPct) * 20);
    reasons.push({
      label: `${missing} of ${listing.featuresTotal} feature fields empty`,
      weight: w,
      action: "Complete features - more info = higher score and better filter matches",
      icon: ListChecks,
    });
  }

  // ---- Freshness (0-10) ----
  const freshness = Math.max(0, 10 - Math.min(10, days_on_market / 30));

  // Status penalty (kept from prior model; doesn't produce a "reason" tip)
  const statusPenalty =
    listing.status === "Withdrawn" ? -30 :
    listing.status === "Sold"      ? -10 :
    listing.status === "Pending"   ? -3  : 0;

  const raw = Math.round(media + video + description + price + features + freshness + statusPenalty);
  const score = Math.max(0, Math.min(100, raw));
  const heat = score / 100;

  const views_30d = Math.round(80 + heat * 1400 + r() * 60);
  const inquiries_30d = Math.round(1 + heat * 22 + r() * 2);
  const tone: ListingHeat["tone"] = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";

  reasons.sort((a, b) => a.weight - b.weight);

  return {
    score,
    breakdown: { media, video, description, price, features, freshness },
    reasons,
    views_30d, inquiries_30d, days_on_market, tone,
  };
}

export const HEAT_STYLES = {
  hot:  { bar: "bg-destructive", text: "text-destructive", label: "Hot",  icon: Flame },
  warm: { bar: "bg-warning",     text: "text-warning",     label: "Warm", icon: TrendingUp },
  cold: { bar: "bg-muted-foreground/60", text: "text-muted-foreground", label: "Cold", icon: Snowflake },
} as const;

function ListingHeatPanel({ company, listings }: { company: Company; listings: Listing[] }) {
  const rows = useMemo(
    () => listings.map((l) => ({ listing: l, heat: computeListingHeat(l) }))
      .sort((a, b) => b.heat.score - a.heat.score),
    [listings]
  );
  const hot = rows.filter((r) => r.heat.tone === "hot").length;
  const cold = rows.filter((r) => r.heat.tone === "cold").length;

  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold uppercase tracking-wide text-brand-deep">
          <Flame className="h-4 w-4 text-destructive" /> Listing performance · heat scores
        </h3>
        <span className="text-[15px] text-muted-foreground tabular-nums">
          Sample of {rows.length} of {company.activeListings.toLocaleString()} active ·{" "}
          <span className="font-semibold text-destructive">{hot} hot</span> ·{" "}
          <span className="font-semibold text-muted-foreground">{cold} cold</span>
        </span>

      </header>
      <ul className="divide-y divide-border">
        {rows.map(({ listing: l, heat }) => {
          const brand = getBrand(l.brandId);
          const s = HEAT_STYLES[heat.tone];
          const HeatIcon = s.icon;
          return (
            <li key={l.id} className="px-4 py-4">
              {/* Row 1 - Identity + heat badge */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <BoatIcon className="h-4 w-4 shrink-0 text-brand" />
                <Link to="/listings/$id" params={{ id: l.id }} className="text-[16px] font-semibold text-brand-deep hover:underline">
                  {brand?.name} {l.model}
                </Link>
                <span className="text-[15px] text-muted-foreground">
                  {l.year} · {l.lengthFt}ft
                </span>
                <Badge variant="outline" className="text-[13px]">{l.status}</Badge>
                <span className={`ml-auto inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[15px] font-semibold tabular-nums ring-1 ring-inset ring-border ${s.text}`}>
                  <HeatIcon className="h-3.5 w-3.5" /> {s.label} · {heat.score}/100
                </span>
              </div>

              {/* Row 2 - Score bar + engagement stats */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <div className="h-2 w-48 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full ${s.bar}`} style={{ width: `${heat.score}%` }} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[15px] text-muted-foreground tabular-nums">
                  <span><span className="font-semibold text-foreground">{heat.views_30d.toLocaleString()}</span> views</span>
                  <span><span className="font-semibold text-foreground">{heat.inquiries_30d}</span> inquiries</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="font-semibold text-foreground">{heat.days_on_market}d</span> on market
                    {heat.days_on_market > 180 && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                  </span>
                </div>
              </div>

              {/* Row 3 - Score composition */}
              <div className="mt-3 rounded-sm border border-border/60 bg-secondary/20 p-2.5">
                <div className="mb-2 text-[15px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Score composition
                </div>
                <div className="overflow-x-auto">
                  <div className="grid min-w-[360px] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <ScoreBar label="Media" value={heat.breakdown.media} max={30} />
                    <ScoreBar label="Video" value={heat.breakdown.video} max={10} />
                    <ScoreBar label="Description" value={heat.breakdown.description} max={15} />
                    <ScoreBar label="Price" value={heat.breakdown.price} max={15} />
                    <ScoreBar label="Features" value={heat.breakdown.features} max={20} />
                    <ScoreBar label="Freshness" value={Math.round(heat.breakdown.freshness)} max={10} />
                  </div>
                </div>
              </div>

              {/* Row 4 - Fix-it list */}
              {heat.reasons.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 text-[15px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Top issues to fix
                  </div>
                  <ul className="space-y-1.5">
                    {heat.reasons.slice(0, 3).map((r) => {
                      const Icon = r.icon;
                      return (
                        <li key={r.label} className="flex items-start gap-2 rounded-sm bg-destructive/5 px-2.5 py-2 text-[15px]">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground">{r.label}</span>
                              <span className="shrink-0 tabular-nums font-semibold text-destructive">{r.weight}</span>
                            </div>
                            {r.action && (
                              <div className="mt-0.5 text-muted-foreground">{r.action}</div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {heat.reasons.length > 3 && (
                      <li className="pl-6 text-[15px] text-muted-foreground">
                        +{heat.reasons.length - 3} more issues
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border bg-secondary/30 px-4 py-2.5 text-[15px] text-muted-foreground">
        Score = media quality + video + description + price visibility + features filled + freshness.
        {" "}
        <Link to="/companies/$id" params={{ id: company.id }} search={{}} className="text-brand hover:underline">
          Focus low-heat listings
        </Link>{" "}
        for the next call.
      </div>
    </section>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const tone = pct >= 80 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-destructive";
  return (
    <div className="min-w-[4.5rem]">
      <div className="flex items-center justify-between gap-2 text-[15px] uppercase tracking-wider text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="whitespace-nowrap tabular-nums">{value}/{max}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

