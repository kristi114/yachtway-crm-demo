import type { FieldDef, FieldSection, FieldType } from "@/lib/field-schema";

/**
 * Generic, field-schema-driven record filtering used by the per-object filter
 * bars. A clause is (field → operator → value); clauses combine with AND. The
 * operator set is chosen from the field's type so the UI can stay type-aware.
 */

export type FilterOp =
  | "contains" | "eq" | "neq" | "gt" | "lt"
  | "before" | "after" | "on"
  | "is" | "isNot" | "includes" | "excludes"
  | "checked" | "unchecked"
  | "empty" | "notEmpty";

export interface FilterClause {
  id: string;
  field: string; // FieldDef.key
  op: FilterOp;
  value: string; // raw string; interpreted per field type
}

export interface OpSpec {
  op: FilterOp;
  label: string;
  /** No value input needed (empty / checked / …). */
  noValue?: boolean;
}

const TEXT_OPS: OpSpec[] = [
  { op: "contains", label: "contains" },
  { op: "eq", label: "equals" },
  { op: "neq", label: "does not equal" },
  { op: "empty", label: "is empty", noValue: true },
  { op: "notEmpty", label: "is not empty", noValue: true },
];
const NUMBER_OPS: OpSpec[] = [
  { op: "eq", label: "=" },
  { op: "neq", label: "≠" },
  { op: "gt", label: ">" },
  { op: "lt", label: "<" },
  { op: "empty", label: "is empty", noValue: true },
  { op: "notEmpty", label: "is not empty", noValue: true },
];
const DATE_OPS: OpSpec[] = [
  { op: "on", label: "on" },
  { op: "before", label: "before" },
  { op: "after", label: "after" },
  { op: "empty", label: "is empty", noValue: true },
  { op: "notEmpty", label: "is not empty", noValue: true },
];
const SINGLE_OPTION_OPS: OpSpec[] = [
  { op: "is", label: "is" },
  { op: "isNot", label: "is not" },
  { op: "empty", label: "is empty", noValue: true },
  { op: "notEmpty", label: "is not empty", noValue: true },
];
const MULTI_OPTION_OPS: OpSpec[] = [
  { op: "includes", label: "includes" },
  { op: "excludes", label: "excludes" },
];
const CHECKBOX_OPS: OpSpec[] = [
  { op: "checked", label: "is checked", noValue: true },
  { op: "unchecked", label: "is unchecked", noValue: true },
];

export function opsForType(type: FieldType): OpSpec[] {
  switch (type) {
    case "number":
    case "money":
      return NUMBER_OPS;
    case "date":
      return DATE_OPS;
    case "single_option":
      return SINGLE_OPTION_OPS;
    case "multi_option":
      return MULTI_OPTION_OPS;
    case "checkbox":
      return CHECKBOX_OPS;
    default:
      return TEXT_OPS;
  }
}

/** Flatten an object's sections into a de-duplicated, filterable field list. */
export function filterableFields(sections: readonly FieldSection[]): FieldDef[] {
  const seen = new Set<string>();
  const out: FieldDef[] = [];
  for (const s of sections) {
    for (const f of s.fields) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      out.push(f);
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function evalClause(record: Record<string, unknown>, clause: FilterClause, field: FieldDef): boolean {
  const raw = record[clause.field];
  const v = clause.value.trim();

  switch (clause.op) {
    case "empty":
      return raw === null || raw === undefined || asString(raw).trim() === "" || raw === false;
    case "notEmpty":
      return !(raw === null || raw === undefined || asString(raw).trim() === "" || raw === false);
    case "checked":
      return raw === true;
    case "unchecked":
      return raw !== true;
    case "contains":
      return asString(raw).toLowerCase().includes(v.toLowerCase());
    case "eq":
      if (field.type === "number" || field.type === "money") return Number(raw) === Number(v);
      return asString(raw).toLowerCase() === v.toLowerCase();
    case "neq":
      if (field.type === "number" || field.type === "money") return Number(raw) !== Number(v);
      return asString(raw).toLowerCase() !== v.toLowerCase();
    case "gt":
      return Number(raw) > Number(v);
    case "lt":
      return Number(raw) < Number(v);
    case "on":
      return asString(raw).slice(0, 10) === v;
    case "before":
      return !!asString(raw) && asString(raw).slice(0, 10) < v;
    case "after":
      return !!asString(raw) && asString(raw).slice(0, 10) > v;
    case "is":
      return asString(raw).toLowerCase() === v.toLowerCase();
    case "isNot":
      return asString(raw).toLowerCase() !== v.toLowerCase();
    case "includes":
      return asString(raw).toLowerCase().includes(v.toLowerCase());
    case "excludes":
      return !asString(raw).toLowerCase().includes(v.toLowerCase());
    default:
      return true;
  }
}

/** Apply all clauses (AND) to a record set. Unknown fields are ignored.
 *
 * `resolve` lets a caller override fields before evaluation — used to turn
 * relationship lookups (company/contact/owner objects or ids) into the name
 * strings shown in the UI so text operators match what the user sees. */
export function applyClauses<T extends Record<string, unknown>>(
  records: T[],
  clauses: FilterClause[],
  fields: FieldDef[],
  resolve?: (record: T) => Record<string, unknown>,
): T[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const active = clauses.filter((c) => {
    const f = byKey.get(c.field);
    if (!f) return false;
    const spec = opsForType(f.type).find((o) => o.op === c.op);
    if (!spec) return false;
    return spec.noValue || c.value.trim() !== "";
  });
  if (active.length === 0) return records;
  return records.filter((r) => {
    const rec = resolve ? { ...r, ...resolve(r) } : r;
    return active.every((c) => evalClause(rec, c, byKey.get(c.field)!));
  });
}
