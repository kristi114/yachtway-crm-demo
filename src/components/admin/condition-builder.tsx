import { Plus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CrmField } from "@/lib/admin-objects";
import {
  OPERATORS,
  clauseId,
  opCatForType,
  opNeedsValue,
  type Clause,
  type ConditionGroup,
} from "@/lib/admin-automations";

/**
 * Structured, type-aware condition builder used by the trigger filter and by
 * if/then branches. Field → operator (valid for the field's type) → value
 * (dropdown for picklists, number/date inputs, or none for is-empty/checkbox).
 * This removes free-text guesswork so conditions are always well-formed.
 */
export function ConditionBuilder({
  value,
  onChange,
  fields,
  emptyHint = "Select an object first to add conditions.",
}: {
  value: ConditionGroup;
  onChange: (g: ConditionGroup) => void;
  fields: CrmField[];
  emptyHint?: string;
}) {
  const byApi = (api: string) => fields.find((f) => f.apiName === api);

  function setClause(id: string, patch: Partial<Clause>) {
    onChange({ ...value, clauses: value.clauses.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }
  function removeClause(id: string) {
    onChange({ ...value, clauses: value.clauses.filter((c) => c.id !== id) });
  }
  function addClause() {
    const first = fields[0];
    if (!first) return;
    const cat = opCatForType(first.type);
    onChange({
      ...value,
      clauses: [
        ...value.clauses,
        { id: clauseId(), field: first.apiName, op: OPERATORS[cat][0].value, value: "" },
      ],
    });
  }

  if (fields.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyHint}</p>;
  }

  return (
    <div className="space-y-2">
      {value.clauses.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Match</span>
          <Select value={value.match} onValueChange={(v) => onChange({ ...value, match: v as "all" | "any" })}>
            <SelectTrigger className="h-7 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL (AND)</SelectItem>
              <SelectItem value="any">ANY (OR)</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">of the following</span>
        </div>
      )}

      {value.clauses.map((c) => {
        const field = byApi(c.field);
        const cat = opCatForType(field?.type ?? "text");
        const ops = OPERATORS[cat];
        const needsValue = opNeedsValue(cat, c.op);
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            {/* Field */}
            <Select
              value={c.field}
              onValueChange={(v) => {
                const nf = byApi(v);
                const nc = opCatForType(nf?.type ?? "text");
                setClause(c.id, { field: v, op: OPERATORS[nc][0].value, value: "" });
              }}
            >
              <SelectTrigger className="h-8 w-40">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent>
                {fields.map((f) => (
                  <SelectItem key={f.id} value={f.apiName}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator */}
            <Select value={c.op} onValueChange={(v) => setClause(c.id, { op: v, value: opNeedsValue(cat, v) ? c.value : "" })}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ops.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value */}
            {needsValue &&
              (cat === "option" || cat === "multioption" ? (
                <Select value={c.value ?? ""} onValueChange={(v) => setClause(c.id, { value: v })}>
                  <SelectTrigger className="h-8 w-40">
                    <SelectValue placeholder="Value" />
                  </SelectTrigger>
                  <SelectContent>
                    {(field?.options ?? []).map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={cat === "number" ? "number" : cat === "date" ? "date" : "text"}
                  value={c.value ?? ""}
                  onChange={(e) => setClause(c.id, { value: e.target.value })}
                  placeholder="Value"
                  className="h-8 w-40"
                />
              ))}

            <button
              type="button"
              onClick={() => removeClause(c.id)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
              title="Remove condition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addClause}
        className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add condition
      </button>
    </div>
  );
}
