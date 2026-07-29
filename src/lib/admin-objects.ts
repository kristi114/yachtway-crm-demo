import { useSyncExternalStore } from "react";

/**
 * Admin object & field model store.
 *
 * A lightweight metadata layer: CRM objects (standard + custom) and their fields
 * (standard + custom), CRUD-able from Admin → Object manager. localStorage-backed
 * for the mock; this is the seam for a real metadata API / Prisma-driven schema.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "datetime"
  | "checkbox"
  | "picklist"
  | "multipicklist"
  | "email"
  | "phone"
  | "url"
  | "lookup"
  | "formula";

export const FIELD_TYPES: { value: FieldType; label: string; group: string }[] = [
  { value: "text", label: "Text", group: "Basic" },
  { value: "textarea", label: "Long text", group: "Basic" },
  { value: "number", label: "Number", group: "Numeric" },
  { value: "currency", label: "Currency", group: "Numeric" },
  { value: "percent", label: "Percent", group: "Numeric" },
  { value: "checkbox", label: "Checkbox", group: "Basic" },
  { value: "date", label: "Date", group: "Date" },
  { value: "datetime", label: "Date/Time", group: "Date" },
  { value: "picklist", label: "Picklist", group: "Choice" },
  { value: "multipicklist", label: "Multi-select picklist", group: "Choice" },
  { value: "email", label: "Email", group: "Contact" },
  { value: "phone", label: "Phone", group: "Contact" },
  { value: "url", label: "URL", group: "Contact" },
  { value: "lookup", label: "Lookup (relationship)", group: "Relationship" },
  { value: "formula", label: "Formula", group: "Advanced" },
];

export type FormulaReturnType = "text" | "number" | "currency" | "percent" | "checkbox" | "date";

export interface CrmField {
  id: string;
  objectKey: string;
  label: string;
  apiName: string;
  type: FieldType;
  required: boolean;
  helpText?: string;
  options?: string[]; // picklist / multipicklist
  lookupObject?: string; // lookup target object key
  formula?: string;
  formulaReturnType?: FormulaReturnType;
  custom: boolean;
  createdAt: string;
}

export interface CrmObject {
  key: string;
  label: string;
  labelPlural: string;
  description?: string;
  custom: boolean;
}

const OBJ_KEY = "yw:admin-objects:v1";
const FLD_KEY = "yw:admin-fields:v1";

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

function seedObjects(): CrmObject[] {
  return [
    { key: "company", label: "Company", labelPlural: "Companies", custom: false, description: "Accounts: dealers, brokerages, shipyards, banks, lenders, insurers." },
    { key: "contact", label: "Contact", labelPlural: "Contacts", custom: false, description: "People: brokers, buyers, key personnel." },
    { key: "opportunity", label: "Opportunity", labelPlural: "Opportunities", custom: false, description: "Deals across sales, EasyFund and MasterCover pipelines." },
    { key: "listing", label: "Listing", labelPlural: "Listings", custom: false, description: "Vessel listings brokered on the platform." },
    { key: "dealer_event", label: "Dealer Event", labelPlural: "Dealer Events", custom: false, description: "Boat shows, onboarding, refresher sessions." },
    { key: "invoice", label: "Invoice", labelPlural: "Invoices", custom: false, description: "Billing documents and their line items." },
  ];
}

let idc = 0;
function fid(): string {
  return `fld_${Date.now().toString(36)}_${(idc++).toString(36)}`;
}

function f(objectKey: string, label: string, apiName: string, type: FieldType, extra: Partial<CrmField> = {}): CrmField {
  return {
    id: fid(),
    objectKey,
    label,
    apiName,
    type,
    required: false,
    custom: false,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

function seedFields(): CrmField[] {
  return [
    // Company
    f("company", "Name", "name", "text", { required: true }),
    f("company", "Company Type", "company_type", "picklist", { options: ["Dealer", "Brokerage", "Shipyard", "Lender", "Insurance Firm", "Marina", "Other", "Naval Designer / Architect", "Documentation Company"] }),
    f("company", "Status", "status", "picklist", { options: ["Lead", "MQL", "SQL", "Active Customer", "Past Customer"] }),
    f("company", "Website", "website", "url"),
    f("company", "Annual Revenue", "annual_revenue", "currency"),
    // Contact
    f("contact", "First Name", "first_name", "text", { required: true }),
    f("contact", "Last Name", "last_name", "text", { required: true }),
    f("contact", "Email", "email", "email"),
    f("contact", "Mobile Phone", "mobile_phone", "phone"),
    f("contact", "Company", "company_id", "lookup", { lookupObject: "company" }),
    f("contact", "Buyer Intent Score", "buyer_intent_score", "number"),
    // Opportunity
    f("opportunity", "Name", "name", "text", { required: true }),
    f("opportunity", "Amount", "amount", "currency"),
    f("opportunity", "Stage", "stage", "picklist", { options: ["Prospecting", "Qualification", "Proposal Sent", "Negotiation", "Closed Won", "Closed Lost"] }),
    f("opportunity", "Close Date", "close_date", "date"),
    f("opportunity", "Primary Contact", "contact_id", "lookup", { lookupObject: "contact" }),
    // Listing
    f("listing", "Model", "model", "text"),
    f("listing", "Year", "year", "number"),
    f("listing", "Price (USD)", "price_usd", "currency"),
    f("listing", "Length (ft)", "length_ft", "number"),
    f("listing", "Status", "status", "picklist", { options: ["Active", "Under Offer", "Sold", "Withdrawn"] }),
  ];
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

function load<T>(key: string, fallback: () => T[]): T[] {
  if (typeof window === "undefined") return fallback();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback();
  } catch {
    return fallback();
  }
}

let objects: CrmObject[] = load(OBJ_KEY, seedObjects);
let fields: CrmField[] = load(FLD_KEY, seedFields);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const objSnap = () => objects;
const fldSnap = () => fields;

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OBJ_KEY, JSON.stringify(objects));
    window.localStorage.setItem(FLD_KEY, JSON.stringify(fields));
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

export function toApiName(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/* -------- Objects -------- */

export function listObjects(): CrmObject[] {
  return objects;
}

export function getObject(key: string): CrmObject | undefined {
  return objects.find((o) => o.key === key);
}

export function createObject(input: { label: string; labelPlural: string; description?: string }): CrmObject {
  const key = toApiName(input.label);
  const obj: CrmObject = { key, label: input.label, labelPlural: input.labelPlural || `${input.label}s`, description: input.description, custom: true };
  objects = [...objects.filter((o) => o.key !== key), obj];
  persist();
  emit();
  return obj;
}

export function updateObject(key: string, patch: Partial<CrmObject>) {
  objects = objects.map((o) => (o.key === key ? { ...o, ...patch, key: o.key } : o));
  persist();
  emit();
}

export function deleteObject(key: string) {
  const obj = objects.find((o) => o.key === key);
  if (!obj || !obj.custom) return; // only custom objects deletable
  objects = objects.filter((o) => o.key !== key);
  fields = fields.filter((fl) => fl.objectKey !== key);
  persist();
  emit();
}

/* -------- Fields -------- */

export function listFields(objectKey: string): CrmField[] {
  return fields.filter((fl) => fl.objectKey === objectKey);
}

export function createField(input: Omit<CrmField, "id" | "createdAt" | "custom">): CrmField {
  const field: CrmField = { ...input, id: fid(), custom: true, createdAt: new Date().toISOString() };
  fields = [...fields, field];
  persist();
  emit();
  return field;
}

export function updateField(id: string, patch: Partial<CrmField>) {
  fields = fields.map((fl) => (fl.id === id ? { ...fl, ...patch, id: fl.id } : fl));
  persist();
  emit();
}

export function deleteField(id: string) {
  const fl = fields.find((x) => x.id === id);
  if (!fl || !fl.custom) return; // only custom fields deletable
  fields = fields.filter((x) => x.id !== id);
  persist();
  emit();
}

/* -------- Hooks -------- */

export function useObjects(): CrmObject[] {
  return useSyncExternalStore(subscribe, objSnap, objSnap);
}

export function useFields(): CrmField[] {
  return useSyncExternalStore(subscribe, fldSnap, fldSnap);
}
