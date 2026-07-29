import { Link } from "@tanstack/react-router";
import {
  Activity, Users, Video, Sparkles, MessageSquare,
  LogIn, TrendingUp, Building2, Star, MapPin, Mail, Phone,
  CalendarCheck,
} from "lucide-react";

import { BoatIcon } from "@/components/icons/boat-icon";
import { Badge } from "@/components/ui/badge";
import {
  companyPlan, daysSince, computeDealerScore, has3DTours, SERVICE_LABELS, TIER_STYLES,
  type Company, type Contact, type ServiceKey, brandsForCompany,
  officesForCompany, getContact, contactAvatarUrl, contactInitials,
} from "@/lib/mock-data";
import { commsFor } from "@/lib/comms-log";
import { studioToursForCompany } from "@/lib/studio-tours";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format-date";

function formatDaysAgo(iso: string): string {
  if (!iso) return "Never";
  const d = daysSince(iso);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function toneForDays(iso: string, warnAfter = 30, badAfter = 90) {
  if (!iso) return "text-destructive";
  const d = daysSince(iso);
  if (d > badAfter) return "text-destructive";
  if (d > warnAfter) return "text-warning";
  return "text-emerald-600 dark:text-emerald-400";
}

function Stat({
  icon: Icon, label, value, hint, tone = "text-foreground",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-md border border-border bg-secondary/70 px-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
          {label}
        </div>
        <div className={`truncate text-sm font-semibold ${tone}`}>{value}</div>
        {hint && (
          <div className="truncate text-[11px] text-foreground/70">{hint}</div>
        )}
      </div>
    </div>
  );
}

export function CompanySnapshotPanel({
  company,
  contacts,
  listingsCount,
  onOpenAllOffices,
}: {
  company: Company;
  contacts: Contact[];
  listingsCount: number;
  onOpenAllOffices?: () => void;
}) {
  const { can } = useAuth();
  const canBilling = can("billing");
  const score = computeDealerScore(company);
  const tierStyle = TIER_STYLES[score.tier as keyof typeof TIER_STYLES];
  const tours3d = has3DTours(company);
  const services = Object.entries(company.servicesUsed)
    .filter(([, on]) => on)
    .map(([k]) => k as ServiceKey);
  const brands = brandsForCompany(company.id);
  const offices = officesForCompany(company.id);
  const hq = offices.find((o) => o.isHeadquarters) ?? offices[0];

  const brokers = contacts.filter((c) => c.contactType === "Broker");
  const brokersOnPlatform = brokers.filter(
    (b) => b.lastLoginAt && daysSince(b.lastLoginAt) <= 90,
  );

  const comms = commsFor("company", company.id);
  const lastComm = comms[0];
  const primary = company.primaryContactId ? getContact(company.primaryContactId) : null;

  const studioTours = studioToursForCompany(company.id);
  const lastTour = studioTours[0];

  const onboardingCompleteDate = (company as Record<string, unknown>).onboardingCompleteDate as string | undefined;

  const activeMembersLine = (() => {
    if (brokers.length === 0) return `${contacts.length} contacts on file`;
    return `${brokersOnPlatform.length}/${brokers.length} active on platform (90d)`;
  })();

  const showBroker = company.companyType === "Brokerage" ||
                     company.companyType === "Dealer" ||
                     company.companyType === "Shipyard";

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand" />
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
            At a glance
          </h3>
        </div>
        {showBroker && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
              Account health
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${tierStyle.bg} ${tierStyle.text} ${tierStyle.ring}`}>
              <TrendingUp className="h-3 w-3" />
              {score.tier} · {score.score}
            </span>
          </div>
        )}
      </header>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          icon={BoatIcon}
          label="Active listings"
          value={listingsCount}
          hint={
            tours3d.total > 0
              ? `${tours3d.with3d}/${tours3d.total} with 3D tour`
              : undefined
          }
        />
        {showBroker && (
          <Stat
            icon={Users}
            label="Total Brokers"
            value={`${brokers.length} out of ${(company.totalNumberOfBrokers as number | undefined) ?? brokers.length} on YachtWay`}
            hint={activeMembersLine}
          />
        )}
        <Stat
          icon={Building2}
          label="Total Offices"
          value={`${offices.length} out of ${(company.totalNumberOfOffices as number | undefined) ?? offices.length} on YachtWay`}
          hint={offices.length === 1 ? "1 office on file" : `${offices.length} offices on file`}
        />
        <Stat
          icon={Sparkles}
          label={`Services active - ${companyPlan(company)}`}
          value={`${services.length}/${Object.keys(company.servicesUsed).length}`}
          hint={
            companyPlan(company) === "BASIC"
              ? "Listing platform only - no add-ons"
              : services.slice(0, 3).map((k) => SERVICE_LABELS[k]).join(", ") +
                (services.length > 3 ? ` +${services.length - 3}` : "")
          }
        />
        <Stat
          icon={LogIn}
          label="Last YachtWay Login"
          value={formatDaysAgo(company.lastLogin)}
          tone={toneForDays(company.lastLogin)}
          hint={company.lastLogin ? formatDate(company.lastLogin) : "Never signed in"}
        />
        <Stat
          icon={CalendarCheck}
          label="Onboarding Complete Date"
          value={onboardingCompleteDate ? formatDaysAgo(onboardingCompleteDate) : "Not completed"}
          tone={onboardingCompleteDate ? "text-emerald-600 dark:text-emerald-400" : "text-foreground/60"}
          hint={onboardingCompleteDate ? formatDate(onboardingCompleteDate) : "Onboarding still pending"}
        />
        <Stat
          icon={MessageSquare}
          label="Last communication"
          value={lastComm ? formatDaysAgo(lastComm.occurred_at) : "None logged"}
          tone={lastComm ? toneForDays(lastComm.occurred_at, 14, 45) : "text-foreground/60"}
          hint={
            lastComm
              ? `${lastComm.channel}${lastComm.body ? ` · ${lastComm.body.slice(0, 40)}${lastComm.body.length > 40 ? "…" : ""}` : ""}`
              : "Log an activity to start the timeline"
          }
        />
        <Stat
          icon={Video}
          label="Last Studio session"
          value={
            company.lastStudioSessionAt
              ? formatDaysAgo(company.lastStudioSessionAt)
              : "Never"
          }
          tone={toneForDays(company.lastStudioSessionAt, 45, 120)}
          hint={
            lastTour
              ? `${studioTours.length} tour${studioTours.length === 1 ? "" : "s"} delivered`
              : undefined
          }
        />
        {canBilling && (
        <Stat
          icon={Star}
          label="Studio spend YTD"
          value={
            company.studioSpendYtd
              ? new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: company.currency || "USD",
                  maximumFractionDigits: 0,
                }).format(company.studioSpendYtd)
              : "-"
          }
        />
        )}

      </div>

      {/* Detail rows: people, brands, HQ */}
      <div className="grid grid-cols-1 gap-0 border-t border-border md:grid-cols-3">
        {/* Key people */}
        <div className="border-b border-border p-3 md:border-b-0 md:border-r">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
            Key people
          </div>
          <div className="space-y-1.5">
            {primary ? (
              <PersonRow contact={primary} role="Primary contact" />
            ) : (
              <div className="text-xs text-foreground/60">No primary contact set</div>
            )}
            {contacts
              .filter((c) => c.id !== primary?.id)
              .filter((c) => c.companyRole === "Owner" || c.companyRole === "Admin" || c.companyRole === "Manager")
              .slice(0, 2)
              .map((c) => (
                <PersonRow key={c.id} contact={c} role={c.companyRole ?? c.contactType} />
              ))}
          </div>
        </div>

        {/* Brands */}
        <div className="border-b border-border p-3 md:border-b-0 md:border-r">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
              {company.companyType === "Shipyard" ? "Brands built" : "Brands represented"}
            </div>
            {brands.length > 0 && (
              <span className="text-[10px] text-foreground/60">{brands.length} total</span>
            )}
          </div>
          {brands.length === 0 ? (
            <div className="text-xs text-foreground/60">No brands linked</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {brands.slice(0, 8).map((b) => (
                <span
                  key={b.brandId}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/80 px-1.5 py-0.5 text-[11px] font-medium text-foreground"
                  title={b.exclusive ? "Exclusive" : undefined}
                >
                  {b.brand.name}
                </span>
              ))}
              {brands.length > 8 && (
                <span className="text-[11px] text-foreground/60">+{brands.length - 8} more</span>
              )}
            </div>
          )}
        </div>

        {/* HQ / offices */}
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
              Headquarters
            </div>
            {onOpenAllOffices && (
              <button
                type="button"
                onClick={onOpenAllOffices}
                className="text-[10px] font-semibold text-brand hover:underline"
              >
                All offices
              </button>
            )}
          </div>
          {hq ? (
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-medium">
                <Building2 className="h-3.5 w-3.5 text-brand" />
                {hq.label}
              </div>
              {(hq.city || hq.country) && (
                <div className="flex items-center gap-1.5 text-foreground/70">
                  <MapPin className="h-3 w-3" />
                  {[hq.city, hq.state, hq.country].filter(Boolean).join(", ")}
                </div>
              )}
              {hq.phone && (
                <div className="flex items-center gap-1.5 text-foreground/70">
                  <Phone className="h-3 w-3" />
                  {hq.phone}
                </div>
              )}
              {hq.email && (
                <div className="flex items-center gap-1.5 text-foreground/70">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{hq.email}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1 text-xs text-foreground/60">
              {(company.billingCity || company.billingCountry) ? (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" />
                  {[company.billingCity, company.billingCountry].filter(Boolean).join(", ")}
                </div>
              ) : (
                "No office on file"
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PersonRow({ contact, role }: { contact: Contact; role: string }) {
  const avatar = contactAvatarUrl(contact);
  return (
    <Link
      to="/contacts/$id"
      params={{ id: contact.id }}
      className="flex items-center gap-2 rounded-md px-1 py-1 -mx-1 hover:bg-accent/40"
    >
      {avatar ? (
        <img src={avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-[10px] font-semibold text-brand">
          {contactInitials(contact.firstName, contact.lastName)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-brand">
          {contact.firstName} {contact.lastName}
        </div>
        <div className="truncate text-[10px] text-foreground/70">{role}</div>
      </div>
      <Badge variant="outline" className="text-[9px]">
        {contact.lastLoginAt && daysSince(contact.lastLoginAt) <= 30 ? "Active" : "Idle"}
      </Badge>
    </Link>
  );
}
