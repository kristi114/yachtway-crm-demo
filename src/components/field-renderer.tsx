import { useState, type ReactNode, type DragEvent } from "react";
import { ChevronRight, HelpCircle, Lock, GripVertical } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { FieldDef, FieldSection } from "@/lib/field-schema";
import { FIELD_OPTIONS, dynamicOptions } from "@/lib/field-options";
import { loadSectionOrder, saveSectionOrder, applyOrder } from "@/lib/section-layout";
import { Badge } from "@/components/ui/badge";

type EditField = (key: string, value: unknown) => void;
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

/** Editable / display control for single- & multi-option fields, sourced from
 *  the catalog options plus any value already on the record (dynamicOptions). */
function OptionControl({
  field, raw, onEditField,
}: {
  field: FieldDef;
  raw: unknown;
  onEditField?: EditField;
}) {
  const declared = FIELD_OPTIONS[field.key];
  if (field.type === "multi_option") {
    const cur = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
    const all = dynamicOptions(declared, ...cur);
    if (!onEditField) {
      return cur.length ? (
        <div className="flex flex-wrap gap-1">
          {cur.map((v) => <Badge key={v} variant="secondary" className="text-[11px]">{v}</Badge>)}
        </div>
      ) : <div className="text-base font-semibold text-foreground">-</div>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {all.map((o) => {
          const on = cur.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onEditField(field.key, on ? cur.filter((x) => x !== o) : [...cur, o])}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${on ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:bg-accent"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  // single_option
  const val = raw == null ? "" : String(raw);
  const all = dynamicOptions(declared, val);
  if (!onEditField) {
    return val ? <Badge variant="secondary">{val}</Badge> : <div className="text-base font-semibold text-foreground">-</div>;
  }
  return (
    <select
      value={val}
      onChange={(e) => onEditField(field.key, e.target.value)}
      className="native-select w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm font-medium"
    >
      {val === "" && <option value="">Select…</option>}
      {all.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function FieldRow({
  field, record, onClick, onEditField,
}: {
  field: FieldDef;
  record: MockRecord;
  onClick?: () => void;
  onEditField?: EditField;
}) {
  const raw = record[field.key];
  const value = formatValue(field, raw, record);
  const isOption = field.type === "single_option" || field.type === "multi_option";
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

      {field.type === "checkbox" && onEditField ? (
        <button
          type="button"
          role="switch"
          aria-checked={raw === true}
          onClick={() => onEditField(field.key, !(raw === true))}
          className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            raw === true ? "bg-brand" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              raw === true ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      ) : isOption ? (
        <OptionControl field={field} raw={raw} onEditField={onEditField} />
      ) : href ? (
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
  onEditField,
  defaultOpen = false,
  extra,
}: {
  section: FieldSection;
  record: MockRecord;
  fieldActions?: Record<string, () => void>;
  onEditField?: EditField;
  defaultOpen?: boolean;
  /** Custom content rendered at the bottom of the section body. */
  extra?: ReactNode;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(defaultOpen);
  const isSensitive = section.sensitivity !== "contact.general" && section.sensitivity !== "company.general";
  const allowed = can(section.sensitivity);

  // Respect per-field pipeline scoping: a field annotated with `pipelines` only
  // appears when the record's pipeline is in that list (used to place e.g. the
  // Dealer field in different sections for different pipelines).
  const recordPipeline = record.pipeline;
  const inPipeline = (f: FieldSection["fields"][number]) =>
    !f.pipelines || (typeof recordPipeline === "string" && f.pipelines.includes(recordPipeline));
  // In edit mode, keep checkboxes visible even when unchecked so they can be
  // toggled on (otherwise an unchecked box counts as "empty" and is hidden).
  const populated = section.fields.filter(
    (f) => inPipeline(f) && (!isEmpty(f, record[f.key]) || (!!onEditField && f.type === "checkbox")),
  );
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
                <FieldRow key={f.key} field={f} record={record} onClick={fieldActions?.[f.key]} onEditField={onEditField} />
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
  onEditField,
  sectionExtras,
  only,
  exclude,
  reorderable,
  layoutKey,
}: {
  sections: readonly FieldSection[];
  record: MockRecord;
  fieldActions?: Record<string, () => void>;
  onEditField?: EditField;
  /** Extra content rendered inside a section, keyed by lowercase section title. */
  sectionExtras?: Record<string, ReactNode>;
  /** Render only these section titles (lowercase). */
  only?: string[];
  /** Hide these section titles (lowercase). */
  exclude?: string[];
  /** Enable per-user drag-to-reorder of the section cards. Requires layoutKey. */
  reorderable?: boolean;
  /** Distinct key for the saved order (e.g. the object key: "company"). */
  layoutKey?: string;
}) {
  const { can, user } = useAuth();
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

  const useReorder = Boolean(reorderable && layoutKey);
  // Saved per-user order (section ids); new/unknown ids keep default position.
  const [savedOrder, setSavedOrder] = useState<string[]>(() =>
    useReorder ? loadSectionOrder(layoutKey!, user.id) : [],
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const orderedIds = useReorder ? applyOrder(ranked.map((s) => s.id), savedOrder) : ranked.map((s) => s.id);
  const display = orderedIds
    .map((id) => ranked.find((s) => s.id === id))
    .filter((s): s is FieldSection => Boolean(s));

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const ids = display.map((s) => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from !== -1 && to !== -1) {
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      setSavedOrder(ids);
      saveSectionOrder(layoutKey!, user.id, ids);
    }
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="space-y-4">
      {display.map((s, i) => {
        const card = (
          <SectionCard
            section={s}
            record={record}
            fieldActions={fieldActions}
            onEditField={onEditField}
            extra={sectionExtras?.[normalizeTitle(s.title)]}
            // First subsection ("Overview") is expanded, everything else collapsed.
            defaultOpen={i === 0}
          />
        );
        if (!useReorder) return <div key={s.id}>{card}</div>;
        return (
          <div
            key={s.id}
            draggable
            onDragStart={() => setDragId(s.id)}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDragOver={(e: DragEvent) => { e.preventDefault(); if (overId !== s.id) setOverId(s.id); }}
            onDrop={(e: DragEvent) => { e.preventDefault(); onDrop(s.id); }}
            className={`relative pl-6 transition ${dragId === s.id ? "opacity-40" : ""} ${
              overId === s.id && dragId !== s.id ? "ring-2 ring-brand/40 rounded-sm" : ""
            }`}
          >
            <span
              className="absolute left-0 top-3 cursor-grab text-muted-foreground active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </span>
            {card}
          </div>
        );
      })}
    </div>
  );
}

// Re-export for use by the create dialog.
export { autoSplit, isEmpty };
