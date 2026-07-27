import { useMemo } from "react";

import { CalendarClock, Loader2, TrendingUp, TrendingDown, Sparkles, Mail, CheckCircle2, Gauge, Rocket, Flame } from "lucide-react";
import { DEMO_USER_LIST } from "@/lib/auth";
import { getRepWeeklySnapshot, weeklyReportStatus, formatWeekRange, getRepPace, type RepPace } from "@/lib/weekly-report";

// ==========================================================
// Sales rep weekly report banner
// - Shown on the sales rep home
// - Encouraging message comparing this week to last week and
//   the last 3-week average
// - Shows delivery status: "processing" late in the week,
//   "delivered to admin" once end-of-week send has run,
//   "in progress" the rest of the week
// ==========================================================

export function WeeklyReportBanner({ userId }: { userId: string }) {
  const snap = useMemo(() => getRepWeeklySnapshot(userId), [userId]);
  const status = useMemo(() => weeklyReportStatus(), []);
  const pace = useMemo(() => getRepPace(userId), [userId]);
  const adminRecipients = useMemo(
    () => DEMO_USER_LIST.filter((u) => u.role === "admin").map((u) => u.name),
    [],
  );

  const wowDelta = snap.lastWeek > 0
    ? Math.round(((snap.thisWeek - snap.lastWeek) / snap.lastWeek) * 100)
    : snap.thisWeek > 0 ? 100 : 0;
  const avgDelta = snap.threeWeekAvg > 0
    ? Math.round(((snap.thisWeek - snap.threeWeekAvg) / snap.threeWeekAvg) * 100)
    : 0;

  const goodWoW = wowDelta >= 0;
  const goodAvg = avgDelta >= 0;

  const headline = pickHeadline({ goodWoW, goodAvg, wowDelta, avgDelta, dayOfWeek: status.dayOfWeek });
  const showPace = status.state !== "delivered";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {/* Status bar */}
      <StatusBar status={status} />

      {/* Live pace bar - throughout the week */}
      {showPace && <PaceBar pace={pace} lastWeek={snap.lastWeek} />}

      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[1.4fr_1fr]">
        {/* Encouraging headline + numbers */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
            <Sparkles className="h-3 w-3" /> Weekly performance
          </div>
          <h3 className="mt-1 text-lg font-semibold leading-snug text-brand-deep">
            {headline}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatWeekRange(status.weekStart, status.weekEnd)} · outreach touches (calls + emails + messages)
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniStat label="This week" value={snap.thisWeek} tone="brand" bold />
            <MiniStat label="Last week" value={snap.lastWeek} tone="muted" />
            <MiniStat label="3-wk avg" value={snap.threeWeekAvg} tone="muted" />
          </div>
        </div>

        {/* Delta chips + recipients */}
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="space-y-2">
            <DeltaLine
              label="vs last week"
              delta={wowDelta}
              good={goodWoW}
            />
            <DeltaLine
              label="vs 3-week avg"
              delta={avgDelta}
              good={goodAvg}
            />
          </div>
          <div className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-brand-deep">
              <Mail className="h-3 w-3" /> Report recipients
            </div>
            <div className="mt-0.5 truncate">
              {adminRecipients.length === 0
                ? "No admins configured yet"
                : adminRecipients.join(" · ")}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PaceBar({ pace, lastWeek }: { pace: RepPace; lastWeek: number }) {
  // Progress = actual / target (cap at 100 for the bar; overflow shown separately).
  const pct = pace.targetTotal > 0
    ? Math.min(100, Math.round((pace.actualByNow / pace.targetTotal) * 100))
    : 0;
  const expectedPct = pace.elapsedPct;
  const ahead = pace.paceDeltaPct >= 0;
  const beatingLastWeek = pace.projectionDeltaPct >= 0;
  const Icon = ahead ? (pace.paceDeltaPct >= 10 ? Flame : Rocket) : Gauge;

  const message = buildPaceMessage(pace, lastWeek, ahead, beatingLastWeek);
  const tone = ahead
    ? "bg-success/10 text-success border-success/20"
    : "bg-warning/10 text-warning border-warning/20";
  const fillTone = ahead ? "bg-success" : "bg-warning";

  return (
    <div className={`border-b px-5 py-2.5 ${tone}`}>
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{message}</span>
        <span className="ml-auto shrink-0 tabular-nums text-[11px] font-medium opacity-80">
          {pace.actualByNow.toLocaleString()} / {pace.targetTotal.toLocaleString()} · target +{pace.stretchPct}% vs last wk
        </span>
      </div>
      {/* Progress bar with an "expected by now" marker */}
      <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-background/70">
        <div
          className={`h-full ${fillTone} transition-all`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-brand-deep/70"
          style={{ left: `${expectedPct}%` }}
          title={`On-pace marker: ${expectedPct}%`}
        />
      </div>
    </div>
  );
}

function buildPaceMessage(pace: RepPace, lastWeek: number, ahead: boolean, beatingLastWeek: boolean): string {
  if (pace.dayOfWeek === 0) {
    return ahead
      ? `Fast start - already ${pace.paceDeltaPct}% ahead of pace to beat last week (+${pace.stretchPct}%).`
      : `Fresh week - target is ${pace.targetTotal.toLocaleString()} touches to beat last week by ${pace.stretchPct}%.`;
  }
  if (ahead && beatingLastWeek) {
    return `On fire - ${pace.paceDeltaPct}% ahead of pace, projected +${pace.projectionDeltaPct}% vs last week.`;
  }
  if (ahead) {
    return `Nicely on pace - ${pace.paceDeltaPct}% ahead of the mid-week target. Keep pushing to beat last week (${lastWeek.toLocaleString()}).`;
  }
  const gap = Math.max(0, pace.expectedByNow - pace.actualByNow);
  if (pace.dayOfWeek >= 4) {
    return `${gap.toLocaleString()} touches behind pace - a strong push today still beats last week.`;
  }
  return `${gap.toLocaleString()} touches behind pace to beat last week - plenty of runway to catch up.`;
}

function StatusBar({ status }: { status: ReturnType<typeof weeklyReportStatus> }) {
  if (status.state === "delivered") {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-success/10 px-5 py-2 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Weekly report delivered to admin {status.deliveredLabel}.
      </div>
    );
  }
  if (status.state === "processing") {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-brand/10 px-5 py-2 text-xs font-medium text-brand-deep">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Your weekly performance report is processing - auto-sending to admin at end of day Friday.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-5 py-2 text-xs font-medium text-muted-foreground">
      <CalendarClock className="h-3.5 w-3.5" />
      Weekly report will be generated and sent to admin on Friday.
    </div>
  );
}

function MiniStat({
  label, value, tone, bold,
}: { label: string; value: number; tone: "brand" | "muted"; bold?: boolean }) {
  const valueTone = tone === "brand" ? "text-brand-deep" : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-background p-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 tabular-nums ${valueTone} ${bold ? "text-xl font-semibold" : "text-base font-medium"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function DeltaLine({ label, delta, good }: { label: string; delta: number; good: boolean }) {
  const Icon = good ? TrendingUp : TrendingDown;
  const tone = good ? "text-success" : "text-warning";
  const bg = good ? "bg-success/15" : "bg-warning/15";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums ${bg} ${tone}`}>
        <Icon className="h-3 w-3" />
        {delta > 0 ? "+" : ""}{delta}%
      </span>
    </div>
  );
}

function pickHeadline({
  goodWoW, goodAvg, wowDelta, avgDelta, dayOfWeek,
}: { goodWoW: boolean; goodAvg: boolean; wowDelta: number; avgDelta: number; dayOfWeek: number }) {
  const earlyWeek = dayOfWeek <= 2; // Mon/Tue
  if (goodWoW && goodAvg && wowDelta >= 15) {
    return earlyWeek
      ? `Strong start - already tracking +${wowDelta}% ahead of last week.`
      : `Great week - you're +${wowDelta}% on last week and +${avgDelta}% on your 3-week average.`;
  }
  if (goodWoW && goodAvg) {
    return earlyWeek
      ? "Off to a solid start - keep the cadence up."
      : `Ahead of last week by ${wowDelta}% and beating your 3-week average.`;
  }
  if (goodWoW && !goodAvg) {
    return `Rebounding - up ${wowDelta}% on last week, still ${Math.abs(avgDelta)}% below your recent average.`;
  }
  if (!goodWoW && goodAvg) {
    return earlyWeek
      ? "Slower start than last week - plenty of week left to catch up."
      : `Quieter week so far (${wowDelta}%), but still tracking above your 3-week average.`;
  }
  return earlyWeek
    ? "Fresh week - let's get some touches on the board."
    : `Down ${Math.abs(wowDelta)}% on last week - a couple of calls today would turn it around.`;
}
