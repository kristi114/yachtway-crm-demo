import { guarded } from "@/components/require-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type DragEvent } from "react";
import { Plus, StickyNote } from "lucide-react";
import { hasNote } from "@/lib/notes";
import { toNoteViewer } from "@/lib/note-access";

import { AppShell } from "@/components/app-shell";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { OPPORTUNITIES, getCompany, getContact, updateOpportunity, type Opportunity } from "@/lib/mock-data";
import { useAuth, useMoney } from "@/lib/auth";
import {
  CreateOpportunityDialog,
  PIPELINE_STAGES,
  ROLE_PIPELINES,
  type PipelineName,
} from "@/components/create-opportunity-dialog";

export const Route = createFileRoute("/opportunities/")({
  component: guarded("opportunity.general", "Opportunities", OpportunitiesPage),
});


function OpportunitiesPage() {
  const { user } = useAuth();
  const { format: fmtMoney } = useMoney();
  const visiblePipelines = ROLE_PIPELINES[user.role];

  // Local, editable copy so drag-and-drop between stages persists in the session.
  const [opps, setOpps] = useState<Opportunity[]>(() => OPPORTUNITIES.map((o) => ({ ...o })));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // `${pipeline}::${stage}`
  const [activeFilter, setActiveFilter] = useState<PipelineName | "all">("all");
  const [openForm, setOpenForm] = useState<string | null>(null); // `${pipeline}::${stage}`
  const [dialogOpen, setDialogOpen] = useState(false);

  const grouped = useMemo(() => {
    return visiblePipelines.map((p) => {
      const list = opps.filter((o) => o.pipeline === p);
      const stages = PIPELINE_STAGES[p] ?? [];
      const extras = Array.from(new Set(list.map((o) => o.stage))).filter((s) => !stages.includes(s));
      const columns = [...stages, ...extras].map((stage) => ({
        stage,
        opps: list.filter((o) => o.stage === stage),
      }));
      return { pipeline: p, opps: list, columns };
    });
  }, [opps, visiblePipelines]);

  const totalValue = grouped.reduce((s, g) => s + g.opps.reduce((a, o) => a + o.amountUsd, 0), 0);
  const totalCount = grouped.reduce((s, g) => s + g.opps.length, 0);

  function handleDrop(pipeline: PipelineName, stage: string) {
    if (!dragId) return;
    const enteredAt = new Date().toISOString().slice(0, 10);
    setOpps((prev) =>
      prev.map((o) =>
        o.id === dragId && o.pipeline === pipeline ? { ...o, stage, stageEnteredAt: enteredAt } : o,
      ),
    );
    // Persist to the shared store so the opportunity detail (and everywhere else)
    // reflects the new stage, not just this board view.
    updateOpportunity(dragId, { stage, stageEnteredAt: enteredAt });
    setDragId(null);
    setDragOver(null);
  }


  return (
    <AppShell>
      <PageHeader
        eyebrow="Opportunities"
        title="Your pipelines"
        subtitle={`${totalCount} open deals · ${fmtMoney(totalValue)} pipeline value · ${user.role === "admin" ? "All departments" : "Your department"}`}
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New opportunity
          </Button>
        }
      />
      <PageBody>
        <div className="space-y-6">
          {grouped.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No pipelines assigned to your department yet.
            </div>
          )}
          {grouped.length > 0 && (
            <div className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1.5 rounded-md border border-border bg-surface/90 p-1.5 shadow-sm backdrop-blur">
              {(["all", ...visiblePipelines] as const).map((f) => {
                const isAll = f === "all";
                const g = isAll ? null : grouped.find((x) => x.pipeline === f);
                const count = isAll ? totalCount : g?.opps.length ?? 0;
                const active = activeFilter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className={
                      "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition " +
                      (active
                        ? "bg-brand text-brand-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-secondary/70 hover:text-brand-deep")
                    }
                  >
                    {isAll ? "All" : f}
                    <span
                      className={
                        "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tabular-nums " +
                        (active ? "bg-brand-foreground/20 text-brand-foreground" : "bg-secondary text-muted-foreground")
                      }
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {grouped
            .filter((g) => activeFilter === "all" || g.pipeline === activeFilter)
            .map((g) => {
            const sum = g.opps.reduce((s, o) => s + o.amountUsd, 0);
            return (
              <section key={g.pipeline} className="overflow-hidden rounded-sm border border-border bg-surface shadow-sm">
                <header className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-brand-deep">
                    {g.pipeline}
                  </h3>
                  <div className="text-xs text-muted-foreground">
                    {g.opps.length} deals · <span className="font-semibold text-foreground">{fmtMoney(sum)}</span>
                  </div>
                </header>
                <div className="overflow-x-auto p-3">
                  <div className="flex min-w-full gap-3">
                    {g.columns.map((col) => {
                      const colSum = col.opps.reduce((s, o) => s + o.amountUsd, 0);
                      const key = `${g.pipeline}::${col.stage}`;
                      const isOver = dragOver === key;
                      return (
                        <div
                          key={col.stage}
                          onDragOver={(e: DragEvent) => {
                            e.preventDefault();
                            if (dragOver !== key) setDragOver(key);
                          }}
                          onDragLeave={() => {
                            if (dragOver === key) setDragOver(null);
                          }}
                          onDrop={(e: DragEvent) => {
                            e.preventDefault();
                            handleDrop(g.pipeline, col.stage);
                          }}
                          className={`flex w-64 shrink-0 flex-col rounded-md border bg-muted/40 transition-colors ${
                            isOver ? "border-brand bg-brand/5 ring-2 ring-brand/30" : "border-border"
                          }`}
                        >
                          <div className="flex items-center justify-between border-b border-border px-3 py-2">
                            <span className="text-[13px] font-semibold uppercase tracking-wide text-foreground">
                              {col.stage}
                            </span>
                            <span className="rounded-sm bg-background px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              {col.opps.length}
                            </span>
                          </div>
                          <div className="flex-1 space-y-2 p-2">
                            {col.opps.map((o) => {
                              const co = o.companyId ? getCompany(o.companyId) : null;
                              const ct = o.contactId ? getContact(o.contactId) : null;
                              const dragging = dragId === o.id;
                              return (
                                <article
                                  key={o.id}
                                  draggable
                                  onDragStart={(e: DragEvent) => {
                                    setDragId(o.id);
                                    e.dataTransfer.effectAllowed = "move";
                                  }}
                                  onDragEnd={() => {
                                    setDragId(null);
                                    setDragOver(null);
                                  }}
                                  className={`cursor-grab rounded-md border border-border bg-surface p-2.5 text-[13px] shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing ${
                                    dragging ? "opacity-40" : ""
                                  }`}
                                >
                                  <Link
                                    to="/opportunities/$id"
                                    params={{ id: o.id }}
                                    className="flex items-center gap-1.5 font-medium text-foreground hover:text-brand hover:underline"
                                  >
                                    <span className="truncate">{o.name}</span>
                                    {hasNote("opportunity", o.id, toNoteViewer(user)) && (
                                      <StickyNote
                                        className="h-3.5 w-3.5 shrink-0 text-amber-500"
                                        aria-label="Has notes"
                                      />
                                    )}
                                  </Link>
                                  <div className="mt-1 text-[13px] text-muted-foreground">
                                    {co && (
                                      <Link to="/companies/$id" params={{ id: co.id }} className="text-brand hover:underline">
                                        {co.name}
                                      </Link>
                                    )}
                                    {co && ct && " · "}
                                    {ct && (
                                      <Link to="/contacts/$id" params={{ id: ct.id }} className="text-brand hover:underline">
                                        {ct.firstName} {ct.lastName}
                                      </Link>
                                    )}
                                  </div>
                                  <div className="mt-2 flex items-center justify-between text-[13px]">
                                    <span className="text-muted-foreground">{o.owner}</span>
                                    <span className="font-semibold tabular-nums text-foreground">{fmtMoney(o.amountUsd, co?.currency)}</span>
                                  </div>
                                  <div className="mt-1 flex items-center justify-between text-[13px] text-muted-foreground">
                                    <span>Close: {o.closeDate}</span>
                                    <span
                                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                                        o.probability >= 70
                                          ? "bg-brand/15 text-brand-deep"
                                          : o.probability >= 40
                                          ? "bg-warning/15 text-warning"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                      title="Win probability"
                                    >
                                      {o.probability}%
                                    </span>
                                  </div>
                                </article>
                              );
                            })}
                            {col.opps.length === 0 && openForm !== key && (
                              <div className="rounded-md border border-dashed border-border/70 p-3 text-center text-[13px] text-muted-foreground">
                                Drop here
                              </div>
                            )}
                          </div>
                          <div className="border-t border-border px-3 py-1.5 text-right text-[13px] font-semibold tabular-nums text-muted-foreground">
                            {fmtMoney(colSum)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </PageBody>

      <CreateOpportunityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pipelines={visiblePipelines}
        onCreated={(opp) => {
          setOpps(OPPORTUNITIES.map((o) => ({ ...o })));
          setActiveFilter(opp.pipeline);
        }}
      />
    </AppShell>
  );
}

