import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, BarChart3, Folder, Trash2, Table, PieChart, Grid3x3 } from "lucide-react";

import { PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReportBuilder } from "@/components/admin/report-builder";
import {
  useReports, createReport, deleteReport, REPORT_TYPES, type ReportDef,
} from "@/lib/reports";

export const Route = createFileRoute("/admin/reports")({
  component: AdminReportsPage,
});

const FORMAT_ICON = { tabular: Table, summary: PieChart, matrix: Grid3x3 } as const;

function typeLabel(k: string) {
  return REPORT_TYPES.find((r) => r.key === k)?.label ?? k;
}

function AdminReportsPage() {
  const reports = useReports();
  const [editingId, setEditingId] = useState<string | null>(null);

  const byFolder = useMemo(() => {
    const map = new Map<string, ReportDef[]>();
    for (const r of reports) {
      const list = map.get(r.folder) ?? [];
      list.push(r);
      map.set(r.folder, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [reports]);

  if (editingId) {
    return (
      <PageBody>
        <ReportBuilder reportId={editingId} onClose={() => setEditingId(null)} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reports</h2>
          <p className="text-sm text-muted-foreground">
            Build reports on any object — tabular lists, grouped summaries, or matrix cross-tabs — with
            filters, summaries and charts. Saved into folders.
          </p>
        </div>
        <Button onClick={() => { const r = createReport(); setEditingId(r.id); }}>
          <Plus className="h-4 w-4" /> New report
        </Button>
      </div>

      {reports.length === 0 ? (
        <div className="mx-auto max-w-md rounded-lg border border-dashed border-border bg-surface p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No reports yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create your first report to analyze CRM data.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {byFolder.map(([folder, list]) => (
            <section key={folder}>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                <Folder className="h-4 w-4 text-muted-foreground" /> {folder}
                <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{list.length}</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
                <ul className="divide-y divide-border">
                  {list.map((r) => {
                    const Icon = FORMAT_ICON[r.format];
                    return (
                      <li key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand"><Icon className="h-4 w-4" /></span>
                        <button type="button" onClick={() => setEditingId(r.id)} className="min-w-0 flex-1 text-left">
                          <div className="truncate text-sm font-medium hover:underline">{r.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {typeLabel(r.objectKey)} · {r.format}{r.description ? ` · ${r.description}` : ""}
                          </div>
                        </button>
                        <Badge variant="outline" className="text-[10px] capitalize">{r.format}</Badge>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(r.id)}>Open</Button>
                        <button
                          type="button"
                          title="Delete report"
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                          onClick={() => { if (confirm(`Delete report "${r.name}"?`)) deleteReport(r.id); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </PageBody>
  );
}
