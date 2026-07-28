import { Link } from "@tanstack/react-router";
import { TrendingUp, Landmark, PieChart } from "lucide-react";

import { useMoney } from "@/lib/auth";
import {
  fintechProductPnl, bankToolAdoption, bankEngagementSplit,
  BANK_TOOLS, bankUsesTool,
} from "@/lib/fintech-metrics";

/**
 * Fintech P&L + bank partner tool adoption.
 * Revenue/profit assumptions live in `@/lib/fintech-metrics`.
 */
export function FintechRevenuePanel() {
  const { format: fmt } = useMoney();
  const pnl = fintechProductPnl();
  const tools = bankToolAdoption();
  const { banks, active, dormant } = bankEngagementSplit();
  const year = new Date().getFullYear();

  const totalRevenue = pnl.reduce((s, p) => s + p.annualRevenue, 0);
  const totalProfit = pnl.reduce((s, p) => s + p.annualProfit, 0);

  return (
    <>
      {/* ---------- Annual revenue & profit by product ---------- */}
      <section className="mt-6 overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand" />
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
              Annual revenue &amp; profit · {year}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">Won deals this year</span>
        </header>

        <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
          {pnl.map((p) => (
            <div key={p.key} className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{p.label}</div>
                <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {p.wonDeals} won
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Annual revenue</div>
                  <div className="mt-0.5 text-xl font-semibold tabular-nums">{fmt(p.annualRevenue)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Gross profit</div>
                  <div className="mt-0.5 text-xl font-semibold tabular-nums text-success">{fmt(p.annualProfit)}</div>
                  <div className="text-[11px] text-muted-foreground">{p.marginPct}% margin</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Open pipeline <span className="font-medium tabular-nums text-foreground">{fmt(p.openPipeline)}</span>
              </div>
            </div>
          ))}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/40 px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">Combined fintech</span>
          <span className="tabular-nums">
            Revenue <span className="font-semibold text-foreground">{fmt(totalRevenue)}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            Profit <span className="font-semibold text-success">{fmt(totalProfit)}</span>
          </span>
        </footer>
      </section>

      {/* ---------- Bank tool adoption ---------- */}
      <section className="mt-6 overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-brand" />
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
              Bank partners using our tools
            </h2>
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {banks.length}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {active.length} live on at least one tool · {dormant.length} on none
          </span>
        </header>

        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
          {tools.map((t) => (
            <div key={t.key} className="px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <PieChart className="h-3.5 w-3.5 text-brand" /> {t.label}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {t.using}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ {t.total}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-secondary">
                <div className="h-full bg-brand" style={{ width: `${t.pct}%` }} />
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                {t.notUsing} not using · {t.hint}
              </div>
            </div>
          ))}
        </div>

        <ul className="divide-y divide-border border-t border-border">
          {banks.map((c) => {
            const missing = BANK_TOOLS.filter((t) => !bankUsesTool(c, t.key));
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <Link to="/companies/$id" params={{ id: c.id }} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">{c.companyType}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {missing.length === 0 ? (
                    <span className="rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                      All tools live
                    </span>
                  ) : (
                    missing.map((t) => (
                      <span
                        key={t.key}
                        className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
                      >
                        No {t.label}
                      </span>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
