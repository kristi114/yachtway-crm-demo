import { useMemo } from "react";
import { Sparkles, TrendingUp, TrendingDown, Rocket, Gauge, Flame, CheckCircle2, Loader2, CalendarClock } from "lucide-react";
import { getRepWeeklySnapshot, weeklyReportStatus, getRepPace } from "@/lib/weekly-report";

// ==========================================================
// Compact weekly performance pill - pinned inside the hero
// next to the rep's greeting so weekly context is always visible.
// ==========================================================
export function WeeklyReportHeroPill({ userId }: { userId: string }) {
  const snap = useMemo(() => getRepWeeklySnapshot(userId), [userId]);
  const status = useMemo(() => weeklyReportStatus(), []);
  const pace = useMemo(() => getRepPace(userId), [userId]);

  const wowDelta = snap.lastWeek > 0
    ? Math.round(((snap.thisWeek - snap.lastWeek) / snap.lastWeek) * 100)
    : snap.thisWeek > 0 ? 100 : 0;
  const goodWoW = wowDelta >= 0;
  const ahead = pace.paceDeltaPct >= 0;
  const PaceIcon = ahead ? (pace.paceDeltaPct >= 10 ? Flame : Rocket) : Gauge;
  const DeltaIcon = goodWoW ? TrendingUp : TrendingDown;

  const statusLabel =
    status.state === "delivered" ? { icon: CheckCircle2, text: `Delivered ${status.deliveredLabel}` } :
    status.state === "processing" ? { icon: Loader2, text: "Processing - sends Friday" } :
    { icon: CalendarClock, text: "Sends to admin Friday" };
  const StatusIcon = statusLabel.icon;

  return (
    <div className="mt-4 inline-flex max-w-full flex-wrap items-stretch gap-0 overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm">
      {/* Header cell */}
      <div className="flex items-center gap-1.5 border-r border-white/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-brand-foreground/80">
        <Sparkles className="h-3 w-3" />
        Weekly performance
      </div>

      {/* This week */}
      <div className="flex items-center gap-1.5 border-r border-white/15 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-brand-foreground/70">This wk</span>
        <span className="text-sm font-semibold tabular-nums text-white">{snap.thisWeek.toLocaleString()}</span>
      </div>

      {/* vs last week */}
      <div className="flex items-center gap-1.5 border-r border-white/15 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-brand-foreground/70">vs last wk</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
          goodWoW ? "bg-success/20 text-success-foreground" : "bg-warning/25 text-white"
        }`}>
          <DeltaIcon className="h-3 w-3" />
          {wowDelta > 0 ? "+" : ""}{wowDelta}%
        </span>
      </div>

      {/* Pace */}
      <div className="flex items-center gap-1.5 border-r border-white/15 px-3 py-2">
        <PaceIcon className={`h-3.5 w-3.5 ${ahead ? "text-success-foreground" : "text-warning"}`} />
        <span className="text-[11px] font-medium text-brand-foreground/90">
          {ahead
            ? `${pace.paceDeltaPct}% ahead of pace`
            : `${Math.max(0, pace.expectedByNow - pace.actualByNow).toLocaleString()} behind pace`}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-brand-foreground/75">
        <StatusIcon className={`h-3 w-3 ${status.state === "processing" ? "animate-spin" : ""}`} />
        {statusLabel.text}
      </div>
    </div>
  );
}
