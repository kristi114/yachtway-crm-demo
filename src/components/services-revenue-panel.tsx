import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Layers } from "lucide-react";
import {
  COMPANIES, OPPORTUNITIES, SERVICE_LABELS, isServiceAvailable, type ServiceKey,
} from "@/lib/mock-data";
import { useMoney } from "@/lib/auth";

// ==========================================================
// Services by revenue & adoption (admin)
// ----------------------------------------------------------
// - Revenue: sums opportunity amounts per service by mapping
//   Opportunity.pipeline -> ServiceKey. Won vs open shown separately.
// - Adoption: % of Main-vertical dealers/brokerages with the
//   service flag turned on in servicesUsed.
// ==========================================================

const PIPELINE_TO_SERVICE: Record<string, ServiceKey | null> = {
  "SaaS Sales":       "saas",
  "Dealer Signups":   "saas",
  "Studio":           "studio",
  "EasyFund":         "easyfund",
  "MasterCover":      "mastercover",
  "EasyClose":        "easyclose",
  "Referral Partners": null, // partner rev, not a product service
};

// Services with no direct pipeline still get an adoption row.
const ALL_SERVICES: ServiceKey[] = ([
  "saas", "studio", "vato", "easyfund", "mastercover", "easyclose",
  "customWebsite", "connectCrm", "live", "drive",
] as ServiceKey[]).filter(isServiceAvailable);

const WON_STAGES = new Set([
  "Closed Won", "Won", "Completed", "Contract", "Funded", "Booked",
]);
const LOST_STAGES = new Set(["Closed Lost", "Lost"]);

type Row = {
  key: ServiceKey;
  label: string;
  wonRevenue: number;
  openRevenue: number;
  wonCount: number;
  openCount: number;
  adoptionPct: number;   // % of dealers using it
  adopters: number;      // absolute dealers using it
  eligible: number;      // dealers considered
};

function buildRows(): Row[] {
  // Adoption pool: Main-vertical dealers & brokerages.
  const pool = COMPANIES.filter(
    (c) => c.vertical === "Main" &&
      (c.companyType === "Dealer" || c.companyType === "Brokerage"),
  );
  const eligible = Math.max(1, pool.length);

  return ALL_SERVICES.map((key) => {
    let wonRevenue = 0, openRevenue = 0, wonCount = 0, openCount = 0;
    for (const o of OPPORTUNITIES) {
      const svc = PIPELINE_TO_SERVICE[o.pipeline];
      if (svc !== key) continue;
      if (WON_STAGES.has(o.stage)) { wonRevenue += o.amountUsd; wonCount += 1; }
      else if (!LOST_STAGES.has(o.stage)) { openRevenue += o.amountUsd; openCount += 1; }
    }
    const adopters = pool.filter((c) => c.servicesUsed[key]).length;
    return {
      key, label: SERVICE_LABELS[key],
      wonRevenue, openRevenue, wonCount, openCount,
      adopters, eligible: pool.length,
      adoptionPct: Math.round((adopters / eligible) * 100),
    };
  });
}

type SortMode = "revenue" | "adoption";

export function ServicesRevenuePanel() {
  const { formatCompact: fmt } = useMoney();
  const [mode, setMode] = useState<SortMode>("revenue");

  const rows = useMemo(() => buildRows(), []);
  const sorted = useMemo(() => {
    const copy = [...rows];
    if (mode === "revenue") copy.sort((a, b) => (b.wonRevenue + b.openRevenue) - (a.wonRevenue + a.openRevenue));
    else copy.sort((a, b) => b.adoptionPct - a.adoptionPct);
    return copy;
  }, [rows, mode]);

  const maxRevenue = Math.max(1, ...rows.map((r) => r.wonRevenue + r.openRevenue));
  const totalWon = rows.reduce((s, r) => s + r.wonRevenue, 0);
  const totalOpen = rows.reduce((s, r) => s + r.openRevenue, 0);

  // Highlight callouts
  const topDriver = [...rows].sort((a, b) => b.wonRevenue - a.wonRevenue)[0];
  const highAdoption = [...rows].sort((a, b) => b.adoptionPct - a.adoptionPct)[0];
  const laggard = [...rows]
    .filter((r) => r.eligible > 0)
    .sort((a, b) => a.adoptionPct - b.adoptionPct)[0];

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-col gap-3 border-b border-border bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
            <Layers className="h-4 w-4 text-brand" /> Services · revenue vs adoption
          </h2>
          <p className="text-xs text-muted-foreground">
            What drives revenue, what dealers already use, and what's under-adopted.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1 text-xs">
          {(["revenue", "adoption"] as SortMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                "rounded-full px-3 py-1 font-medium capitalize transition " +
                (mode === m ? "bg-brand text-brand-foreground shadow-sm" : "text-muted-foreground hover:text-brand-deep")
              }
            >
              Sort by {m}
            </button>
          ))}
        </div>
      </header>

      {/* Callouts */}
      <div className="grid grid-cols-1 gap-3 border-b border-border bg-muted/20 p-4 md:grid-cols-3">
        <Callout tone="brand"    label="Top revenue driver" value={topDriver.label}
          sub={`${fmt(topDriver.wonRevenue)} won · ${fmt(topDriver.openRevenue)} open`} />
        <Callout tone="success"  label="Highest adoption" value={`${highAdoption.label} · ${highAdoption.adoptionPct}%`}
          sub={`${highAdoption.adopters} of ${highAdoption.eligible} dealers`} />
        <Callout tone="warning"  label="Under-adopted" value={`${laggard.label} · ${laggard.adoptionPct}%`}
          sub={`${laggard.adopters} of ${laggard.eligible} dealers · upsell opportunity`} />
      </div>

      <div className="px-5 py-4">
        <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>{sorted.length} services</span>
          <span className="tabular-nums">
            {fmt(totalWon)} won · {fmt(totalOpen)} in pipeline
          </span>
        </div>
        <ul className="space-y-2">
          {sorted.map((r) => {
            const rev = r.wonRevenue + r.openRevenue;
            const revPct = (rev / maxRevenue) * 100;
            const wonPct = rev > 0 ? (r.wonRevenue / rev) * 100 : 0;
            const adoptTone =
              r.adoptionPct >= 60 ? "text-success"
              : r.adoptionPct >= 30 ? "text-brand-deep"
              : "text-warning";
            const AdoptIcon = r.adoptionPct >= 30 ? TrendingUp : TrendingDown;
            return (
              <li key={r.key} className="rounded-xl border border-border/60 bg-background p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-brand-deep">{r.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {r.wonCount} won · {r.openCount} open opps
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-brand-deep">{fmt(rev)}</div>
                    <div className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${adoptTone}`}>
                      <AdoptIcon className="h-3 w-3" />
                      {r.adoptionPct}% adopted
                      <span className="text-muted-foreground font-normal">
                        · {r.adopters}/{r.eligible}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Revenue bar: won (solid) + open (lighter) */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-[74px] shrink-0 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Revenue
                  </span>
                  <div className="flex h-2 flex-1 gap-[2px] overflow-hidden rounded-full bg-secondary/60">
                    <div
                      className="h-full rounded-l-full bg-success transition-[width] duration-700"
                      style={{ width: `${revPct * (wonPct / 100)}%` }}
                      title={`Won ${fmt(r.wonRevenue)}`}
                    />
                    <div
                      className="h-full rounded-r-full bg-brand/50 transition-[width] duration-700"
                      style={{ width: `${revPct * (1 - wonPct / 100)}%` }}
                      title={`Open ${fmt(r.openRevenue)}`}
                    />
                  </div>
                </div>

                {/* Adoption bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="w-[74px] shrink-0 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Adoption
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary/60">
                    <div
                      className={
                        "h-full rounded-full transition-[width] duration-700 " +
                        (r.adoptionPct >= 60 ? "bg-success" : r.adoptionPct >= 30 ? "bg-brand" : "bg-warning")
                      }
                      style={{ width: `${r.adoptionPct}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-success" /> Won revenue
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-brand/50" /> Open pipeline
          </span>
        </div>
      </div>
    </section>
  );
}

function Callout({
  tone, label, value, sub,
}: { tone: "brand" | "success" | "warning"; label: string; value: string; sub: string }) {
  const ring =
    tone === "success" ? "border-success/30 bg-success/5"
    : tone === "warning" ? "border-warning/30 bg-warning/5"
    : "border-brand/30 bg-brand/5";
  const text =
    tone === "success" ? "text-success"
    : tone === "warning" ? "text-warning"
    : "text-brand-deep";
  return (
    <div className={`rounded-xl border ${ring} p-3`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-semibold ${text}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
