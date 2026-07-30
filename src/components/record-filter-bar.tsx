import { Search, X, SlidersHorizontal } from "lucide-react";

import type { FieldDef } from "@/lib/field-schema";
import { FIELD_OPTIONS, dynamicOptions } from "@/lib/field-options";
import { opsForType, type FilterClause, type FilterOp } from "@/lib/record-filter";
import { Input } from "@/components/ui/input";

function newId() {
  return `flt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function optionsFor(field: FieldDef): string[] {
  const declared = field.options ?? FIELD_OPTIONS[field.key];
  return dynamicOptions(declared ?? []);
}

/**
 * Field-schema-driven filter bar: a text search plus an add-any-field clause
 * builder (field → operator → value). Fully controlled.
 */
export function RecordFilterBar({
  fields,
  query,
  onQueryChange,
  clauses,
  onClausesChange,
  searchPlaceholder = "Search",
  hideSearch = false,
}: {
  fields: FieldDef[];
  query: string;
  onQueryChange: (v: string) => void;
  clauses: FilterClause[];
  onClausesChange: (c: FilterClause[]) => void;
  searchPlaceholder?: string;
  /** Hide the text search box and show only the clause builder. */
  hideSearch?: boolean;
}) {
  const byKey = new Map(fields.map((f) => [f.key, f]));

  function addClause() {
    const first = fields[0];
    if (!first) return;
    const op = opsForType(first.type)[0]?.op ?? "contains";
    onClausesChange([...clauses, { id: newId(), field: first.key, op, value: "" }]);
  }
  function update(id: string, patch: Partial<FilterClause>) {
    onClausesChange(clauses.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function remove(id: string) {
    onClausesChange(clauses.filter((c) => c.id !== id));
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!hideSearch && (
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>
        )}
        <button
          type="button"
          onClick={addClause}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <SlidersHorizontal className="h-4 w-4" /> Add filter
        </button>
        {clauses.length > 0 && (
          <button
            type="button"
            onClick={() => onClausesChange([])}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {clauses.map((c) => {
        const field = byKey.get(c.field);
        if (!field) return null;
        const ops = opsForType(field.type);
        const opSpec = ops.find((o) => o.op === c.op) ?? ops[0];
        const showValue = !opSpec?.noValue;
        const opts = field.type === "single_option" || field.type === "multi_option" ? optionsFor(field) : null;
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2 py-1.5">
            <select
              className="native-select h-8 rounded-md border border-border bg-surface px-2 text-sm"
              value={c.field}
              onChange={(e) => {
                const nf = byKey.get(e.target.value);
                const nop = nf ? opsForType(nf.type)[0]?.op ?? "contains" : "contains";
                update(c.id, { field: e.target.value, op: nop as FilterOp, value: "" });
              }}
            >
              {fields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>

            <select
              className="native-select h-8 rounded-md border border-border bg-surface px-2 text-sm"
              value={c.op}
              onChange={(e) => update(c.id, { op: e.target.value as FilterOp })}
            >
              {ops.map((o) => (
                <option key={o.op} value={o.op}>{o.label}</option>
              ))}
            </select>

            {showValue && (
              opts ? (
                <select
                  className="native-select h-8 min-w-[140px] rounded-md border border-border bg-surface px-2 text-sm"
                  value={c.value}
                  onChange={(e) => update(c.id, { value: e.target.value })}
                >
                  <option value="">Select…</option>
                  {opts.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <Input
                  type={field.type === "number" || field.type === "money" ? "number" : field.type === "date" ? "date" : "text"}
                  value={c.value}
                  onChange={(e) => update(c.id, { value: e.target.value })}
                  placeholder="Value"
                  className="h-8 w-44"
                />
              )
            )}

            <button
              type="button"
              onClick={() => remove(c.id)}
              title="Remove filter"
              className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
