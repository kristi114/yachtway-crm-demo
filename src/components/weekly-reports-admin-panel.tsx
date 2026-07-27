import { Loader2, CheckCircle2, CalendarClock, TrendingUp, TrendingDown, Mail } from "lucide-react";
import { allRepReports, weeklyReportStatus, formatWeekRange } from "@/lib/weekly-report";

// ==========================================================
// Admin view of the auto-triggered weekly rep reports.
// One row per sales rep with this-week vs last-week / 3-wk avg.
// Status pill mirrors the send state (pending / processing / delivered).
// ==========================================================
export function WeeklyReportsAdminPanel() {
  const rows = allRepReports();
  const status = weeklyReportStatus();

  const StatusIcon =
    status.state === "delivered" ? CheckCircle2
    : status.state === "processing" ? Loader2
    : CalendarClock;
  const statusTone =
    status.state === "delivered" ? "text-success bg-success/10"
    : status.state === "processing" ? "text-brand-deep bg-brand/10"
    : "text-muted-foreground bg-secondary/60";
  const statusLabel =
    status.state === "delivered" ? `Delivered · ${status.deliveredLabel}`
    : status.state === "processing" ? "Processing · sending Friday 6:00 PM"
    : "Pending · auto-sends Friday 6:00 PM";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-col gap-2 border-b border-border bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
            <Mail className="h-4 w-4 text-brand" /> Weekly rep reports
          </h2>
          <p className="text-xs text-muted-foreground">
            Auto-generated every Friday · {formatWeekRange(status.weekStart, status.weekEnd)}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone}`}>
          <StatusIcon className={`h-3 w-3 ${status.state === "processing" ? "animate-spin" : ""}`} />
          {statusLabel}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">Rep</th>
              <th className="px-3 py-2 text-right font-semibold">This week</th>
              <th className="px-3 py-2 text-right font-semibold">Last week</th>
              <th className="px-3 py-2 text-right font-semibold">3-wk avg</th>
              <th className="px-3 py-2 text-right font-semibold">vs last</th>
              <th className="px-3 py-2 text-right font-semibold">vs avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-t border-border">
                <td className="px-4 py-2 font-medium text-brand-deep">{r.userName}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-brand-deep">
                  {r.snapshot.thisWeek.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {r.snapshot.lastWeek.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {r.snapshot.threeWeekAvg.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right"><DeltaPill value={r.wowDeltaPct} /></td>
                <td className="px-3 py-2 text-right"><DeltaPill value={r.avgDeltaPct} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No sales reps configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DeltaPill({ value }: { value: number }) {
  const good = value >= 0;
  const Icon = good ? TrendingUp : TrendingDown;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums " +
        (good ? "bg-success/15 text-success" : "bg-warning/15 text-warning")
      }
    >
      <Icon className="h-2.5 w-2.5" />
      {value > 0 ? "+" : ""}{value}%
    </span>
  );
}
