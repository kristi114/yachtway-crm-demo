import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Building2, Phone, Mail, MessageSquare, Target, Sparkles, DollarSign } from "lucide-react";
import {
  TARGET_METRICS, computeActuals, getTargets, formatTargetValue, periodRange,
  useTargetsStore, type TargetPeriod, type TargetSet, repUsers,
} from "@/lib/targets";
import { useMoney } from "@/lib/auth";

// ==========================================================
// Company-wide overview (admin only)
// Aggregates all reps' targets + actuals, plus outreach totals,
// with month-over-month and cycle-over-cycle comparisons.
// ==========================================================

// Duplicated in-file (rep-activity-panel keeps its own copy for its detail view).
// Numbers are last-30-day rolling totals per rep.
const ACTIVITY: Record<string, { calls: number; emails: number; messages: number; meetings: number }> = {
  u_rep:    { calls: 142, emails: 318, messages: 96, meetings: 22 },
  u_fin:    { calls: 88,  emails: 214, messages: 61, meetings: 18 },
  u_rep_eu: { calls: 176, emails: 402, messages: 133, meetings: 27 },
  u_rep_uk: { calls: 61,  emails: 189, messages: 42, meetings: 11 },
};

// Prior-30d outreach, so we can render an actual delta. Kept close to current values.
const PRIOR_ACTIVITY: Record<string, { calls: number; emails: number; messages: number; meetings: number }> = {
  u_rep:    { calls: 127, emails: 331, messages: 75, meetings: 20 },
  u_fin:    { calls: 94,  emails: 196, messages: 59, meetings: 17 },
  u_rep_eu: { calls: 144, emails: 350, messages: 113, meetings: 24 },
  u_rep_uk: { calls: 74,  emails: 208, messages: 48, meetings: 13 },
};

const PERIODS: { id: TargetPeriod; label: string; priorLabel: string }[] = [
  { id: "month",   label: "This month",   priorLabel: "last month" },
  { id: "quarter", label: "This quarter", priorLabel: "last quarter" },
  { id: "year",    label: "This year",    priorLabel: "last year" },
];

function sumTargets(userIds: string[], period: TargetPeriod): TargetSet {
  const totals: TargetSet = {
    new_dealers: 0, broker_seats_sold: 0, websites_sold: 0,
    activation_rate: 0, studio_revenue: 0, pipeline_value: 0, won_revenue: 0,
  };
  for (const id of userIds) {
    const t = getTargets(id, period);
    totals.new_dealers += t.new_dealers;
    totals.broker_seats_sold += t.broker_seats_sold;
    totals.websites_sold += t.websites_sold;
    totals.activation_rate += t.activation_rate;
    totals.studio_revenue += t.studio_revenue;
    totals.pipeline_value += t.pipeline_value;
    totals.won_revenue += t.won_revenue;
  }
  if (userIds.length > 0) {
    totals.activation_rate = Math.round(totals.activation_rate / userIds.length);
  }
  return totals;
}

function sumActuals(userIds: string[], period: TargetPeriod): TargetSet {
  const totals: TargetSet = {
    new_dealers: 0, broker_seats_sold: 0, websites_sold: 0,
    activation_rate: 0, studio_revenue: 0, pipeline_value: 0, won_revenue: 0,
  };
  const rates: number[] = [];
  for (const id of userIds) {
    const a = computeActuals(id, period);
    totals.new_dealers += a.new_dealers;
    totals.broker_seats_sold += a.broker_seats_sold;
    totals.websites_sold += a.websites_sold;
    totals.studio_revenue += a.studio_revenue;
    totals.pipeline_value += a.pipeline_value;
    totals.won_revenue += a.won_revenue;
    rates.push(a.activation_rate);
  }
  totals.activation_rate = rates.length ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : 0;
  return totals;
}

// Fake but plausible prior-cycle revenue. Deterministic - 12% below current won.
function priorCycleWon(current: number) {
  return Math.round(current * 0.88);
}

// Pace-based projection: (actual so far / days elapsed) * days in period.
function projection(actual: number, period: TargetPeriod): number {
  const { start, end } = periodRange(period);
  const now = Date.now();
  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = Math.max(1, Math.min(totalMs, now - start.getTime()));
  return Math.round((actual / elapsedMs) * totalMs);
}

export function CompanyOverviewPanel() {
  const { formatCompact: fmt } = useMoney();
  const [period, setPeriod] = useState<TargetPeriod>("month");
  useTargetsStore(); // re-render on target edits

  const reps = useMemo(() => repUsers(), []);
  const repIds = useMemo(() => reps.map((r) => r.id), [reps]);

  const targets = useMemo(() => sumTargets(repIds, period), [repIds, period]);
  const actuals = useMemo(() => sumActuals(repIds, period), [repIds, period]);
  const { label: periodLabel, priorLabel } =
    PERIODS.find((p) => p.id === period) ?? PERIODS[0];
  const rangeLabel = periodRange(period).label;

  // Revenue projection & comparison
  const projected = projection(actuals.won_revenue, period);
  const projectedPct = targets.won_revenue > 0
    ? Math.round((projected / targets.won_revenue) * 100)
    : 0;
  const priorWon = priorCycleWon(targets.won_revenue > 0 ? targets.won_revenue : actuals.won_revenue || 1);
  const wonDeltaPct = priorWon > 0
    ? Math.round(((actuals.won_revenue - priorWon) / priorWon) * 100)
    : 0;

  // Outreach totals across all reps (last 30 days rolling)
  const outreach = repIds.reduce(
    (acc, id) => {
      const a = ACTIVITY[id]; if (!a) return acc;
      acc.calls += a.calls; acc.emails += a.emails;
      acc.messages += a.messages; acc.meetings += a.meetings;
      return acc;
    },
    { calls: 0, emails: 0, messages: 0, meetings: 0 },
  );
  const priorOutreach = repIds.reduce(
    (acc, id) => {
      const a = PRIOR_ACTIVITY[id]; if (!a) return acc;
      acc.calls += a.calls; acc.emails += a.emails;
      acc.messages += a.messages; acc.meetings += a.meetings;
      return acc;
    },
    { calls: 0, emails: 0, messages: 0, meetings: 0 },
  );
  const totalOutreach = outreach.calls + outreach.emails + outreach.messages;
  const priorTotalOutreach = priorOutreach.calls + priorOutreach.emails + priorOutreach.messages;
  const outreachDeltaPct = priorTotalOutreach > 0
    ? Math.round(((totalOutreach - priorTotalOutreach) / priorTotalOutreach) * 100)
    : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-col gap-3 border-b border-border bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
            <Building2 className="h-4 w-4 text-brand" /> Company overview · {rangeLabel}
          </h2>
          <p className="text-xs text-muted-foreground">
            Aggregated across {reps.length} reps · projections, revenue and outreach vs {priorLabel}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1 text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={
                "rounded-full px-3 py-1 font-medium transition " +
                (period === p.id
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "text-muted-foreground hover:text-brand-deep")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* Headline comparison cards */}
      <div className="grid grid-cols-1 gap-3 border-b border-border bg-muted/20 p-4 md:grid-cols-3">
        <HeadlineCard
          icon={Sparkles}
          label="Projected revenue"
          value={fmt(projected)}
          sub={targets.won_revenue > 0
            ? `${projectedPct}% of ${fmt(targets.won_revenue)} target`
            : "no target set"}
          tone={projectedPct >= 100 ? "success" : projectedPct >= 75 ? "brand" : "warning"}
          progress={targets.won_revenue > 0 ? Math.min(120, projectedPct) : undefined}
        />
        <HeadlineCard
          icon={DollarSign}
          label={`Revenue ${periodLabel.toLowerCase()}`}
          value={fmt(actuals.won_revenue)}
          sub={`vs ${fmt(priorWon)} ${priorLabel}`}
          delta={wonDeltaPct}
          tone={wonDeltaPct >= 0 ? "success" : "warning"}
        />
        <HeadlineCard
          icon={Target}
          label="Open pipeline"
          value={fmt(actuals.pipeline_value)}
          sub={targets.pipeline_value > 0
            ? `${Math.round((actuals.pipeline_value / targets.pipeline_value) * 100)}% of ${fmt(targets.pipeline_value)}`
            : "no target set"}
          tone="brand"
        />
      </div>

      {/* Outreach - 30 day totals across all reps */}
      <div className="border-b border-border px-5 py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Team outreach · last 30 days
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {totalOutreach.toLocaleString()} touches vs {priorTotalOutreach.toLocaleString()} in the prior 30 days
            </p>
          </div>
          <DeltaPill value={outreachDeltaPct} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <OutreachStat icon={Phone}          label="Calls"    value={outreach.calls}    prior={priorOutreach.calls} />
          <OutreachStat icon={Mail}           label="Emails"   value={outreach.emails}   prior={priorOutreach.emails} />
          <OutreachStat icon={MessageSquare}  label="Messages" value={outreach.messages} prior={priorOutreach.messages} />
          <OutreachStat icon={Sparkles}       label="Meetings" value={outreach.meetings} prior={priorOutreach.meetings} />
        </div>
      </div>

      {/* Full KPI table - team totals vs target */}
      <div className="px-5 py-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Team totals vs targets
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TARGET_METRICS.map((m) => {
            const actual = Number(actuals[m.key]) || 0;
            const target = Number(targets[m.key]) || 0;
            const pct = target > 0 ? Math.min(150, Math.round((actual / target) * 100)) : 0;
            const good = pct >= 100;
            const warn = pct < 60 && target > 0;
            const barColor = good
              ? "bg-success"
              : warn
                ? "bg-warning"
                : "bg-brand";
            return (
              <div key={m.key} className="rounded-xl border border-border/60 bg-background p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
                  <span className={`text-xs font-semibold tabular-nums ${good ? "text-success" : warn ? "text-warning" : "text-brand-deep"}`}>
                    {target > 0 ? `${pct}%` : "-"}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold tabular-nums text-brand-deep">
                    {formatTargetValue(actual, m.unit)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    / {formatTargetValue(target, m.unit)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary/60">
                  <div
                    className={`h-full rounded-full ${barColor} transition-[width] duration-700`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- small building blocks ----------

function HeadlineCard({
  icon: Icon, label, value, sub, delta, tone, progress,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  sub: string;
  delta?: number;
  tone: "brand" | "success" | "warning";
  progress?: number;
}) {
  const ring =
    tone === "success" ? "border-success/30 bg-success/5"
    : tone === "warning" ? "border-warning/30 bg-warning/5"
    : "border-brand/30 bg-brand/5";
  const iconWrap =
    tone === "success" ? "bg-success/15 text-success"
    : tone === "warning" ? "bg-warning/20 text-warning"
    : "bg-brand/15 text-brand";
  return (
    <div className={`rounded-xl border ${ring} p-4`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-full ${iconWrap}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-brand-deep">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{sub}</span>
        {delta !== undefined && <DeltaPill value={delta} compact />}
      </div>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary/60">
          <div
            className={`h-full rounded-full ${tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-brand"} transition-[width] duration-700`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function OutreachStat({
  icon: Icon, label, value, prior,
}: { icon: typeof Phone; label: string; value: number; prior: number }) {
  const delta = prior > 0 ? Math.round(((value - prior) / prior) * 100) : 0;
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-brand-deep">
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <DeltaPill value={delta} compact />
        <span>vs {prior.toLocaleString()}</span>
      </div>
    </div>
  );
}

function DeltaPill({ value, compact }: { value: number; compact?: boolean }) {
  const good = value >= 0;
  const Icon = good ? TrendingUp : TrendingDown;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full font-medium tabular-nums " +
        (compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs") + " " +
        (good ? "bg-success/15 text-success" : "bg-warning/15 text-warning")
      }
    >
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {value > 0 ? "+" : ""}{value}%
    </span>
  );
}
