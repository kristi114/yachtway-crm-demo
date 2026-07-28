import { formatDate } from "@/lib/format-date";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Zap, Pencil, Trash2, Play, Pause, Workflow } from "lucide-react";

import { PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlowBuilder } from "@/components/admin/flow-builder";
import { useObjects } from "@/lib/admin-objects";
import {
  useFlows,
  createFlow,
  deleteFlow,
  setFlowStatus,
  countSteps,
  TRIGGERS,
  type Flow,
} from "@/lib/admin-automations";

export const Route = createFileRoute("/admin/automations")({
  component: AdminAutomationsPage,
});

function StatusBadge({ status }: { status: Flow["status"] }) {
  if (status === "active")
    return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">Active</Badge>;
  if (status === "inactive") return <Badge variant="secondary">Inactive</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

function AdminAutomationsPage() {
  const flows = useFlows();
  const objects = useObjects();
  const [editingId, setEditingId] = useState<string | null>(null);

  function triggerSummary(f: Flow): string {
    const t = TRIGGERS.find((x) => x.key === f.trigger.type);
    const obj = objects.find((o) => o.key === f.trigger.objectKey);
    return [t?.label, obj?.label, f.trigger.field].filter(Boolean).join(" · ");
  }

  if (editingId) {
    return (
      <PageBody>
        <FlowBuilder flowId={editingId} onClose={() => setEditingId(null)} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Automations</h2>
          <p className="text-sm text-muted-foreground">
            Trigger-based flows: send emails, update records, branch on conditions, and wait — modeled
            on Salesforce Flow, HubSpot Workflows and GHL.
          </p>
        </div>
        <Button
          onClick={() => {
            const f = createFlow();
            setEditingId(f.id);
          }}
        >
          <Plus className="h-4 w-4" /> New flow
        </Button>
      </div>

      {flows.length === 0 ? (
        <div className="mx-auto max-w-md rounded-lg border border-dashed border-border bg-surface p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Workflow className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No automations yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a flow to automate follow-ups, notifications and record updates.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {flows.map((f) => (
            <div key={f.id} className="flex flex-col rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10">
                    <Zap className="h-4 w-4 text-brand" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{f.name}</h3>
                    <p className="text-xs text-muted-foreground">{triggerSummary(f)}</p>
                  </div>
                </div>
                <StatusBadge status={f.status} />
              </div>

              {f.description && (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{f.description}</p>
              )}

              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{countSteps(f.steps)} steps</span>
                <span>·</span>
                <span>Updated {formatDate(f.updatedAt)}</span>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                <Button size="sm" variant="outline" onClick={() => setEditingId(f.id)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                {f.status === "active" ? (
                  <Button size="sm" variant="ghost" onClick={() => setFlowStatus(f.id, "inactive")}>
                    <Pause className="h-4 w-4" /> Deactivate
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setFlowStatus(f.id, "active")}>
                    <Play className="h-4 w-4" /> Activate
                  </Button>
                )}
                <button
                  type="button"
                  className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                  title="Delete flow"
                  onClick={() => {
                    if (confirm(`Delete flow "${f.name}"?`)) deleteFlow(f.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageBody>
  );
}
