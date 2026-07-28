import { useSyncExternalStore } from "react";

/**
 * Dashboards (mock): a named grid of widgets, each pinning a saved report.
 * Reports are rendered as their configured chart / table on the dashboard.
 */

export interface DashWidget {
  id: string;
  reportId: string;
}

export interface Dashboard {
  id: string;
  name: string;
  widgets: DashWidget[];
  createdAt: string;
}

const KEY = "yw:dashboards:v1";
const now = () => new Date().toISOString();
const wid = () => `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
const did = () => `dash_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

function seed(): Dashboard[] {
  return [
    {
      id: "dash_sales",
      name: "Sales overview",
      createdAt: now(),
      widgets: [
        { id: wid(), reportId: "rpt_pipeline_by_stage" },
        { id: wid(), reportId: "rpt_companies_by_status" },
      ],
    },
  ];
}

function load(): Dashboard[] {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Dashboard[];
    return Array.isArray(parsed) ? parsed : seed();
  } catch { return seed(); }
}

let state: Dashboard[] = load();
const listeners = new Set<() => void>();
const snapshot = () => state;
function emit() {
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }
  for (const l of listeners) l();
}

export function useDashboards(): Dashboard[] {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, snapshot, snapshot);
}
export function listDashboards(): Dashboard[] { return state; }

export function createDashboard(name: string): Dashboard {
  const d: Dashboard = { id: did(), name: name.trim() || "Untitled dashboard", widgets: [], createdAt: now() };
  state = [...state, d];
  emit();
  return d;
}
export function renameDashboard(id: string, name: string) {
  state = state.map((d) => (d.id === id ? { ...d, name: name.trim() || d.name } : d));
  emit();
}
export function deleteDashboard(id: string) {
  state = state.filter((d) => d.id !== id);
  emit();
}

/** Pin a report to a dashboard (no-op if already present). Returns false if dup. */
export function addReportToDashboard(dashboardId: string, reportId: string): boolean {
  const d = state.find((x) => x.id === dashboardId);
  if (!d) return false;
  if (d.widgets.some((w) => w.reportId === reportId)) return false;
  state = state.map((x) => (x.id === dashboardId ? { ...x, widgets: [...x.widgets, { id: wid(), reportId }] } : x));
  emit();
  return true;
}
export function removeWidget(dashboardId: string, widgetId: string) {
  state = state.map((d) => (d.id === dashboardId ? { ...d, widgets: d.widgets.filter((w) => w.id !== widgetId) } : d));
  emit();
}
