import { useEffect, useState } from "react";
import { Check, Minus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  SERVICE_LABELS,
  isServiceAvailableForCompany,
  companyPlan,
  companyAddOns,
  setCompanyService,
  subscribeMockData,
  type ServiceKey,
  type Company,
} from "@/lib/mock-data";

const SERVICE_ORDER: ServiceKey[] = [
  "saas",
  "studio",
  "live",
  "drive",
  "easysign",
  "vato",
  "easyfund",
  "mastercover",
  "easyclose",
  "connectCrm",
  "customWebsite",
];

interface ServicesAdoptionPanelProps {
  company: Company;
}

export function ServicesAdoptionPanel({ company }: ServicesAdoptionPanelProps) {
  const [editing, setEditing] = useState(false);
  const [, forceTick] = useState(0);
  useEffect(() => subscribeMockData(() => forceTick((n) => n + 1)), []);

  // Availability is driven by company type (SERVICES_BY_COMPANY_TYPE), ordered
  // by the display order.
  const applicable = SERVICE_ORDER.filter((k) => isServiceAvailableForCompany(company, k));
  const activeCount = applicable.filter((k) => company.servicesUsed[k]).length;
  const total = applicable.length;
  const plan = companyPlan(company);
  const addOns = companyAddOns(company);

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          Services adoption
        </h3>
        <div className="flex items-center gap-3">
          <span
            title={
              plan === "BASIC"
                ? "Listing platform only - no add-on services"
                : `${addOns.length} add-on ${addOns.length === 1 ? "service" : "services"} active`
            }
            className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              plan === "BASIC"
                ? "bg-muted text-muted-foreground"
                : "bg-brand/15 text-brand-deep"
            }`}
          >
            {plan}
          </span>
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {activeCount} / {total} active
          </span>
          <Button
            size="sm"
            variant={editing ? "secondary" : "outline"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setEditing((v) => !v)}
          >
            <Pencil className="mr-1 h-3 w-3" />
            {editing ? "Done" : "Edit services"}
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {applicable.map((k) => {
          const isActive = company.servicesUsed[k];
          return (
            <div
              key={k}
              className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 ${
                isActive
                  ? "border-success/40 bg-success/10"
                  : "border-border bg-secondary/30"
              }`}
            >
              <span className="text-sm font-medium text-foreground">
                {SERVICE_LABELS[k]}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                    isActive ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {isActive ? "Yes" : "No"}
                </span>
                {editing ? (
                  <Switch
                    checked={isActive}
                    aria-label={`${SERVICE_LABELS[k]} usage`}
                    onCheckedChange={(v) => setCompanyService(company.id, k, v)}
                  />
                ) : isActive ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success text-success-foreground ring-2 ring-success/20">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-label="active" />
                  </span>
                ) : (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
                    <Minus className="h-3 w-3" aria-label="not active" />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {activeCount === 0 && (
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          No services enabled yet - everything is an upsell opportunity.
        </p>
      )}
    </section>
  );
}
