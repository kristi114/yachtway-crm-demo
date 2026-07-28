import { useSyncExternalStore } from "react";

import { COMPANIES, CONTACTS, OPPORTUNITIES, LISTINGS } from "@/lib/mock-data";
import { OBJECTS, type ObjectKey } from "@/lib/admin-config";
import { filterableFields, applyClauses, type FilterClause } from "@/lib/record-filter";
import { sendSystemEmail } from "@/lib/email-send";
import type { FieldDef } from "@/lib/field-schema";

/**
 * Reports engine (Salesforce-style, mock).
 *
 * A report selects a "report type" (an object), a set of columns, filters, and
 * a format: tabular (flat), summary (grouped rows with subtotals) or matrix
 * (rows × columns cross-tab). Summary fields aggregate a numeric column with
 * count/sum/avg/min/max. Definitions are saved to localStorage in folders.
 */

export type ReportFormat = "tabular" | "summary" | "matrix";
export type SummaryFn = "count" | "sum" | "avg" | "min" | "max";

export interface SummaryField {
  field: string; // "" allowed for count-only
  fn: SummaryFn;
}

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export interface ScheduleConfig {
  enabled: boolean;
  frequency: ScheduleFrequency;
  weekday: number;  // 0 (Sun) – 6 (Sat), used for weekly
  monthday: number; // 1 – 28, used for monthly
  time: string;     // "08:00"
  recipients: string; // comma / space separated emails
}

export interface ReportDef {
  id: string;
  name: string;
  description?: string;
  folder: string;
  objectKey: ObjectKey;
  format: ReportFormat;
  columns: string[];
  filters: FilterClause[];
  groupBy?: string; // row grouping (summary / matrix)
  groupByCol?: string; // column grouping (matrix)
  summaries: SummaryField[];
  chart: "none" | "bar" | "donut";
  schedule?: ScheduleConfig;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false, frequency: "weekly", weekday: 1, monthday: 1, time: "08:00", recipients: "",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function parseEmails(raw: string): string[] {
  return raw.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

/** Human summary of when a schedule fires. */
export function scheduleLabel(s: ScheduleConfig): string {
  const when =
    s.frequency === "daily" ? `every day at ${s.time}`
    : s.frequency === "weekly" ? `every ${WEEKDAYS[s.weekday]} at ${s.time}`
    : `on day ${s.monthday} each month at ${s.time}`;
  const n = parseEmails(s.recipients).length;
  return `${when} · ${n} recipient${n === 1 ? "" : "s"}`;
}

/* -------- Data source + fields -------- */

const SOURCES: Record<ObjectKey, () => Record<string, unknown>[]> = {
  company: () => COMPANIES as unknown as Record<string, unknown>[],
  contact: () => CONTACTS as unknown as Record<string, unknown>[],
  opportunity: () => OPPORTUNITIES as unknown as Record<string, unknown>[],
  listing: () => LISTINGS as unknown as Record<string, unknown>[],
};

export const REPORT_TYPES = OBJECTS.map((o) => ({ key: o.key, label: o.label }));

export function fieldsFor(objectKey: ObjectKey): FieldDef[] {
  const obj = OBJECTS.find((o) => o.key === objectKey);
  return obj ? filterableFields(obj.sections) : [];
}

export function fieldDef(objectKey: ObjectKey, key: string): FieldDef | undefined {
  return fieldsFor(objectKey).find((f) => f.key === key);
}

export function isNumeric(f?: FieldDef): boolean {
  return f?.type === "number" || f?.type === "money";
}

/* -------- Value formatting -------- */

export function formatCell(objectKey: ObjectKey, key: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const f = fieldDef(objectKey, key);
  if (f?.type === "checkbox") return raw === true ? "Yes" : "No";
  if (f?.type === "money" && typeof raw === "number") return `$${raw.toLocaleString("en-US")}`;
  if (Array.isArray(raw)) return raw.join(", ");
  return String(raw);
}

/* -------- Run / aggregate -------- */

export interface RunResult {
  rows: Record<string, unknown>[];
  total: number;
  /** Summary groups (present for summary format). */
  groups?: { key: string; count: number; rows: Record<string, unknown>[]; summary: Record<string, number> }[];
  /** Matrix (present for matrix format). */
  matrix?: {
    rowKeys: string[];
    colKeys: string[];
    cells: Record<string, Record<string, number>>; // rowKey -> colKey -> value
  };
  /** Grand-total summary values keyed by "fn:field". */
  grand: Record<string, number>;
}

function aggregate(rows: Record<string, unknown>[], summaries: SummaryField[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of summaries) {
    const key = `${s.fn}:${s.field || "records"}`;
    if (s.fn === "count") { out[key] = rows.length; continue; }
    const nums = rows.map((r) => Number(r[s.field])).filter((n) => !Number.isNaN(n));
    if (nums.length === 0) { out[key] = 0; continue; }
    if (s.fn === "sum") out[key] = nums.reduce((a, b) => a + b, 0);
    else if (s.fn === "avg") out[key] = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
    else if (s.fn === "min") out[key] = Math.min(...nums);
    else if (s.fn === "max") out[key] = Math.max(...nums);
  }
  return out;
}

const groupVal = (r: Record<string, unknown>, key: string): string => {
  const v = r[key];
  if (v === null || v === undefined || v === "") return "—";
  return Array.isArray(v) ? v.join(", ") : String(v);
};

export function runReport(def: ReportDef, search = ""): RunResult {
  const source = SOURCES[def.objectKey]?.() ?? [];
  const fields = fieldsFor(def.objectKey);
  let rows = applyClauses(source, def.filters, fields);
  const needle = search.trim().toLowerCase();
  if (needle) {
    const cols = def.columns.length ? def.columns : fields.map((f) => f.key);
    rows = rows.filter((r) => cols.some((c) => formatCell(def.objectKey, c, r[c]).toLowerCase().includes(needle)));
  }
  const grand = aggregate(rows, def.summaries.length ? def.summaries : [{ field: "", fn: "count" }]);

  if (def.format === "summary" && def.groupBy) {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const k = groupVal(r, def.groupBy);
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    }
    const groups = [...map.entries()]
      .map(([key, grp]) => ({ key, count: grp.length, rows: grp, summary: aggregate(grp, def.summaries.length ? def.summaries : [{ field: "", fn: "count" }]) }))
      .sort((a, b) => b.count - a.count);
    return { rows, total: rows.length, groups, grand };
  }

  if (def.format === "matrix" && def.groupBy && def.groupByCol) {
    const rowKeys = new Set<string>();
    const colKeys = new Set<string>();
    const cells: Record<string, Record<string, number>> = {};
    const sumField = def.summaries[0];
    for (const r of rows) {
      const rk = groupVal(r, def.groupBy);
      const ck = groupVal(r, def.groupByCol);
      rowKeys.add(rk); colKeys.add(ck);
      cells[rk] ??= {};
      const add = sumField && sumField.fn !== "count" ? Number(r[sumField.field]) || 0 : 1;
      cells[rk][ck] = (cells[rk][ck] ?? 0) + add;
    }
    return {
      rows, total: rows.length, grand,
      matrix: { rowKeys: [...rowKeys].sort(), colKeys: [...colKeys].sort(), cells },
    };
  }

  return { rows, total: rows.length, grand };
}

/* ------------------------------------------------------------------ */
/* Saved reports store (localStorage)                                   */
/* ------------------------------------------------------------------ */

const KEY = "yw:reports:v1";

function nowIso() { return new Date().toISOString(); }
function rid() { return `rpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }

function seed(): ReportDef[] {
  const base = { filters: [] as FilterClause[], chart: "bar" as const, createdAt: nowIso(), updatedAt: nowIso() };
  return [
    {
      ...base, id: "rpt_pipeline_by_stage", name: "Pipeline by stage", folder: "Sales",
      description: "Open opportunity amount grouped by stage.",
      objectKey: "opportunity", format: "summary",
      columns: ["name", "pipeline", "stage", "amountUsd", "owner", "closeDate"],
      groupBy: "stage", summaries: [{ field: "amountUsd", fn: "sum" }, { field: "", fn: "count" }],
    },
    {
      ...base, id: "rpt_companies_by_status", name: "Companies by status", folder: "Sales",
      description: "Account count by company status.",
      objectKey: "company", format: "summary",
      columns: ["name", "companyStatus", "companyType", "owner"],
      groupBy: "companyStatus", summaries: [{ field: "", fn: "count" }], chart: "donut",
    },
    {
      ...base, id: "rpt_contacts_all", name: "All contacts", folder: "Sales",
      description: "Tabular list of contacts.",
      objectKey: "contact", format: "tabular",
      columns: ["firstName", "lastName", "email", "contactType"],
      summaries: [{ field: "", fn: "count" }], chart: "none",
    },
  ];
}

function load(): ReportDef[] {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as ReportDef[];
    return Array.isArray(parsed) && parsed.length ? parsed : seed();
  } catch { return seed(); }
}

let state: ReportDef[] = load();
const listeners = new Set<() => void>();
const snapshot = () => state;
function emit() {
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }
  for (const l of listeners) l();
}

export function useReports(): ReportDef[] {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, snapshot, snapshot);
}
export function getReport(id: string): ReportDef | undefined {
  return state.find((r) => r.id === id);
}
export function createReport(objectKey: ObjectKey = "opportunity"): ReportDef {
  const cols = fieldsFor(objectKey).slice(0, 5).map((f) => f.key);
  const def: ReportDef = {
    id: rid(), name: "New report", folder: "Unfiled", objectKey, format: "tabular",
    columns: cols, filters: [], summaries: [{ field: "", fn: "count" }], chart: "none",
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  state = [def, ...state];
  emit();
  return def;
}
export function saveReport(def: ReportDef) {
  const next = { ...def, updatedAt: nowIso() };
  state = state.some((r) => r.id === def.id) ? state.map((r) => (r.id === def.id ? next : r)) : [next, ...state];
  emit();
}
export function deleteReport(id: string) {
  state = state.filter((r) => r.id !== id);
  emit();
}

export function exportReportCsv(def: ReportDef, result: RunResult) {
  const cols = def.columns;
  const head = cols.map((c) => fieldDef(def.objectKey, c)?.label ?? c);
  const line = (r: Record<string, unknown>) =>
    cols.map((c) => `"${formatCell(def.objectKey, c, r[c]).replace(/"/g, '""')}"`).join(",");
  const body = result.rows.map(line);
  const csv = [head.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${def.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build an HTML email body for a report run. */
function reportHtml(def: ReportDef, result: RunResult): string {
  const th = (s: string) => `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5e7eb;font-size:12px;color:#6b7280;">${s}</th>`;
  const td = (s: string) => `<td style="padding:6px 10px;border-bottom:1px solid #eef2f7;font-size:13px;">${s}</td>`;
  let table = "";
  if (def.format === "summary" && result.groups && def.groupBy) {
    table = `<table style="border-collapse:collapse;width:100%;"><thead><tr>${th(fieldDef(def.objectKey, def.groupBy)?.label ?? def.groupBy)}${th("Count")}</tr></thead><tbody>` +
      result.groups.map((g) => `<tr>${td(g.key)}${td(String(g.count))}</tr>`).join("") + `</tbody></table>`;
  } else {
    const cols = def.columns;
    table = `<table style="border-collapse:collapse;width:100%;"><thead><tr>${cols.map((c) => th(fieldDef(def.objectKey, c)?.label ?? c)).join("")}</tr></thead><tbody>` +
      result.rows.slice(0, 50).map((r) => `<tr>${cols.map((c) => td(formatCell(def.objectKey, c, r[c]))).join("")}</tr>`).join("") + `</tbody></table>`;
  }
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
    <h2 style="margin:0 0 4px;">${def.name}</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">${result.total} records${def.description ? " · " + def.description : ""}</p>
    ${table}
    <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;">Automated report from YachtWay CRM.</p>
  </div>`;
}

/**
 * Deliver a report now: run it and email the results to the schedule's
 * recipients via SES (system email). Returns the recipient count (0 if none).
 */
export function deliverReport(def: ReportDef): number {
  const emails = parseEmails(def.schedule?.recipients ?? "");
  if (emails.length === 0) return 0;
  const result = runReport(def);
  sendSystemEmail(emails, `Report: ${def.name}`, reportHtml(def, result));
  return emails.length;
}
