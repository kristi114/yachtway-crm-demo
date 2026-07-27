import { guarded } from "@/components/require-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Minus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { COMPANIES, companyPlan, SERVICE_LABELS, isServiceAvailable, type ServiceKey } from "@/lib/mock-data";

export const Route = createFileRoute("/services")({
  component: guarded("services", "Services adoption", ServicesMatrix),
  head: () => ({
    meta: [
      { title: "Services adoption matrix - YachtWay CRM" },
      { name: "description", content: "Which YachtWay services each dealer, brokerage and lender is using at a glance." },
    ],
  }),
});

const SERVICE_ORDER: ServiceKey[] = [
  "saas", "studio", "live", "drive", "easysign", "vato",
  "easyfund", "mastercover", "easyclose", "connectCrm", "customWebsite",
];

// Services shown when the Fintech vertical filter is active.
const FINTECH_SERVICE_ORDER: ServiceKey[] = [
  "drive", "vato", "easyfund", "mastercover", "easyclose",
];

type VerticalFilter = "all" | "Main" | "FinTech";

function ServicesMatrix() {
  const [vertical, setVertical] = useState<VerticalFilter>("all");
  const visibleServiceOrder = useMemo(
    () =>
      (vertical === "FinTech" ? FINTECH_SERVICE_ORDER : SERVICE_ORDER).filter(
        isServiceAvailable,
      ),
    [vertical],
  );

  // Yacht-industry brokerages can never use Loan apps (EasyFund), PFS (MasterCover), or VATO.
  const isRestrictedForCompany = (c: (typeof COMPANIES)[number], k: ServiceKey) =>
    c.vertical === "Main" && c.companyType === "Brokerage" &&
    (k === "easyfund" || k === "mastercover" || k === "vato");



  const rows = useMemo(() => {
    let list = COMPANIES;
    if (vertical !== "all") list = list.filter((c) => c.vertical === vertical);
    return list;
  }, [vertical]);

  const totals = useMemo(() => {
    const t: Record<ServiceKey, number> = {
      saas: 0, studio: 0, live: 0, drive: 0, vato: 0, easysign: 0,
      easyfund: 0, mastercover: 0, easyclose: 0, connectCrm: 0, customWebsite: 0,
    };
    const eligible: Record<ServiceKey, number> = { ...t };
    for (const c of rows) {
      for (const k of visibleServiceOrder) {
        if (isRestrictedForCompany(c, k)) continue;
        eligible[k]++;
        if (c.servicesUsed[k]) t[k]++;
      }
    }
    return { t, eligible };
  }, [rows, visibleServiceOrder]);


  return (
    <AppShell>
      <PageHeader
        title="Services adoption"
        subtitle="Which YachtWay services each account has enabled. Empty cells are upsell opportunities."
      />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            {(["all", "Main", "FinTech"] as VerticalFilter[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVertical(v)}
                className={`px-2.5 py-1 ${vertical === v ? "bg-brand text-brand-foreground" : "bg-background hover:bg-muted"}`}
              >
                {v === "all" ? "All accounts" : v === "Main" ? "Yacht" : "Fintech"}
              </button>
            ))}
          </div>
          <div className="ml-auto text-muted-foreground">
            {rows.length} account{rows.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left">Account</th>
                <th className="px-2 py-2 text-left">Type</th>
                <th className="px-2 py-2 text-left">Plan</th>
                {visibleServiceOrder.map((k) => (
                  <th key={k} className="px-2 py-2 text-center">{SERVICE_LABELS[k]}</th>
                ))}
                <th className="px-2 py-2 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const applicable = visibleServiceOrder.filter((k) => !isRestrictedForCompany(c, k));
                const count = applicable.filter((k) => c.servicesUsed[k]).length;
                const hasNoServices = count === 0;
                return (
                  <tr key={c.id} className={`border-t border-border hover:bg-muted/30 ${hasNoServices ? "bg-red-500/10" : ""}`}>
                    <td className={`sticky left-0 z-10 px-3 py-2 font-medium ${hasNoServices ? "bg-red-500/10" : "bg-card"}`}>
                      <Link to="/companies/$id" params={{ id: c.id }} className="hover:text-brand hover:underline">
                        {c.name}
                      </Link>
                      <div className="text-[10px] text-muted-foreground">
                        {c.billingCity}{c.billingCountry ? `, ${c.billingCountry}` : ""}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{c.companyType}</td>
                    <td className="px-2 py-2">
                      <span
                        title={
                          companyPlan(c) === "BASIC"
                            ? "Listing platform only - no add-on services"
                            : "Listing platform + add-on services"
                        }
                        className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          companyPlan(c) === "BASIC"
                            ? "bg-muted text-muted-foreground"
                            : "bg-brand/15 text-brand-deep"
                        }`}
                      >
                        {companyPlan(c)}
                      </span>
                    </td>
                    {visibleServiceOrder.map((k) => (
                      <td key={k} className="px-2 py-2 text-center">
                        {isRestrictedForCompany(c, k) ? null : c.servicesUsed[k] ? (

                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-emerald-foreground ring-2 ring-emerald-600/20">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-label="using" />
                          </span>
                        ) : (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
                            <Minus className="h-3 w-3" aria-label="not using" />
                          </span>
                        )}
                      </td>
                    ))}
                    <td className={`px-2 py-2 text-center font-medium tabular-nums ${hasNoServices ? "text-red-500" : ""}`}>{count}</td>
                  </tr>
                );
              })}

            </tbody>
            <tfoot className="border-t border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left">Adoption</th>
                <th />
                {visibleServiceOrder.map((k) => {
                  const denom = totals.eligible[k];
                  const pct = denom ? Math.round((totals.t[k] / denom) * 100) : 0;
                  return (
                    <th key={k} className="px-2 py-2 text-center font-medium text-foreground tabular-nums">
                      {totals.t[k]}
                      <span className="ml-1 text-[10px] text-muted-foreground">{pct}%</span>
                    </th>
                  );
                })}

                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      </PageBody>
    </AppShell>
  );
}
