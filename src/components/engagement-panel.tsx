import { Clock, Mail, Phone, CalendarDays, MessageCircle, Users } from "lucide-react";
import type { Company, Contact } from "@/lib/mock-data";
import { SERVICE_LABELS, daysSince, type ServiceKey } from "@/lib/mock-data";
import { useMoney } from "@/lib/auth";

const CHANNEL_ICON: Record<string, typeof Mail> = {
  Email: Mail,
  Call: Phone,
  Meeting: CalendarDays,
  WhatsApp: MessageCircle,
};

function toneForDays(d: number) {
  if (d <= 7) return "text-success";
  if (d <= 30) return "text-warning";
  return "text-destructive";
}

export function EngagementPanel({
  company, contacts, onGapClick,
}: {
  company: Company;
  contacts?: Contact[];
  onGapClick?: () => void;
}) {
  const days = daysSince(company.lastContactedAt);
  const Icon = CHANNEL_ICON[company.lastContactChannel] ?? Mail;
  const { format: fmtMoney } = useMoney();

  // Match the Broker Roster: count Broker contacts actually linked to the
  // company. Fall back to the stored crmBrokerCount when contacts aren't
  // provided (e.g. non-dealer views).
  const brokersOnYachtway = contacts
    ? contacts.filter((c) => c.contactType === "Broker").length
    : company.crmBrokerCount;
  const knownBrokers = Math.max(company.scrapedBrokerCount, brokersOnYachtway);
  const coverage = knownBrokers > 0
    ? Math.round((brokersOnYachtway / knownBrokers) * 100)
    : 0;
  const gap = Math.max(0, company.scrapedBrokerCount - brokersOnYachtway);

  const services = (Object.entries(company.servicesUsed) as [ServiceKey, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => SERVICE_LABELS[k]);
  const notUsed = (Object.entries(company.servicesUsed) as [ServiceKey, boolean][])
    .filter(([, v]) => !v)
    .map(([k]) => SERVICE_LABELS[k]);

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <header className="border-b border-border bg-secondary/60 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
          Engagement
        </h3>
      </header>

      <div className="grid grid-cols-1 divide-y divide-border">
        {/* Last contact */}
        <div className="flex items-start gap-3 px-4 py-3">
          <Clock className={`mt-0.5 h-4 w-4 ${toneForDays(days)}`} />
          <div className="flex-1 text-[13px]">
            <div className="font-medium">
              Last contacted {days === Infinity ? "-" : `${days}d ago`}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="h-3 w-3" />
              {company.lastContactChannel || "No channel"} · {company.lastContactedAt || "-"}
            </div>
          </div>
        </div>

        {/* Broker coverage */}
        {company.vertical === "Main" && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <Users className="h-4 w-4 text-brand" />
              Broker coverage
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {brokersOnYachtway} added on YachtWay
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-brand"
                style={{ width: `${Math.min(100, coverage)}%` }}
              />
            </div>
            {gap > 0 ? (
              onGapClick ? (
                <button
                  type="button"
                  onClick={onGapClick}
                  className="mt-1.5 text-left text-xs text-warning underline decoration-warning/40 hover:decoration-warning"
                >
                  Opportunity: {gap} broker{gap === 1 ? "" : "s"} in the wild not yet linked in CRM.
                </button>
              ) : (
                <div className="mt-1.5 text-xs text-warning">
                  Opportunity: {gap} broker{gap === 1 ? "" : "s"} not yet linked in CRM.
                </div>
              )
            ) : (
              <div className="mt-1.5 text-xs text-success">Full broker coverage from enrichment data.</div>
            )}
          </div>
        )}

        {/* Services used */}
        <div className="px-4 py-3">
          <div className="text-[13px] font-medium">YachtWay services</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {services.length === 0 && (
              <span className="text-xs text-muted-foreground">No services active yet.</span>
            )}
            {services.map((s) => (
              <span key={s} className="rounded-sm bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand-deep">
                {s}
              </span>
            ))}
          </div>
          {notUsed.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              Not using: {notUsed.join(", ")}
            </div>
          )}
          {company.studioSpendYtd > 0 && (
            <div className="mt-2 text-xs">
              Studio spend YTD:{" "}
              <span className="font-semibold text-brand-deep">
                {fmtMoney(company.studioSpendYtd, company.currency)}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
