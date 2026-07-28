import { useRef } from "react";
import { FunctionSquare, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CrmField, FormulaReturnType } from "@/lib/admin-objects";

const FUNCTIONS: { name: string; insert: string; hint: string }[] = [
  { name: "IF", insert: "IF(, , )", hint: "IF(logical, value_if_true, value_if_false)" },
  { name: "AND", insert: "AND(, )", hint: "AND(logical1, logical2)" },
  { name: "OR", insert: "OR(, )", hint: "OR(logical1, logical2)" },
  { name: "NOT", insert: "NOT()", hint: "NOT(logical)" },
  { name: "CASE", insert: "CASE(, , , )", hint: "CASE(expr, when1, then1, else)" },
  { name: "CONCAT", insert: "CONCAT(, )", hint: "Join text" },
  { name: "TEXT", insert: "TEXT()", hint: "Convert to text" },
  { name: "VALUE", insert: "VALUE()", hint: "Text → number" },
  { name: "ROUND", insert: "ROUND(, 2)", hint: "ROUND(number, digits)" },
  { name: "LEN", insert: "LEN()", hint: "Text length" },
  { name: "LEFT", insert: "LEFT(, 3)", hint: "LEFT(text, n)" },
  { name: "RIGHT", insert: "RIGHT(, 3)", hint: "RIGHT(text, n)" },
  { name: "CONTAINS", insert: "CONTAINS(, \"\")", hint: "CONTAINS(text, substring)" },
  { name: "ISBLANK", insert: "ISBLANK()", hint: "Is a field empty" },
  { name: "TODAY", insert: "TODAY()", hint: "Current date" },
  { name: "NOW", insert: "NOW()", hint: "Current date/time" },
];

const OPERATORS = ["+", "-", "*", "/", "( )", "=", "<>", "<", ">", "&&", "||", "\" \""];

const RETURN_TYPES: { value: FormulaReturnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "percent", label: "Percent" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
];

/** Light validity check: balanced parentheses/quotes. Not a full parser. */
function validate(formula: string): { ok: boolean; message: string } {
  if (!formula.trim()) return { ok: false, message: "Formula is empty." };
  let depth = 0;
  for (const ch of formula) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) return { ok: false, message: "Unbalanced parentheses." };
  }
  if (depth !== 0) return { ok: false, message: "Unbalanced parentheses." };
  if ((formula.match(/"/g)?.length ?? 0) % 2 !== 0) return { ok: false, message: "Unbalanced quotes." };
  return { ok: true, message: "Looks well-formed." };
}

export function FormulaBuilder({
  value,
  onChange,
  returnType,
  onReturnTypeChange,
  fields,
}: {
  value: string;
  onChange: (v: string) => void;
  returnType: FormulaReturnType;
  onReturnTypeChange: (t: FormulaReturnType) => void;
  fields: CrmField[];
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function insert(token: string) {
    const el = ref.current;
    if (!el) {
      onChange(value + token);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    // Restore caret just after the inserted token.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const check = validate(value);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FunctionSquare className="h-4 w-4 text-brand" /> Formula builder
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px]">
        <div>
          <Label className="text-xs text-muted-foreground">Formula</Label>
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`e.g. IF(buyer_intent_score > 70, "Hot", "Warm")`}
            className="mt-1 h-28 font-mono text-sm"
          />
          <div
            className={`mt-1 flex items-center gap-1.5 text-xs ${check.ok ? "text-emerald-600" : "text-amber-600"}`}
          >
            {check.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {check.message}
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Return type</Label>
          <Select value={returnType} onValueChange={(v) => onReturnTypeChange(v as FormulaReturnType)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETURN_TYPES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Insert fields */}
      <div>
        <Label className="text-xs text-muted-foreground">Insert field</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          {fields.length === 0 ? (
            <span className="text-xs text-muted-foreground">No other fields on this object yet.</span>
          ) : (
            fields.map((fl) => (
              <button
                key={fl.id}
                type="button"
                onClick={() => insert(fl.apiName)}
                title={`${fl.label} (${fl.type})`}
                className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] hover:bg-accent"
              >
                {fl.apiName}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Functions + operators */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Functions</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {FUNCTIONS.map((fn) => (
              <button
                key={fn.name}
                type="button"
                onClick={() => insert(fn.insert)}
                title={fn.hint}
                className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent"
              >
                {fn.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Operators</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {OPERATORS.map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => insert(op === "( )" ? "()" : op)}
                className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] hover:bg-accent"
              >
                {op}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
