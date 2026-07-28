import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Zap,
  Clock,
  GitBranch,
  Mail,
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  ChevronRight,
  Check,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useObjects, useFields } from "@/lib/admin-objects";
import {
  ACTIONS,
  TRIGGERS,
  addStep,
  updateStepTree,
  removeStepTree,
  newStep,
  getFlow,
  saveFlow,
  type Flow,
  type FlowStep,
  type StepKind,
  type ActionKey,
  type FlowStatus,
} from "@/lib/admin-automations";

const ACTION_MAP = Object.fromEntries(ACTIONS.map((a) => [a.key, a]));

function AddStepMenu({ onPick }: { onPick: (kind: StepKind) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mx-auto flex items-center gap-1.5 rounded-full border border-dashed border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-brand hover:text-brand"
        >
          <Plus className="h-3.5 w-3.5" /> Add step
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuItem onClick={() => onPick("action")}>
          <Mail className="h-4 w-4" /> Action
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("delay")}>
          <Clock className="h-4 w-4" /> Delay
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("branch")}>
          <GitBranch className="h-4 w-4" /> If / then branch
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StepConnector() {
  return <div className="mx-auto h-5 w-px bg-border" />;
}

function ActionStep({
  step,
  onChange,
}: {
  step: FlowStep;
  onChange: (patch: Partial<FlowStep>) => void;
}) {
  const spec = ACTION_MAP[step.action ?? "send_email"];
  const config = step.config ?? {};
  return (
    <div className="space-y-3">
      <Select
        value={step.action}
        onValueChange={(v) => onChange({ action: v as ActionKey, config: {} })}
      >
        <SelectTrigger className="h-8 w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTIONS.map((a) => (
            <SelectItem key={a.key} value={a.key}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {spec.fields.map((f) => (
          <div key={f.key}>
            <Label className="text-[11px] text-muted-foreground">{f.label}</Label>
            <Input
              value={config[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ config: { ...config, [f.key]: e.target.value } })}
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function DelayStep({ step, onChange }: { step: FlowStep; onChange: (p: Partial<FlowStep>) => void }) {
  const d = step.delay ?? { amount: 1, unit: "days" as const };
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Wait</span>
      <Input
        type="number"
        min={1}
        value={d.amount}
        onChange={(e) => onChange({ delay: { ...d, amount: Number(e.target.value) || 1 } })}
        className="h-8 w-20"
      />
      <Select value={d.unit} onValueChange={(v) => onChange({ delay: { ...d, unit: v as "minutes" | "hours" | "days" } })}>
        <SelectTrigger className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">Minutes</SelectItem>
          <SelectItem value="hours">Hours</SelectItem>
          <SelectItem value="days">Days</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

const KIND_META: Record<StepKind, { icon: typeof Mail; title: string; color: string }> = {
  action: { icon: Mail, title: "Action", color: "text-brand" },
  delay: { icon: Clock, title: "Delay", color: "text-amber-600" },
  branch: { icon: GitBranch, title: "If / then", color: "text-purple-600" },
};

function StepCard({
  step,
  fieldNames,
  onUpdate,
  onRemove,
  onAdd,
}: {
  step: FlowStep;
  fieldNames: string[];
  onUpdate: (id: string, patch: Partial<FlowStep>) => void;
  onRemove: (id: string) => void;
  onAdd: (containerId: string, kind: StepKind) => void;
}) {
  const meta = KIND_META[step.kind];
  const title =
    step.kind === "action" ? (ACTION_MAP[step.action ?? "send_email"]?.label ?? "Action") : meta.title;

  return (
    <div className="mx-auto w-full max-w-xl rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <meta.icon className={`h-4 w-4 ${meta.color}`} />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(step.id)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
          title="Remove step"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {step.kind === "action" && (
        <ActionStep step={step} onChange={(patch) => onUpdate(step.id, patch)} />
      )}
      {step.kind === "delay" && (
        <DelayStep step={step} onChange={(patch) => onUpdate(step.id, patch)} />
      )}
      {step.kind === "branch" && (
        <div className="space-y-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Condition</Label>
            <Input
              value={step.condition ?? ""}
              placeholder={fieldNames.length ? `e.g. ${fieldNames[0]} > 70` : "e.g. amount > 10000"}
              onChange={(e) => onUpdate(step.id, { condition: e.target.value })}
              className="h-8 font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <BranchColumn
              label="Yes"
              tone="emerald"
              icon={Check}
              steps={step.yes ?? []}
              containerId={`${step.id}:yes`}
              fieldNames={fieldNames}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onAdd={onAdd}
            />
            <BranchColumn
              label="No"
              tone="rose"
              icon={X}
              steps={step.no ?? []}
              containerId={`${step.id}:no`}
              fieldNames={fieldNames}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onAdd={onAdd}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BranchColumn({
  label,
  tone,
  icon: Icon,
  steps,
  containerId,
  fieldNames,
  onUpdate,
  onRemove,
  onAdd,
}: {
  label: string;
  tone: "emerald" | "rose";
  icon: typeof Check;
  steps: FlowStep[];
  containerId: string;
  fieldNames: string[];
  onUpdate: (id: string, patch: Partial<FlowStep>) => void;
  onRemove: (id: string) => void;
  onAdd: (containerId: string, kind: StepKind) => void;
}) {
  const toneCls =
    tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-rose-400/30 bg-rose-500/5";
  const badgeCls =
    tone === "emerald" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600";
  return (
    <div className={`rounded-lg border ${toneCls} p-2.5`}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeCls}`}>
          <Icon className="h-3 w-3" /> {label}
        </span>
      </div>
      <div className="space-y-2">
        {steps.map((s) => (
          <div key={s.id}>
            <StepCard
              step={s}
              fieldNames={fieldNames}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onAdd={onAdd}
            />
          </div>
        ))}
        <AddStepMenu onPick={(kind) => onAdd(containerId, kind)} />
      </div>
    </div>
  );
}

export function FlowBuilder({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const objects = useObjects();
  const allFields = useFields();
  const [flow, setFlow] = useState<Flow | null>(() => getFlow(flowId) ?? null);

  const triggerSpec = useMemo(
    () => TRIGGERS.find((t) => t.key === flow?.trigger.type),
    [flow?.trigger.type],
  );
  const objectFields = useMemo(
    () => allFields.filter((f) => f.objectKey === flow?.trigger.objectKey),
    [allFields, flow?.trigger.objectKey],
  );
  const fieldNames = objectFields.map((f) => f.apiName);

  if (!flow) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        Flow not found. <button className="text-brand hover:underline" onClick={onClose}>Back to flows</button>
      </div>
    );
  }

  const patchFlow = (patch: Partial<Flow>) => setFlow((f) => (f ? { ...f, ...patch } : f));
  const patchTrigger = (patch: Partial<Flow["trigger"]>) =>
    setFlow((f) => (f ? { ...f, trigger: { ...f.trigger, ...patch } } : f));

  const handleAdd = (containerId: string, kind: StepKind) =>
    setFlow((f) => (f ? { ...f, steps: addStep(f.steps, containerId, newStep(kind)) } : f));
  const handleUpdate = (id: string, patch: Partial<FlowStep>) =>
    setFlow((f) => (f ? { ...f, steps: updateStepTree(f.steps, id, patch) } : f));
  const handleRemove = (id: string) =>
    setFlow((f) => (f ? { ...f, steps: removeStepTree(f.steps, id) } : f));

  function save() {
    if (!flow) return;
    saveFlow(flow);
    toast.success("Flow saved", { description: flow.name });
    onClose();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" /> Flows
          </Button>
          <Input
            value={flow.name}
            onChange={(e) => patchFlow({ name: e.target.value })}
            className="h-9 w-64 text-base font-semibold"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={flow.status} onValueChange={(v) => patchFlow({ status: v as FlowStatus })}>
            <SelectTrigger className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={save}>
            <Save className="h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      <Input
        value={flow.description ?? ""}
        onChange={(e) => patchFlow({ description: e.target.value })}
        placeholder="Describe what this flow does…"
        className="max-w-2xl"
      />

      {/* Canvas */}
      <div className="rounded-xl border border-border bg-secondary/20 p-6">
        {/* Trigger */}
        <div className="mx-auto w-full max-w-xl rounded-lg border-2 border-brand/40 bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold">Trigger</span>
            <Badge variant="secondary" className="ml-auto">Enrollment</Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">When…</Label>
              <Select value={flow.trigger.type} onValueChange={(v) => patchTrigger({ type: v as Flow["trigger"]["type"] })}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {triggerSpec?.needsObject && (
              <div>
                <Label className="text-[11px] text-muted-foreground">Object</Label>
                <Select value={flow.trigger.objectKey} onValueChange={(v) => patchTrigger({ objectKey: v, field: undefined })}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select object" />
                  </SelectTrigger>
                  <SelectContent>
                    {objects.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {triggerSpec?.needsField && (
              <div>
                <Label className="text-[11px] text-muted-foreground">Field</Label>
                <Select value={flow.trigger.field} onValueChange={(v) => patchTrigger({ field: v })}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {objectFields.map((f) => (
                      <SelectItem key={f.id} value={f.apiName}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {triggerSpec?.needsDetail && (
              <div>
                <Label className="text-[11px] text-muted-foreground">{triggerSpec.detailLabel}</Label>
                <Input
                  value={flow.trigger.detail ?? ""}
                  onChange={(e) => patchTrigger({ detail: e.target.value })}
                  className="h-8"
                />
              </div>
            )}
          </div>
          <div className="mt-3">
            <Label className="text-[11px] text-muted-foreground">Only when (filter, optional)</Label>
            <Input
              value={flow.trigger.filter ?? ""}
              onChange={(e) => patchTrigger({ filter: e.target.value })}
              placeholder="e.g. status = 'Lead'"
              className="h-8 font-mono text-sm"
            />
          </div>
        </div>

        {/* Steps */}
        <div className="mt-1">
          {flow.steps.map((s) => (
            <div key={s.id}>
              <StepConnector />
              <StepCard
                step={s}
                fieldNames={fieldNames}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
                onAdd={handleAdd}
              />
            </div>
          ))}
          <StepConnector />
          <AddStepMenu onPick={(kind) => handleAdd("root", kind)} />
        </div>
      </div>
    </div>
  );
}
