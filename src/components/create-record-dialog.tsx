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
import { autoSplit } from "@/components/field-renderer";

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
  field, value, onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const common = "h-8 text-[13px]";
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
    case "single_option":
      if (field.options?.length) {
        return (
          <select
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-[13px]"
          >
            <option value="">-</option>
            {field.options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        );
      }
      return <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={common} />;
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
  section, values, onChange, defaultOpen, requiredKeys,
}: {
  section: FieldSection;
  values: Values;
  onChange: (key: string, v: unknown) => void;
  defaultOpen: boolean;
  requiredKeys: Set<string>;
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
          {section.fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={f.key} className="text-[11px] font-medium text-muted-foreground" title={f.key}>
                {f.label}
                {requiredKeys.has(f.key) && <span className="ml-1 text-destructive">*</span>}
              </Label>
              <FieldInput
                field={f}
                value={values[f.key]}
                onChange={(v) => onChange(f.key, v)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function CreateRecordDialog({
  open, onOpenChange, title, description, sections, requiredKeys = [], initial = {}, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  sections: readonly FieldSection[];
  requiredKeys?: readonly string[];
  initial?: Values;
  onSave: (values: Values) => void;
}) {
  const groups = useMemo(() => sections.flatMap((s) => autoSplit(s)), [sections]);
  const [values, setValues] = useState<Values>(() => {
    const seed: Values = {};
    for (const s of sections) for (const f of s.fields) seed[f.key] = initial[f.key] ?? defaultForField(f);
    return seed;
  });
  const [q, setQ] = useState("");
  const reqSet = useMemo(() => new Set(requiredKeys), [requiredKeys]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((g) => ({
        ...g,
        fields: g.fields.filter((f) =>
          f.label.toLowerCase().includes(needle) || f.key.toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.fields.length > 0);
  }, [groups, q]);

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
              />
            ))}
            {filtered.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No fields match "{q}"
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
