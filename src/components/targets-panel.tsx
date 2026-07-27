import { useMemo, useState } from "react";
import { Target, Pencil, TrendingUp } from "lucide-react";
import { useAuth, DEMO_USER_LIST } from "@/lib/auth";
import {
  TARGET_METRICS, computeActuals, formatTargetValue, getTargets, periodRange,
  useTargetsStore, type TargetPeriod,
} from "@/lib/targets";
import { EditTargetsDialog } from "@/components/edit-targets-dialog";

const PERIODS: { id: TargetPeriod; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
];

interface Props {
  userId: string;
  userName: string;
  /** When true, always show the Edit button (admin viewing any rep). */
  canEdit?: boolean;
}

export function TargetsPanel({ userId, userName, canEdit = false }: Props) {
  const { user } = useAuth();
  const isAdmin = user.role === "admin";
  // Reps see amounts in their home currency (EU reps → €, UK → £).
  const rep = DEMO_USER_LIST.find((u) => u.id === userId);
  const currency = rep?.currency ?? user.currency;
  const [period, setPeriod] = useState<TargetPeriod>("month");
  const [editOpen, setEditOpen] = useState(false);

  // Subscribe to the store so edits re-render instantly.
  useTargetsStore();

  const targets = getTargets(userId, period);
  const actuals = useMemo(() => computeActuals(userId, period), [userId, period]);
  const { label: periodLabel } = periodRange(period);

  const showEdit = isAdmin || canEdit;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
            <Target className="h-4 w-4 text-brand" />
            {userName.split(" ")[0]}'s targets · {periodLabel}
          </h3>
          <p className="text-xs text-muted-foreground">
            Performance against goals for the current {period}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-background p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  period === p.id
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {showEdit && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-brand/40 hover:text-brand-deep"
              title={isAdmin ? "Edit targets (admin)" : "Edit targets"}
            >
              <Pencil className="h-3 w-3" />
              {isAdmin ? "Edit targets" : "Edit"}
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-5">
        {TARGET_METRICS.map((m) => {
          const target = Number(targets[m.key]) || 0;
          const actual = Number(actuals[m.key]) || 0;
          const pct = target > 0 ? Math.min(150, Math.round((actual / target) * 100)) : 0;
          const onTrack = pct >= 100;
          const warn = pct < 60 && target > 0;
          const barColor = onTrack
            ? "bg-success"
            : warn
              ? "bg-warning"
              : "bg-brand";
          return (
            <div key={m.key} className="border-t border-border p-4 sm:border-l sm:first:border-l-0 lg:border-t-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </span>
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    onTrack ? "text-success" : warn ? "text-warning" : "text-muted-foreground"
                  }`}
                >
                  {target > 0 ? `${pct}%` : "-"}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums text-brand-deep">
                  {formatTargetValue(actual, m.unit)}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {formatTargetValue(target, m.unit)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary/60">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${barColor}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              {onTrack && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-success">
                  <TrendingUp className="h-3 w-3" /> On track
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showEdit && (
        <EditTargetsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          initialUserId={userId}
          initialPeriod={period}
        />
      )}
    </section>
  );
}
