import { Eye, MousePointerClick, Inbox, Phone, MessageCircle, Timer, TrendingUp } from "lucide-react";
import type { Contact } from "@/lib/mock-data";

// ==========================================================
// Broker analytics panel
// - Shown on any Broker contact profile
// - Deterministically synthesized from the contact id + listing
//   count so numbers are stable across renders and page loads.
// - Covers the last 30 days.
// ==========================================================

function seed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rand(seedVal: number) {
  let x = seedVal || 1;
  return () => { x = Math.imul(48271, x) % 0x7fffffff; return x / 0x7fffffff; };
}

export interface BrokerAnalytics {
  impressions: number;
  views: number;
  ctr: number;              // views / impressions
  leadsTotal: number;
  leadsPhone: number;
  leadsMessage: number;
  avgResponseMins: number;  // avg first-response time to message leads
  responseRatePct: number;  // share of message leads responded to within 24h
  viewsTrend: number[];     // 12-week views sparkline
  wowViewsDeltaPct: number; // this week vs last week
}

export function brokerAnalyticsFor(
  contactId: string, listingCount: number,
): BrokerAnalytics {
  const r = rand(seed(`analytics::${contactId}`));
  // Base by portfolio size; more listings = more surface area.
  const base = 400 + Math.max(1, listingCount) * (140 + Math.floor(r() * 90));
  const impressions = Math.round(base * (10 + r() * 18));       // ~4-30k
  const ctr = 0.02 + r() * 0.06;                                 // 2-8%
  const views = Math.round(impressions * ctr);
  const leadsTotal = Math.max(1, Math.round(views * (0.015 + r() * 0.03))); // 1.5-4.5% of views
  const phoneShare = 0.25 + r() * 0.35;                          // 25-60% by phone
  const leadsPhone = Math.round(leadsTotal * phoneShare);
  const leadsMessage = Math.max(0, leadsTotal - leadsPhone);
  const avgResponseMins = 15 + Math.round(r() * 340);            // 15-355 min
  const responseRatePct = 55 + Math.round(r() * 44);             // 55-99%

  // 12-week views trend with a gentle upward bias
  const viewsTrend = Array.from({ length: 12 }, (_, i) => {
    const drift = 0.85 + i * 0.03;
    const jitter = 0.75 + r() * 0.5;
    return Math.round((views / 4) * drift * jitter);
  });
  const thisWeek = viewsTrend[viewsTrend.length - 1];
  const lastWeek = viewsTrend[viewsTrend.length - 2] || 1;
  const wowViewsDeltaPct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);

  return {
    impressions, views, ctr, leadsTotal, leadsPhone, leadsMessage,
    avgResponseMins, responseRatePct, viewsTrend, wowViewsDeltaPct,
  };
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}
function fmtResponse(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function responseTone(mins: number): string {
  if (mins <= 60) return "text-success";
  if (mins <= 240) return "text-warning";
  return "text-destructive";
}

export function BrokerAnalyticsPanel({
  contact, listingCount, embedded = false,
}: {
  contact: Contact;
  listingCount: number;
  embedded?: boolean;
}) {
  if (contact.contactType !== "Broker") return null;
  const a = brokerAnalyticsFor(contact.id, listingCount);

  const body = (
    <>
      {/* Top KPI row */}
      <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:divide-y-0">
        <Stat icon={Eye} label="Listing views" value={fmtCount(a.views)}
              sub={`${a.wowViewsDeltaPct >= 0 ? "+" : ""}${a.wowViewsDeltaPct}% wk/wk`}
              tone={a.wowViewsDeltaPct >= 0 ? "success" : "warning"} />
        <Stat icon={MousePointerClick} label="Impressions" value={fmtCount(a.impressions)}
              sub={`${(a.ctr * 100).toFixed(1)}% CTR`} />
        <Stat icon={Inbox} label="Total leads" value={a.leadsTotal.toLocaleString()}
              sub={`${((a.leadsTotal / Math.max(1, a.views)) * 100).toFixed(1)}% of views`}
              tone="brand" />
        <Stat icon={Phone} label="Phone leads" value={a.leadsPhone.toLocaleString()}
              sub={`${Math.round((a.leadsPhone / Math.max(1, a.leadsTotal)) * 100)}% of leads`} />
        <Stat icon={MessageCircle} label="Message leads" value={a.leadsMessage.toLocaleString()}
              sub={`${Math.round((a.leadsMessage / Math.max(1, a.leadsTotal)) * 100)}% of leads`} />
        <Stat icon={Timer} label="Avg response" value={fmtResponse(a.avgResponseMins)}
              sub={`${a.responseRatePct}% within 24h`}
              valueClassName={responseTone(a.avgResponseMins)} />
      </div>

      {/* Views trend */}
      <div className="border-t border-border px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wide text-brand-deep">Views · last 12 weeks</span>
          <span className="tabular-nums text-muted-foreground">
            peak {fmtCount(Math.max(...a.viewsTrend))}/wk
          </span>
        </div>
        <TrendBars data={a.viewsTrend} />
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="border-b border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/30 px-5 py-2">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-brand-deep">
            <TrendingUp className="h-3.5 w-3.5 text-brand" /> YachtWay analytics
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Last 30 days</span>
        </div>
        {body}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-secondary/60 px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-deep">
          <TrendingUp className="h-4 w-4 text-brand" /> YachtWay analytics
        </h3>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Last 30 days</span>
      </header>
      {body}
    </section>
  );
}


function Stat({
  icon: Icon, label, value, sub, tone, valueClassName,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  sub?: string;
  tone?: "brand" | "success" | "warning";
  valueClassName?: string;
}) {
  const iconTone =
    tone === "success" ? "text-success"
    : tone === "warning" ? "text-warning"
    : tone === "brand" ? "text-brand"
    : "text-muted-foreground";
  const subTone =
    tone === "success" ? "text-success"
    : tone === "warning" ? "text-warning"
    : "text-muted-foreground";
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${iconTone}`} /> {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums text-brand-deep ${valueClassName ?? ""}`}>
        {value}
      </div>
      {sub && <div className={`mt-0.5 text-[11px] tabular-nums ${subTone}`}>{sub}</div>}
    </div>
  );
}

function TrendBars({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-24 items-end gap-1.5">
      {data.map((v, i) => {
        const pct = Math.max(6, Math.round((v / max) * 100));
        const isLast = i === data.length - 1;
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${isLast ? "bg-brand" : "bg-brand/30"}`}
            style={{ height: `${pct}%` }}
            title={`${v.toLocaleString()} views`}
          />
        );
      })}
    </div>
  );
}

