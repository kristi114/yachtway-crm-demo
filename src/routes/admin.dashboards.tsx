import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type DragEvent } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from "recharts";
import { Plus, LayoutDashboard, X, Trash2, GripVertical, Maximize2, Minimize2, RefreshCw } from "lucide-react";

import { PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  useDashboards, createDashboard, deleteDashboard, removeWidget, setWidgetSpan, reorderWidgets,
} from "@/lib/dashboards";
import { getReport, runReport, fieldDef, formatCell } from "@/lib/reports";

export const Route = createFileRoute("/admin/dashboards")({
  component: AdminDashboardsPage,
});

const COLORS = ["#7C6FF0", "#38BDF8", "#F59E0B", "#10B981", "#E1306C", "#0A66C2", "#EF4444", "#8B5CF6"];
const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

function AdminDashboardsPage() {
  const dashboards = useDashboards();
  const [activeId, setActiveId] = useState<string>(dashboards[0]?.id ?? "");
  const active = dashboards.find((d) => d.id === activeId) ?? dashboards[0];

  // Bumping the token forces every widget to re-run; lastRefreshed drives the label.
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function runAll() {
    setRefreshToken((n) => n + 1);
    setLastRefreshed(new Date());
  }

  return (
    <PageBody>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {dashboards.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setActiveId(d.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                active?.id === d.id ? "border-brand bg-brand text-brand-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" /> {d.name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {active && active.widgets.length > 0 && (
            <>
              {lastRefreshed && (
                <span className="text-xs text-muted-foreground">Refreshed {time(lastRefreshed)}</span>
              )}
              <Button size="sm" variant="outline" onClick={runAll}>
                <RefreshCw className="h-4 w-4" /> Run all
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const name = window.prompt("New dashboard name");
              if (name) { const d = createDashboard(name); setActiveId(d.id); }
            }}
          >
            <Plus className="h-4 w-4" /> New dashboard
          </Button>
          {active && (
            <button
              type="button"
              title="Delete dashboard"
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
              onClick={() => { if (confirm(`Delete dashboard "${active.name}"?`)) { deleteDashboard(active.id); setActiveId(dashboards.find((d) => d.id !== active.id)?.id ?? ""); } }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!active ? (
        <Empty />
      ) : active.widgets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          No widgets yet. Open a report in Admin → Reports and click <span className="font-medium">Add to dashboard</span>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {active.widgets.map((w) => (
            <Widget
              key={w.id}
              reportId={w.reportId}
              span={w.w ?? 1}
              refreshToken={refreshToken}
              dragging={dragId === w.id}
              over={overId === w.id && dragId !== w.id}
              onRemove={() => removeWidget(active.id, w.id)}
              onToggleSpan={() => setWidgetSpan(active.id, w.id, (w.w ?? 1) === 2 ? 1 : 2)}
              onDragStart={() => setDragId(w.id)}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDragOver={(e) => { e.preventDefault(); if (overId !== w.id) setOverId(w.id); }}
              onDrop={() => { if (dragId) reorderWidgets(active.id, dragId, w.id); setDragId(null); setOverId(null); }}
            />
          ))}
        </div>
      )}
    </PageBody>
  );
}

function Empty() {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-dashed border-border bg-surface p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">No dashboards</h3>
      <p className="mt-1 text-sm text-muted-foreground">Create a dashboard, then pin reports to it.</p>
    </div>
  );
}

function Widget({
  reportId, span, refreshToken, dragging, over,
  onRemove, onToggleSpan, onDragStart, onDragEnd, onDragOver, onDrop,
}: {
  reportId: string;
  span: 1 | 2;
  refreshToken: number;
  dragging: boolean;
  over: boolean;
  onRemove: () => void;
  onToggleSpan: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: () => void;
}) {
  const def = getReport(reportId);
  // Re-runs whenever the report changes or Run all bumps the token; `at` is the
  // per-widget last-refreshed time shown in the footer.
  const { result, at } = useMemo(
    () => ({ result: def ? runReport(def) : null, at: new Date() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, refreshToken],
  );

  return (
    <section
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`overflow-hidden rounded-lg border bg-surface shadow-sm transition ${span === 2 ? "xl:col-span-2" : ""} ${
        dragging ? "opacity-40" : ""
      } ${over ? "border-brand ring-2 ring-brand/30" : "border-border"}`}
    >
      <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-brand-deep">{def?.name ?? "Deleted report"}</h3>
            {def && result && <p className="text-xs text-muted-foreground">{result.total} records · {def.format}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onToggleSpan} title={span === 2 ? "Half width" : "Full width"} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            {span === 2 ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onRemove} title="Remove from dashboard" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {!def || !result ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">This report was deleted.</div>
      ) : def.format === "summary" && result.groups && def.chart !== "none" ? (
        <div className="h-64 p-3">
          <ResponsiveContainer width="100%" height="100%">
            {def.chart === "donut" ? (
              <PieChart>
                <Pie data={result.groups.map((g) => ({ name: g.key, value: g.count }))} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                  {result.groups.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            ) : (
              <BarChart data={result.groups.map((g) => ({ name: g.key, value: g.summary[Object.keys(g.summary)[0]] ?? g.count }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#7C6FF0" radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : def.format === "summary" && result.groups ? (
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-2 font-semibold">{def.groupBy ? fieldDef(def.objectKey, def.groupBy)?.label : "Group"}</th><th className="px-4 py-2 font-semibold">Count</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.groups.slice(0, 8).map((g) => <tr key={g.key}><td className="px-4 py-2">{g.key}</td><td className="px-4 py-2 tabular-nums">{g.count}</td></tr>)}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>{def.columns.slice(0, span === 2 ? 8 : 4).map((c) => <th key={c} className="px-4 py-2 font-semibold">{fieldDef(def.objectKey, c)?.label ?? c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.rows.slice(0, 6).map((r, i) => (
              <tr key={i}>{def.columns.slice(0, span === 2 ? 8 : 4).map((c) => <td key={c} className="px-4 py-2">{formatCell(def.objectKey, c, r[c])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="border-t border-border px-3 py-1.5 text-right text-[11px] text-muted-foreground">
        Refreshed {time(at)}
      </footer>
    </section>
  );
}
