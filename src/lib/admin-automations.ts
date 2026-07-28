import { useSyncExternalStore } from "react";

/**
 * Automations / Flows store.
 *
 * A workflow model blending the patterns of Salesforce Flow, HubSpot Workflows
 * and GHL: an enrollment TRIGGER plus a tree of STEPS — actions, time delays,
 * and if/then branches (each with yes/no paths). localStorage-backed for the
 * mock; the seam for a real automation engine.
 */

export type TriggerType =
  | "record_created"
  | "record_updated"
  | "field_changed"
  | "record_deleted"
  | "form_submitted"
  | "scheduled"
  | "manual"
  | "inbound_webhook";

export const TRIGGERS: {
  key: TriggerType;
  label: string;
  hint: string;
  needsObject?: boolean;
  needsField?: boolean;
  needsDetail?: boolean;
  detailLabel?: string;
}[] = [
  { key: "record_created", label: "Record created", hint: "When a new record is created", needsObject: true },
  { key: "record_updated", label: "Record updated", hint: "When a record is edited", needsObject: true },
  { key: "field_changed", label: "Field value changed", hint: "When a specific field changes", needsObject: true, needsField: true },
  { key: "record_deleted", label: "Record deleted", hint: "When a record is deleted", needsObject: true },
  { key: "form_submitted", label: "Form submitted", hint: "When a form is submitted", needsDetail: true, detailLabel: "Form name" },
  { key: "scheduled", label: "Scheduled / time-based", hint: "On a schedule", needsDetail: true, detailLabel: "Schedule (e.g. daily 9am)" },
  { key: "manual", label: "Manual enrollment", hint: "Enrolled manually or by another flow" },
  { key: "inbound_webhook", label: "Inbound webhook", hint: "When an external webhook fires" },
];

export type ActionKey =
  | "send_email"
  | "create_record"
  | "update_field"
  | "create_task"
  | "notify"
  | "add_tag"
  | "webhook";

export interface ActionSpec {
  key: ActionKey;
  label: string;
  fields: { key: string; label: string; placeholder?: string }[];
}

export const ACTIONS: ActionSpec[] = [
  { key: "send_email", label: "Send email", fields: [
    { key: "template", label: "Template", placeholder: "Welcome — new account" },
    { key: "to", label: "To", placeholder: "{{contact.email}}" },
    { key: "subject", label: "Subject (override)", placeholder: "Optional" },
  ] },
  { key: "create_record", label: "Create record", fields: [
    { key: "object", label: "Object", placeholder: "task / opportunity / …" },
    { key: "values", label: "Field values", placeholder: "name=…, amount=…" },
  ] },
  { key: "update_field", label: "Update field", fields: [
    { key: "field", label: "Field", placeholder: "status" },
    { key: "value", label: "New value", placeholder: "Customer" },
  ] },
  { key: "create_task", label: "Create task", fields: [
    { key: "subject", label: "Subject", placeholder: "Follow up" },
    { key: "assignee", label: "Assign to", placeholder: "Record owner" },
    { key: "dueInDays", label: "Due in (days)", placeholder: "3" },
  ] },
  { key: "notify", label: "Send notification", fields: [
    { key: "to", label: "Notify", placeholder: "Record owner / #channel" },
    { key: "message", label: "Message", placeholder: "New high-intent lead" },
  ] },
  { key: "add_tag", label: "Add tag", fields: [{ key: "tag", label: "Tag", placeholder: "hot-lead" }] },
  { key: "webhook", label: "Call webhook", fields: [
    { key: "url", label: "URL", placeholder: "https://…" },
    { key: "method", label: "Method", placeholder: "POST" },
  ] },
];

export type StepKind = "action" | "delay" | "branch";

export interface FlowStep {
  id: string;
  kind: StepKind;
  action?: ActionKey;
  config?: Record<string, string>;
  delay?: { amount: number; unit: "minutes" | "hours" | "days" };
  condition?: string;
  yes?: FlowStep[];
  no?: FlowStep[];
}

export interface FlowTrigger {
  type: TriggerType;
  objectKey?: string;
  field?: string;
  detail?: string;
  filter?: string;
}

export type FlowStatus = "draft" | "active" | "inactive";

export interface Flow {
  id: string;
  name: string;
  description?: string;
  status: FlowStatus;
  trigger: FlowTrigger;
  steps: FlowStep[];
  updatedAt: string;
}

const KEY = "yw:admin-flows:v1";

let sid = 0;
export function stepId(): string {
  return `st_${Date.now().toString(36)}_${(sid++).toString(36)}`;
}
export function flowId(): string {
  return `flw_${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------ */
/* Tree helpers (pure)                                                 */
/* ------------------------------------------------------------------ */

export function addStep(steps: FlowStep[], containerId: string, node: FlowStep): FlowStep[] {
  if (containerId === "root") return [...steps, node];
  return steps.map((s) => {
    if (s.kind !== "branch") return s;
    if (containerId === `${s.id}:yes`) return { ...s, yes: [...(s.yes ?? []), node] };
    if (containerId === `${s.id}:no`) return { ...s, no: [...(s.no ?? []), node] };
    return { ...s, yes: addStep(s.yes ?? [], containerId, node), no: addStep(s.no ?? [], containerId, node) };
  });
}

export function updateStepTree(steps: FlowStep[], id: string, patch: Partial<FlowStep>): FlowStep[] {
  return steps.map((s) => {
    if (s.id === id) return { ...s, ...patch };
    if (s.kind === "branch")
      return { ...s, yes: updateStepTree(s.yes ?? [], id, patch), no: updateStepTree(s.no ?? [], id, patch) };
    return s;
  });
}

export function removeStepTree(steps: FlowStep[], id: string): FlowStep[] {
  return steps
    .filter((s) => s.id !== id)
    .map((s) =>
      s.kind === "branch"
        ? { ...s, yes: removeStepTree(s.yes ?? [], id), no: removeStepTree(s.no ?? [], id) }
        : s,
    );
}

export function newStep(kind: StepKind): FlowStep {
  if (kind === "delay") return { id: stepId(), kind, delay: { amount: 1, unit: "days" } };
  if (kind === "branch") return { id: stepId(), kind, condition: "", yes: [], no: [] };
  return { id: stepId(), kind: "action", action: "send_email", config: {} };
}

export function countSteps(steps: FlowStep[]): number {
  return steps.reduce(
    (n, s) => n + 1 + (s.kind === "branch" ? countSteps(s.yes ?? []) + countSteps(s.no ?? []) : 0),
    0,
  );
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

function seed(): Flow[] {
  const now = new Date().toISOString();
  return [
    {
      id: "flw_welcome",
      name: "New contact welcome",
      description: "Email new contacts and create a follow-up task for the owner.",
      status: "active",
      trigger: { type: "record_created", objectKey: "contact" },
      steps: [
        { id: stepId(), kind: "action", action: "send_email", config: { template: "Welcome — new account", to: "{{contact.email}}" } },
        { id: stepId(), kind: "delay", delay: { amount: 2, unit: "days" } },
        {
          id: stepId(),
          kind: "branch",
          condition: "buyer_intent_score > 70",
          yes: [
            { id: stepId(), kind: "action", action: "notify", config: { to: "Record owner", message: "High-intent new contact 🔥" } },
            { id: stepId(), kind: "action", action: "create_task", config: { subject: "Call the lead", assignee: "Record owner", dueInDays: "1" } },
          ],
          no: [{ id: stepId(), kind: "action", action: "add_tag", config: { tag: "nurture" } }],
        },
      ],
      updatedAt: now,
    },
    {
      id: "flw_won",
      name: "Opportunity won → invoice",
      description: "When an opp is marked Closed Won, create a draft invoice and notify billing.",
      status: "draft",
      trigger: { type: "field_changed", objectKey: "opportunity", field: "stage" },
      steps: [
        { id: stepId(), kind: "action", action: "create_record", config: { object: "invoice", values: "opportunity={{record.id}}, status=draft" } },
        { id: stepId(), kind: "action", action: "notify", config: { to: "#billing", message: "New won deal to invoice" } },
      ],
      updatedAt: now,
    },
  ];
}

function load(): Flow[] {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Flow[];
    return Array.isArray(parsed) ? parsed : seed();
  } catch {
    return seed();
  }
}

let flows: Flow[] = load();
const listeners = new Set<() => void>();
const snap = () => flows;
const emit = () => listeners.forEach((l) => l());

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(flows));
  } catch {
    /* ignore */
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function listFlows(): Flow[] {
  return [...flows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function getFlow(id: string): Flow | undefined {
  return flows.find((f) => f.id === id);
}
export function saveFlow(flow: Flow) {
  const record = { ...flow, updatedAt: new Date().toISOString() };
  flows = flows.some((f) => f.id === record.id)
    ? flows.map((f) => (f.id === record.id ? record : f))
    : [record, ...flows];
  persist();
  emit();
}
export function createFlow(): Flow {
  const flow: Flow = {
    id: flowId(),
    name: "Untitled flow",
    description: "",
    status: "draft",
    trigger: { type: "record_created", objectKey: "contact" },
    steps: [],
    updatedAt: new Date().toISOString(),
  };
  flows = [flow, ...flows];
  persist();
  emit();
  return flow;
}
export function deleteFlow(id: string) {
  flows = flows.filter((f) => f.id !== id);
  persist();
  emit();
}
export function setFlowStatus(id: string, status: FlowStatus) {
  flows = flows.map((f) => (f.id === id ? { ...f, status, updatedAt: new Date().toISOString() } : f));
  persist();
  emit();
}

export function useFlows(): Flow[] {
  return useSyncExternalStore(subscribe, snap, snap);
}
