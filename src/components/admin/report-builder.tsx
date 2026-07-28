import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from "recharts";
import { ArrowLeft, Plus, X, Download, Save, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordFilterBar } from "@/components/record-filter-bar";
import type { ObjectKey } from "@/lib/admin-config";
import {
  getReport, saveReport, runReport, exportReportCsv, fieldsFor, fieldDef, isNumeric, formatCell,
  REPORT_TYPES, type ReportDef, type ReportFormat, type SummaryFn,
} from "@/lib/reports";

const FORMATS: { id: ReportFormat; label: string; hint: string }[] = [
  { id: "tabular", label: "Tabular", hint: "Flat list of rows" },
  { id: "summary", label: "Summary", hint: "Rows grouped with subtotals" },
  { id: "matrix", label: "Matrix", hint: "Rows × columns cross-tab" },
];
const FNS: SummaryFn[] = ["count", "sum", "avg", "min", "max"];
const CHART_COLORS = ["#7C6FF0", "#38BDF8", "#F59E0B", "#10B981", "#E1306C", "#0A66C2", "#EF4444", "#8B5CF6"];

export function ReportBuilder({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const initial = getReport(reportId);
  const [def, setDef] = useState<ReportDef>(initial ?? getReport(reportId)!);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);

  const fields = useMemo(() => fieldsFor(def.objectKey), [def.objectKey]);
  const numericFields = fields.filter(isNumeric);
  const result = useMemo(() => runReport(def, search), [def, search]);

  function patch(p: Partial<ReportDef>) {
    setDef((d) => ({ ...d, ...p }));
    setDirty(true);
  }
  function changeObject(objectKey: ObjectKey) {
    const cols = fieldsFor(objectKey).slice(0, 5).map((f) => f.key);
    setDef((d) => ({ ...d, objectKey, columns: cols, filters: [], groupBy: undefined, groupByCol: undefined, summaries: [{ field: "", fn: "count" }] }));
    setDirty(true);
  }
  function toggleColumn(key: string) {
    patch({ columns: def.columns.includes(key) ? def.columns.filter((c) => c !== key) : [...def.columns, key] });
  }

  const colLabel = (k: string) => fieldDef(def.objectKey, k)?.label ?? k;
  const sumLabel = (s: { fn: SummaryFn; field: string }) =>
    s.fn === "count" ? "Record count" : `${s.fn.toUpperCase()} of ${colLabel(s.field)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4" /> Reports</Button>
        <Input value={def.name} onChange={(e) => patch({ name: e.target.value })} className="h-9 max-w-xs font-semibold" />
        <Input value={def.folder} onChange={(e) => patch({ folder: e.target.value })} className="h-9 max-w-[160px]" placeholder="Folder" />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportReportCsv(def, result)}><Download className="h-4 w-4" /> Export CSV</Button>
          <Button size="sm" onClick={() => { saveReport(def); setDirty(false); }}>
            <Save className="h-4 w-4" /> {dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* Config panel */}
        <div className="space-y-4">
          <Field label="Report type">
            <select className="native-select h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              value={def.objectKey} onChange={(e) => changeObject(e.target.value as ObjectKey)}>
              {REPORT_TYPES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </Field>

          <Field label="Format">
            <div className="flex flex-wrap gap-1.5">
              {FORMATS.map((f) => (
                <button key={f.id} type="button" title={f.hint} onClick={() => patch({ format: f.id })}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${def.format === f.id ? "border-brand bg-brand text-brand-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </Field>

          {def.format !== "tabular" && (
            <Field label={def.format === "matrix" ? "Group rows by" : "Group by"}>
              <select className="native-select h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                value={def.groupBy ?? ""} onChange={(e) => patch({ groupBy: e.target.value || undefined })}>
                <option value="">Select field…</option>
                {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </Field>
          )}
          {def.format === "matrix" && (
            <Field label="Group columns by">
              <select className="native-select h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                value={def.groupByCol ?? ""} onChange={(e) => patch({ groupByCol: e.target.value || undefined })}>
                <option value="">Select field…</option>
                {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </Field>
          )}

          <Field label="Summaries">
            <div className="space-y-1.5">
              {def.summaries.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select className="native-select h-8 flex-1 rounded-md border border-border bg-surface px-2 text-xs"
                    value={s.fn} onChange={(e) => patch({ summaries: def.summaries.map((x, j) => j === i ? { ...x, fn: e.target.value as SummaryFn } : x) })}>
                    {FNS.map((fn) => <option key={fn} value={fn}>{fn}</option>)}
                  </select>
                  {s.fn !== "count" && (
                    <select className="native-select h-8 flex-1 rounded-md border border-border bg-surface px-2 text-xs"
                      value={s.field} onChange={(e) => patch({ summaries: def.summaries.map((x, j) => j === i ? { ...x, field: e.target.value } : x) })}>
                      <option value="">field…</option>
                      {numericFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  )}
                  <button type="button" className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => patch({ summaries: def.summaries.filter((_, j) => j !== i) })}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <button type="button" className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                onClick={() => patch({ summaries: [...def.summaries, { fn: "sum", field: numericFields[0]?.key ?? "" }] })}>
                <Plus className="h-3.5 w-3.5" /> Add summary
              </button>
            </div>
          </Field>

          {def.format === "summary" && (
            <Field label="Chart">
              <div className="flex gap-1.5">
                {(["none", "bar", "donut"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => patch({ chart: c })}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium capitalize ${def.chart === c ? "border-brand bg-brand text-brand-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label={`Columns (${def.columns.length})`}>
            <div className="max-h-56 space-y-1 overflow-auto rounded-md border border-border p-2">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={def.columns.includes(f.key)} onChange={() => toggleColumn(f.key)} className="h-3.5 w-3.5 accent-[hsl(var(--brand))]" />
                  {f.label}
                </label>
              ))}
            </div>
          </Field>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <RecordFilterBar
            fields={fields}
            query={search}
            onQueryChange={setSearch}
            clauses={def.filters}
            onClausesChange={(c) => patch({ filters: c })}
            searchPlaceholder="Search results…"
          />

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Play className="h-3.5 w-3.5 text-brand" />
            <span className="font-semibold text-foreground">{result.total}</span> records
            {Object.entries(result.grand).map(([k, v]) => (
              <span key={k}>· {k.split(":")[0]}{k.split(":")[1] !== "records" ? ` ${colLabel(k.split(":")[1])}` : ""}: <span className="font-medium text-foreground">{v.toLocaleString()}</span></span>
            ))}
          </div>

          {def.chart !== "none" && def.format === "summary" && result.groups && (
            <div className="h-64 rounded-lg border border-border bg-surface p-3">
              <ResponsiveContainer width="100%" height="100%">
                {def.chart === "donut" ? (
                  <PieChart>
                    <Pie data={result.groups.map((g) => ({ name: g.key, value: g.count }))} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                      {result.groups.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                ) : (
                  <BarChart data={result.groups.map((g) => ({ name: g.key, value: g.summary[Object.keys(g.summary)[0]] ?? g.count }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#7C6FF0" radius={[3, 3, 0, 0]} maxBarSize={48} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            {def.format === "matrix" ? <MatrixTable def={def} result={result} colLabel={colLabel} />
              : def.format === "summary" ? <SummaryTable def={def} result={result} colLabel={colLabel} sumLabel={sumLabel} />
                : <TabularTable def={def} result={result} colLabel={colLabel} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

type TblProps = { def: ReportDef; result: ReturnType<typeof runReport>; colLabel: (k: string) => string };

function TabularTable({ def, result, colLabel }: TblProps) {
  const rows = result.rows.slice(0, 300);
  return (
    <table className="w-full text-sm">
      <thead className="bg-secondary/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>{def.columns.map((c) => <th key={c} className="px-3 py-2 font-semibold">{colLabel(c)}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r, i) => (
          <tr key={i}>{def.columns.map((c) => <td key={c} className="px-3 py-2">{formatCell(def.objectKey, c, r[c])}</td>)}</tr>
        ))}
        {rows.length === 0 && <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={def.columns.length}>No matching records.</td></tr>}
      </tbody>
    </table>
  );
}

function SummaryTable({ def, result, colLabel, sumLabel }: TblProps & { sumLabel: (s: { fn: SummaryFn; field: string }) => string }) {
  if (!def.groupBy) return <div className="p-4 text-sm text-muted-foreground">Choose a “Group by” field to see grouped results.</div>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-secondary/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-3 py-2 font-semibold">{colLabel(def.groupBy)}</th>
          <th className="px-3 py-2 font-semibold">Count</th>
          {def.summaries.filter((s) => s.fn !== "count").map((s, i) => <th key={i} className="px-3 py-2 font-semibold">{sumLabel(s)}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {(result.groups ?? []).map((g) => (
          <tr key={g.key}>
            <td className="px-3 py-2 font-medium">{g.key}</td>
            <td className="px-3 py-2 tabular-nums">{g.count}</td>
            {def.summaries.filter((s) => s.fn !== "count").map((s, i) => (
              <td key={i} className="px-3 py-2 tabular-nums">{(g.summary[`${s.fn}:${s.field || "records"}`] ?? 0).toLocaleString()}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MatrixTable({ def, result, colLabel }: TblProps) {
  if (!def.groupBy || !def.groupByCol || !result.matrix) return <div className="p-4 text-sm text-muted-foreground">Choose row and column group fields for a matrix.</div>;
  const { rowKeys, colKeys, cells } = result.matrix;
  return (
    <table className="w-full text-sm">
      <thead className="bg-secondary/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-3 py-2 font-semibold">{colLabel(def.groupBy)} \ {colLabel(def.groupByCol)}</th>
          {colKeys.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rowKeys.map((rk) => (
          <tr key={rk}>
            <td className="px-3 py-2 font-medium">{rk}</td>
            {colKeys.map((ck) => <td key={ck} className="px-3 py-2 tabular-nums">{(cells[rk]?.[ck] ?? 0).toLocaleString()}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
