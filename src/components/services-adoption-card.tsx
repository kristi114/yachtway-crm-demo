import { Check, Minus } from "lucide-react";
import { SERVICE_LABELS, isServiceAvailableForCompany, type Company, type ServiceKey } from "@/lib/mock-data";

const SERVICE_ORDER: ServiceKey[] = [
  "saas", "studio", "live", "drive", "easysign", "vato",
  "easyfund", "mastercover", "easyclose", "connectCrm", "customWebsite",
];

export function ServicesAdoptionCard({ company }: { company: Company }) {
  // Availability is driven by company type (SERVICES_BY_COMPANY_TYPE), shown in
  // the standard display order.
  const services = SERVICE_ORDER.filter((k) => isServiceAvailableForCompany(company, k));
  const count = services.filter((k) => company.servicesUsed[k]).length;


  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          Services adoption
        </h3>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {count} / {services.length} enabled
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {services.map((k) => (
                <th key={k} className="whitespace-nowrap px-2 py-2 text-center font-medium">
                  {SERVICE_LABELS[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {services.map((k) => (
                <td key={k} className="px-2 py-3 text-center">
                  {company.servicesUsed[k] ? (
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
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
