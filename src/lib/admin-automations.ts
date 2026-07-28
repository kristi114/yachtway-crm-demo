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

export type FieldControl =
  | "text"
  | "number"
  | "template" // dropdown of email templates
  | "object-field" // dropdown of the trigger object's fields
  | "value-for-field" // input/dropdown driven by the field picked in `dependsOn`
  | "record-link" // link a created record to the triggering / related record
  | "object-select" // dropdown of objects
  | "select"; // fixed options

export interface ActionFieldSpec {
  key: string;
  label: string;
  placeholder?: string;
  control: FieldControl;
  options?: string[];
  dependsOn?: string;
  required?: boolean;
}

export interface ActionSpec {
  key: ActionKey;
  label: string;
  fields: ActionFieldSpec[];
}

export const ACTIONS: ActionSpec[] = [
  { key: "send_email", label: "Send email", fields: [
    { key: "template", label: "Template", control: "template", required: true },
    { key: "to", label: "To", control: "text", placeholder: "{{contact.email}}", required: true },
    { key: "subject", label: "Subject (override)", control: "text", placeholder: "Optional" },
  ] },
  { key: "create_record", label: "Create record", fields: [
    { key: "object", label: "Object", control: "object-select", required: true },
    { key: "values", label: "Field values", control: "text", placeholder: "name=…, amount=…" },
  ] },
  { key: "update_field", label: "Update field", fields: [
    { key: "field", label: "Field", control: "object-field", required: true },
    { key: "value", label: "New value", control: "value-for-field", dependsOn: "field", required: true },
  ] },
  { key: "create_task", label: "Create task", fields: [
    { key: "subject", label: "Subject", control: "text", placeholder: "Follow up", required: true },
    { key: "assignee", label: "Assign to", control: "select", options: ["Record owner", "Record creator", "Specific user"] },
    { key: "relateTo", label: "Related to", control: "record-link" },
    { key: "dueInDays", label: "Due in (days)", control: "number", placeholder: "3" },
  ] },
  { key: "notify", label: "Send notification", fields: [
    { key: "to", label: "Notify", control: "text", placeholder: "Record owner / #channel", required: true },
    { key: "message", label: "Message", control: "text", placeholder: "New high-intent lead", required: true },
  ] },
  { key: "add_tag", label: "Add tag", fields: [{ key: "tag", label: "Tag", control: "text", placeholder: "hot-lead", required: true }] },
  { key: "webhook", label: "Call webhook", fields: [
    { key: "url", label: "URL", control: "text", placeholder: "https://…", required: true },
    { key: "method", label: "Method", control: "select", options: ["POST", "GET", "PUT", "PATCH", "DELETE"] },
  ] },
];

/* ------------------------------------------------------------------ */
/* Conditions (structured, type-aware)                                 */
/* ------------------------------------------------------------------ */

export interface Clause {
  id: string;
  field: string;
  op: string;
  value?: string;
}
export interface ConditionGroup {
  match: "all" | "any";
  clauses: Clause[];
}
export function emptyGroup(): ConditionGroup {
  return { match: "all", clauses: [] };
}
export function clauseId(): string {
  return `cl_${Math.random().toString(36).slice(2, 8)}`;
}

export type OpCat = "text" | "number" | "date" | "checkbox" | "option" | "multioption" | "lookup";

export const OPERATORS: Record<OpCat, { value: string; label: string; noValue?: boolean }[]> = {
  text: [
    { value: "eq", label: "equals" },
    { value: "neq", label: "does not equal" },
    { value: "contains", label: "contains" },
    { value: "ncontains", label: "does not contain" },
    { value: "starts", label: "starts with" },
    { value: "empty", label: "is empty", noValue: true },
    { value: "nempty", label: "is not empty", noValue: true },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
    { value: "empty", label: "is empty", noValue: true },
    { value: "nempty", label: "is not empty", noValue: true },
  ],
  date: [
    { value: "eq", label: "is on" },
    { value: "before", label: "is before" },
    { value: "after", label: "is after" },
    { value: "empty", label: "is empty", noValue: true },
    { value: "nempty", label: "is not empty", noValue: true },
  ],
  checkbox: [
    { value: "true", label: "is checked", noValue: true },
    { value: "false", label: "is unchecked", noValue: true },
  ],
  option: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "empty", label: "is empty", noValue: true },
    { value: "nempty", label: "is not empty", noValue: true },
  ],
  multioption: [
    { value: "contains", label: "includes" },
    { value: "ncontains", label: "does not include" },
    { value: "empty", label: "is empty", noValue: true },
    { value: "nempty", label: "is not empty", noValue: true },
  ],
  lookup: [
    { value: "set", label: "is set", noValue: true },
    { value: "nset", label: "is not set", noValue: true },
    { value: "eq", label: "equals (id)" },
  ],
};

export function opCatForType(type: string): OpCat {
  switch (type) {
    case "number":
    case "currency":
    case "percent":
      return "number";
    case "date":
    case "datetime":
      return "date";
    case "checkbox":
      return "checkbox";
    case "picklist":
      return "option";
    case "multipicklist":
      return "multioption";
    case "lookup":
      return "lookup";
    default:
      return "text";
  }
}

export function opNeedsValue(cat: OpCat, op: string): boolean {
  const spec = OPERATORS[cat].find((o) => o.value === op);
  return !spec?.noValue;
}

export type StepKind = "action" | "delay" | "branch";

export interface FlowStep {
  id: string;
  kind: StepKind;
  action?: ActionKey;
  config?: Record<string, string>;
  delay?: { amount: number; unit: "minutes" | "hours" | "days" };
  condition?: ConditionGroup;
  yes?: FlowStep[];
  no?: FlowStep[];
}

export interface FlowTrigger {
  type: TriggerType;
  objectKey?: string;
  field?: string;
  detail?: string;
  filter?: ConditionGroup;
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

const KEY = "yw:admin-flows:v2";

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
          condition: { match: "all", clauses: [{ id: clauseId(), field: "buyer_intent_score", op: "gt", value: "70" }] },
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
      id: "flw_paid_seat",
      name: "Paid seat activated → notify owner",
      description: "When a contact's Paid Seat On Platform is switched on, email the account owner and banner their dashboard.",
      status: "active",
      trigger: { type: "field_changed", objectKey: "contact", field: "paidSeatOnPlatform" },
      steps: [
        {
          id: stepId(),
          kind: "branch",
          condition: { match: "all", clauses: [{ id: clauseId(), field: "paidSeatOnPlatform", op: "eq", value: "true" }] },
          yes: [
            { id: stepId(), kind: "action", action: "send_email", config: { template: "Paid seat activated", to: "Record owner" } },
            { id: stepId(), kind: "action", action: "notify", config: { to: "Record owner", message: "A contact you own now has a paid seat on the platform." } },
          ],
          no: [],
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
