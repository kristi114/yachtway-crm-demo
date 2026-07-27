import { useState, type ReactNode } from "react";
import { ChevronRight, HelpCircle, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { FieldDef, FieldSection } from "@/lib/field-schema";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type MockRecord = Record<string, unknown>;

// A field is considered "empty" (nothing to show on the profile) when the
// raw value is null, undefined, empty string, empty array, false boolean,
// or numeric zero. Detail pages only render fields that carry real data -
// zeros and unchecked flags are noise on read-only views.
function isEmpty(field: FieldDef, raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === "string" && raw.trim() === "") return true;
  if (Array.isArray(raw) && raw.length === 0) return true;
  if (field.type === "checkbox" && raw === false) return true;
  if (field.type === "number" && (raw === 0 || raw === "0")) return true;
  if (field.type === "money" && (raw === 0 || raw === "0")) return true;
  return false;
}

function formatValue(field: FieldDef, raw: unknown, record: MockRecord): string {
  if (raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) {
    return "-";
  }
  switch (field.type) {
    case "money": {
      const code = (typeof record.currency === "string" ? record.currency : "USD") as
        "USD" | "EUR" | "GBP";
      return new Intl.NumberFormat(
        code === "USD" ? "en-US" : code === "GBP" ? "en-GB" : "de-DE",
        { style: "currency", currency: code, maximumFractionDigits: 0 },
      ).format(Number(raw));
    }
    case "number":
      return `${new Intl.NumberFormat("en-US").format(Number(raw))}${field.unit ? ` ${field.unit}` : ""}`;
    case "date":
      return String(raw);
    case "checkbox":
      return raw ? "Yes" : "No";
    case "multi_option":
      return (raw as string[]).join(", ");
    case "url":
      return String(raw).replace(/^https?:\/\//, "");
    default:
      return String(raw);
  }
}

function FieldRow({
  field, record, onClick,
}: {
  field: FieldDef;
  record: MockRecord;
  onClick?: () => void;
}) {
  const raw = record[field.key];
  const value = formatValue(field, raw, record);
  const rawUrl = field.type === "url" && typeof raw === "string" && raw.trim() !== "" ? raw : null;
  const href = rawUrl ? (rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`) : null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-secondary/50 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-1">
        <div className="truncate text-sm font-normal text-muted-foreground" title={field.key}>
          {field.label}
        </div>
        {field.help && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`About ${field.label}`}
                  className="shrink-0 text-muted-foreground/70 transition-colors hover:text-brand"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-[12px] leading-snug">
                {field.help}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit max-w-full break-words rounded-sm text-base font-semibold text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
        >
          {value}
        </a>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="w-fit max-w-full break-words rounded-sm text-left text-base font-semibold text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
        >
          {value}
        </button>
      ) : (
        <div className="break-words text-base font-semibold text-foreground">{value}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-grouping: with catalog sections containing 100+ fields, we split each
// section into smaller subsections by field-key prefix so the detail view is
// scannable and every subsection can collapse independently.
// ---------------------------------------------------------------------------

const PREFIX_GROUPS: [RegExp, string][] = [
  [/^(billing|xero|stripe|arrUsd|saasArr|total(Amount|Draft|Unallocated|Invoiced|Paid))/, "Accounting"],
  [/^(mainOffice|office\d)/, "Offices"],
  [/^api/, "System"],
  [/^(studio|tour3d|listingsW3d)/, "Studio & 3D tours"],
  [/^easyfund/, "EasyFund"],
  // easysign* fields stay with their parent section (Platform Adoption).
  [/^easyclose/, "EasyClose"],
  [/^mastercover/, "MasterCover"],
  [/^vato/, "VATO"],
  // Live stream metrics are a Platform Adoption signal.
  [/^live/, "Platform Adoption"],
  [/^drive/, "Drive"],
  [/^connectCrm/, "Connect CRM"],
  [/^customWebsite/, "Custom website"],
  [/^(listings|listing|soldListings|firstListingDate|activeListings|avgListing|totalActiveListings|listingsAllTime)/, "Listings performance"],
  [/^(totalNumberOfBrokers|scrapedBrokerCount|crmBrokerCount|totalNumberOfOffices)/, "Team"],
  // Onboarding completion date is surfaced in the "At a glance" snapshot panel.
  [/^onboardingCompleteDate$/, "At a glance"],
  [/^(signup|onboarding|firstSignupDate|sqlTriggeredDate|has(Clicked|Requested))/, "Signup & onboarding"],
  [/^(playbook|upsell)/, "Playbook & upsell"],
  // Last YachtWay login is surfaced in the "At a glance" snapshot panel.
  [/^lastLogin$/, "At a glance"],
  [/^(lastContacted|lastContactChannel|lastStudioSession|nextStep)/, "Engagement"],
  [/^(doNotCall|emailOptOut|highIntentFlag)/, "Preferences"],
  [/^(sf|yachtwayDb|yachtwayDealerPage|enrichedFromAws|logoUrl|hubspot|salesforce)/, "System IDs"],
  // Listing-specific
  [/^(engine|generator|horsepower|numberOfEngines|driveType|fuel)/, "Powertrain"],
  [/^(hull|beam|draft|dryWeight|overallLength|waterlineLength|lengthFt|cruiseSpeed|topSpeed|range)/, "Dimensions & performance"],
  [/^(cabins|guests|crew|doubleBeds|singleBeds|dryHeads|wetHeads|powderRoom)/, "Accommodations"],
  [/^(views|inquiries|phoneClicks|socialReach|spotlight)/, "Analytics"],
  [/^(vesselLocation|countryOfOrigin)/, "Location"],
  [/^(taxStatus|importDuty|isPriceVisible|isExclusive|isAvailableForCoBrokerage|hasSpotlight|has3dTour|hasVideo|priceHidden|priceChanges|soldPrice|vesselPrice|currency)/, "Pricing & flags"],
];

function classifyField(key: string): string {
  for (const [re, name] of PREFIX_GROUPS) if (re.test(key)) return name;
  return "Overview";
}

function autoSplit(section: FieldSection): FieldSection[] {
  // Only split when there are enough fields to warrant it.
  if (section.fields.length < 20) return [section];
  const buckets = new Map<string, FieldDef[]>();
  for (const f of section.fields) {
    const grp = classifyField(f.key);
    const arr = buckets.get(grp) ?? [];
    arr.push(f);
    buckets.set(grp, arr);
  }
  // "Team" (total brokers / total offices) and "At a glance" fields
  // (e.g. Last YachtWay Login) are surfaced in the snapshot panel, so they
  // are not repeated here.
  const hiddenGroups = new Set(["Team", "At a glance"]);
  return orderedGroupKeys(buckets, section.title, hiddenGroups)
    .filter((k) => buckets.has(k) && !hiddenGroups.has(k))
    .map((k, i) => ({
      id: `${section.id}__${i}`,
      title: k === "Overview" ? section.title : k,
      sensitivity: section.sensitivity,
      fields: buckets.get(k)!,
    }));
}

function orderedGroupKeys(
  buckets: Map<string, FieldDef[]>,
  sectionTitle: string,
  hiddenGroups: Set<string>,
): string[] {
  const endGroups = new Set(["System IDs", "System"]);
  return [
    "Overview",
    ...Array.from(buckets.keys()).filter((k) => k !== "Overview" && !endGroups.has(k) && !hiddenGroups.has(k)),
    ...Array.from(buckets.keys()).filter((k) => endGroups.has(k) && !hiddenGroups.has(k)),
  ];
}

// Default visual priority for sections when no custom order is saved.
// Higher numbers sink to the bottom of the page.
const SECTION_PRIORITY: Record<string, number> = {
  Overview: 0,
  "System IDs": 99,
  System: 99,
};

export function SectionCard({
  section,
  record,
  fieldActions,
  defaultOpen = false,
  extra,
}: {
  section: FieldSection;
  record: MockRecord;
  fieldActions?: Record<string, () => void>;
  defaultOpen?: boolean;
  /** Custom content rendered at the bottom of the section body. */
  extra?: ReactNode;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(defaultOpen);
  const isSensitive = section.sensitivity !== "contact.general" && section.sensitivity !== "company.general";
  const allowed = can(section.sensitivity);

  const populated = section.fields.filter((f) => !isEmpty(f, record[f.key]));
  // Hide entire section when nothing is populated and the user has access.
  // (Restricted sections still show the lock message.)
  if (allowed && populated.length === 0 && !extra) return null;

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-border bg-secondary px-4 py-2.5 text-left hover:bg-secondary/80"
        aria-expanded={open}
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-deep">
          <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
          {section.title}
          <span className="ml-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/70">
            {populated.length}
          </span>
        </h3>
        {isSensitive && (
          <Badge
            variant="outline"
            className="border-warning/40 bg-sensitive text-[10px] uppercase tracking-wider text-sensitive-foreground"
          >
            Sensitive · {section.sensitivity}
          </Badge>
        )}
      </button>

      {open && (allowed ? (
        <div>
          {populated.length > 0 && (
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {populated.map((f) => (
                <FieldRow key={f.key} field={f} record={record} onClick={fieldActions?.[f.key]} />
              ))}
            </div>
          )}
          {extra}
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-6 text-sm text-foreground/70">
          <Lock className="h-4 w-4" />
          <div>
            <div className="font-medium text-foreground">Restricted section</div>
            <div className="text-xs">
              Your role does not have the <code className="rounded bg-muted px-1 py-0.5">{section.sensitivity}</code> grant.
              Backend will enforce this via Postgres RLS.
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

export function DetailSections({
  sections,
  record,
  fieldActions,
  sectionExtras,
  only,
  exclude,
}: {
  sections: readonly FieldSection[];
  record: MockRecord;
  fieldActions?: Record<string, () => void>;
  /** Extra content rendered inside a section, keyed by lowercase section title. */
  sectionExtras?: Record<string, ReactNode>;
  /** Render only these section titles (lowercase). */
  only?: string[];
  /** Hide these section titles (lowercase). */
  exclude?: string[];
}) {
  const { can } = useAuth();
  const canBilling = can("billing");
  const expanded = sections.flatMap((s) => (s.showWhen && !s.showWhen(record) ? [] : autoSplit(s)));

  // Merge duplicate section titles (e.g. two source sections both producing
  // "Studio & 3D tours") so each title appears only once with combined fields.
  // Matching is normalized so trailing spaces or case differences don't split
  // what should be the same section.
  function normalizeTitle(title: string) {
    return title.toLowerCase().replace(/\s+/g, " ").trim();
  }

  const merged = Array.from(
    expanded.reduce((map, s) => {
      const key = normalizeTitle(s.title);
      const existing = map.get(key);
      if (existing) {
        const seen = new Set(existing.fields.map((f) => f.key));
        existing.fields = [
          ...existing.fields,
          ...s.fields.filter((f) => !seen.has(f.key)),
        ];
      } else {
        map.set(key, { ...s, fields: [...s.fields] });
      }
      return map;
    }, new Map<string, FieldSection>()).values(),
  ).filter((s) => {
    const t = normalizeTitle(s.title);
    if (only && !only.some((o) => normalizeTitle(o) === t)) return false;
    if (exclude && exclude.some((o) => normalizeTitle(o) === t)) return false;
    return true;
  })
    // Money figures (revenue, spend, commissions) are part of the billing area.
    // Roles without that grant - marketing by default - never see the numbers.
    .map((s) =>
      canBilling ? s : { ...s, fields: s.fields.filter((f) => f.type !== "money") },
    )
    .filter((s) => s.fields.length > 0);

  // Default visual priority: higher numbers sink to the bottom.
  const sectionWeight = (s: FieldSection) =>
    SECTION_PRIORITY[normalizeTitle(s.title)] ?? 1;
  const ranked = [...merged].sort((a, b) => sectionWeight(a) - sectionWeight(b));

  return (
    <div className="space-y-4">
      {ranked.map((s, i) => (
        <SectionCard
          key={s.id}
          section={s}
          record={record}
          fieldActions={fieldActions}
          extra={sectionExtras?.[normalizeTitle(s.title)]}
          // First subsection ("Overview") is expanded, everything else collapsed.
          defaultOpen={i === 0}
        />
      ))}
    </div>
  );
}

// Re-export for use by the create dialog.
export { autoSplit, isEmpty };
