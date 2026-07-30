import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDef, FieldSection } from "@/lib/field-schema";
import { autoSplit, isHiddenIdField } from "@/components/field-renderer";
import { FIELD_OPTIONS, dynamicOptions } from "@/lib/field-options";
import { COMPANIES, CONTACTS } from "@/lib/mock-data";
import { readAdminConfig } from "@/lib/admin-config";

// System-identifier fields hidden by default on create (revealed via the toggle).
const HIDDEN_ON_CREATE = new Set<string>([
  "id", "ownerId", "parentCompanyId", "primaryContactId", "easysignPrimaryContactId", "createdById",
]);

// Fields that should be typeahead lookups → (entity source, paired id field to set).
type LookupSource = "company" | "contact" | "user";
const LOOKUP_FIELDS: Record<string, { source: LookupSource; idKey?: string }> = {
  owner: { source: "user", idKey: "ownerId" },
  parentCompany: { source: "company", idKey: "parentCompanyId" },
  primaryContact: { source: "contact", idKey: "primaryContactId" },
  company: { source: "company", idKey: "companyId" },
};

interface LookupOption { id: string; label: string; sub?: string }
function lookupOptions(source: LookupSource, query: string): LookupOption[] {
  const q = query.trim().toLowerCase();
  let all: LookupOption[];
  if (source === "company") {
    all = COMPANIES.map((c) => ({ id: c.id, label: c.name, sub: c.companyType }));
  } else if (source === "contact") {
    all = CONTACTS.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim(), sub: c.email }));
  } else {
    all = readAdminConfig().users.map((u) => ({ id: u.id, label: u.name, sub: u.email }));
  }
  const matches = q ? all.filter((o) => o.label.toLowerCase().includes(q) || (o.sub ?? "").toLowerCase().includes(q)) : all;
  return matches.slice(0, 8);
}

/** Typeahead lookup: type to filter, click to select the entity (name + id). */
function LookupInput({
  source, value, onPick,
}: {
  source: LookupSource;
  value: string;
  onPick: (label: string, id: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const opts = open ? lookupOptions(source, query) : [];
  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={`Search ${source === "user" ? "users" : source === "contact" ? "contacts" : "companies"}…`}
        className="h-8 text-[13px]"
      />
      {open && opts.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg">
          {opts.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onPick(o.label, o.id); setQuery(o.label); setOpen(false); }}
                className="flex w-full flex-col items-start px-3 py-1.5 text-left text-[13px] hover:bg-accent"
              >
                <span className="font-medium text-foreground">{o.label}</span>
                {o.sub && <span className="text-[11px] text-muted-foreground">{o.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Values = Record<string, unknown>;

function defaultForField(f: FieldDef): unknown {
  switch (f.type) {
    case "checkbox": return false;
    case "number":
    case "money": return "";
    case "multi_option": return [];
    default: return "";
  }
}

function FieldInput({
  field, value, onChange, setField,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  /** Set any field by key (used by lookups to also fill the paired id field). */
  setField: (key: string, v: unknown) => void;
}) {
  const common = "h-8 text-[13px]";
  const lookup = LOOKUP_FIELDS[field.key];
  if (lookup) {
    return (
      <LookupInput
        source={lookup.source}
        value={String(value ?? "")}
        onPick={(label, id) => {
          onChange(label);
          if (lookup.idKey) setField(lookup.idKey, id);
        }}
      />
    );
  }
  switch (field.type) {
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-muted-foreground">{field.help ?? "Enabled"}</span>
        </label>
      );
    case "textarea":
      return (
        <Textarea
          rows={2}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="text-[13px]"
        />
      );
    case "money":
      return (
        <CurrencyInput
          value={Number(value) || 0}
          onChange={(n) => onChange(n)}
          className={common}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={common}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={common}
        />
      );
    case "single_option": {
      // Options come from the field itself, else the catalog picklist.
      const opts = field.options?.length
        ? [...field.options]
        : dynamicOptions(FIELD_OPTIONS[field.key] ?? [], String(value ?? ""));
      if (opts.length) {
        return (
          <select
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="native-select h-8 w-full rounded-md border border-input bg-transparent px-2 text-[13px]"
          >
            <option value="">-</option>
            {opts.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        );
      }
      return <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={common} />;
    }
    default:
      return (
        <Input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={common}
        />
      );
  }
}

function SectionBlock({
  section, values, onChange, defaultOpen, requiredKeys, readOnlyKeys,
}: {
  section: FieldSection;
  values: Values;
  onChange: (key: string, v: unknown) => void;
  defaultOpen: boolean;
  requiredKeys: Set<string>;
  readOnlyKeys: Set<string>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-border bg-secondary/60 px-4 py-2 text-left hover:bg-secondary/80"
        aria-expanded={open}
      >
        <h3 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-brand-deep">
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
          {section.title}
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {section.fields.length}
          </span>
        </h3>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-2">
          {section.fields.map((f) => {
            // Read-only when explicitly listed, or when the catalog notes mark
            // the field read-only (system identifiers, derived/computed values).
            const isReadOnly = readOnlyKeys.has(f.key) || /read-only/i.test(f.help ?? "");
            // Boolean fields render as a single inline row: checkbox next to the
            // label (no stacked label, no "Enabled" text).
            if (f.type === "checkbox") {
              return (
                <label key={f.key} className="flex items-center gap-2 py-1 text-[11px] font-medium text-muted-foreground" title={f.key}>
                  <input
                    type="checkbox"
                    id={f.key}
                    checked={Boolean(values[f.key])}
                    disabled={isReadOnly}
                    onChange={(e) => onChange(f.key, e.target.checked)}
                    className="h-4 w-4 accent-[hsl(var(--brand))]"
                  />
                  {f.label}
                  {requiredKeys.has(f.key) && <span className="text-destructive">*</span>}
                </label>
              );
            }
            return (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={f.key} className="text-[11px] font-medium text-muted-foreground" title={f.key}>
                {f.label}
                {requiredKeys.has(f.key) && <span className="ml-1 text-destructive">*</span>}
              </Label>
              {isReadOnly ? (
                <Input value={String(values[f.key] ?? "")} disabled className="h-8 text-[13px]" />
              ) : (
                <FieldInput
                  field={f}
                  value={values[f.key]}
                  onChange={(v) => onChange(f.key, v)}
                  setField={onChange}
                />
              )}
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CreateRecordDialog({
  open, onOpenChange, title, description, sections, requiredKeys = [], initial = {}, onSave,
  submitLabel = "Create", readOnlyKeys = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  sections: readonly FieldSection[];
  requiredKeys?: readonly string[];
  initial?: Values;
  onSave: (values: Values) => void;
  /** Submit button label (e.g. "Save changes" when editing). */
  submitLabel?: string;
  /** Fields shown but not editable (e.g. name/id when editing). */
  readOnlyKeys?: readonly string[];
}) {
  // Split into subsections, then merge any that share a title (e.g. two
  // "Accounting" groups) so each section appears once with combined fields.
  const groups = useMemo(() => {
    const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
    const map = new Map<string, FieldSection>();
    for (const g of sections.flatMap((s) => autoSplit(s))) {
      const key = norm(g.title);
      const existing = map.get(key);
      if (existing) {
        const seen = new Set(existing.fields.map((f) => f.key));
        existing.fields = [...existing.fields, ...g.fields.filter((f) => !seen.has(f.key))];
      } else {
        map.set(key, { ...g, fields: [...g.fields] });
      }
    }
    return [...map.values()];
  }, [sections]);
  const [values, setValues] = useState<Values>(() => {
    const seed: Values = {};
    for (const s of sections) for (const f of s.fields) seed[f.key] = initial[f.key] ?? defaultForField(f);
    return seed;
  });
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const reqSet = useMemo(() => new Set(requiredKeys), [requiredKeys]);
  const readOnlySet = useMemo(() => new Set(readOnlyKeys), [readOnlyKeys]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        fields: g.fields.filter((f) => {
          // Raw identifiers stay behind the "Show hidden fields" toggle. Driven
          // off the catalog annotation so new id fields are covered too.
          if (!showHidden && (HIDDEN_ON_CREATE.has(f.key) || isHiddenIdField(f))) return false;
          if (!needle) return true;
          return f.label.toLowerCase().includes(needle) || f.key.toLowerCase().includes(needle);
        }),
      }))
      .filter((g) => g.fields.length > 0);
  }, [groups, q, showHidden]);

  const handleChange = (key: string, v: unknown) => setValues((prev) => ({ ...prev, [key]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const k of reqSet) {
      const v = values[k];
      if (v === undefined || v === null || v === "") {
        alert(`Missing required field: ${k}`);
        return;
      }
    }
    onSave(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[92vw] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex max-h-[calc(90vh-8rem)] flex-col">
          <div className="border-b border-border px-6 py-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search fields…"
                className="h-8 pl-8"
              />
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
            {filtered.map((g, i) => (
              <SectionBlock
                key={g.id}
                section={g}
                values={values}
                onChange={handleChange}
                defaultOpen={i === 0 || Boolean(q.trim())}
                requiredKeys={reqSet}
                readOnlyKeys={readOnlySet}
              />
            ))}
            {filtered.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No fields match "{q}"
              </div>
            )}

            <label className="flex items-center gap-2 px-1 pt-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--brand))]"
              />
              Show hidden fields (system identifiers)
            </label>
          </div>

          <DialogFooter className="border-t border-border px-6 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
