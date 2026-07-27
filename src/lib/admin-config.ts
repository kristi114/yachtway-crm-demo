import { useSyncExternalStore } from "react";
import type { FieldSection, FieldType } from "@/lib/field-schema";
import {
  COMPANY_SECTIONS,
  CONTACT_SECTIONS,
  OPPORTUNITY_SECTIONS,
  LISTING_SECTIONS,
} from "@/lib/field-schema";
import type { ResourceClass, Role } from "@/lib/auth";

/**
 * Admin configuration store.
 *
 * Holds the admin-editable layer on top of the generated field catalog:
 * per-field overrides (label, visibility, required, sensitivity) and an
 * append-only audit log of every admin change. Persisted to localStorage so
 * the config survives reloads; the backend admin endpoints will replace the
 * storage layer only - the shape below is the contract screens read.
 */

export type ObjectKey = "company" | "contact" | "opportunity" | "listing";

export const OBJECTS: { key: ObjectKey; label: string; sections: readonly FieldSection[] }[] = [
  { key: "company", label: "Company", sections: COMPANY_SECTIONS },
  { key: "contact", label: "Contact", sections: CONTACT_SECTIONS },
  { key: "opportunity", label: "Opportunity", sections: OPPORTUNITY_SECTIONS },
  { key: "listing", label: "Listing", sections: LISTING_SECTIONS },
];

export interface FieldOverride {
  label?: string;
  hidden?: boolean;
  required?: boolean;
  sensitivity?: ResourceClass;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  actorRole: Role;
  action: string;
  target: string;
  before?: string;
  after?: string;
}

/** A CRM user record managed from the admin console. */
export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  region: string;
  currency: string;
  status: "active" | "invited" | "disabled";
  /** Access areas granted on top of the user's role. */
  extraGrants: ResourceClass[];
  /** Access areas removed from the user's role. */
  revokedGrants: ResourceClass[];
}

interface AdminState {
  overrides: Record<string, FieldOverride>; // key: `${object}.${fieldKey}`
  audit: AuditEntry[];
  /** Admin-edited role -> access-area matrix. Missing role = platform default. */
  roleGrants: Partial<Record<Role, ResourceClass[]>>;
  users: ManagedUser[];
}

const STORAGE_KEY = "yw_admin_config_v2";


const SEED_AUDIT: AuditEntry[] = [
  {
    id: "a_seed_3",
    at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    actor: "Kristi Toom",
    actorRole: "admin",
    action: "Role changed",
    target: "priya.chandra@yachtway.com",
    before: "Sales Rep",
    after: "Fintech",
  },
  {
    id: "a_seed_2",
    at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    actor: "Kristi Toom",
    actorRole: "admin",
    action: "Field hidden",
    target: "company.listingsAllTime",
  },
  {
    id: "a_seed_1",
    at: new Date(Date.now() - 1000 * 60 * 60 * 74).toISOString(),
    actor: "Kristi Toom",
    actorRole: "admin",
    action: "Field renamed",
    target: "contact.mobilePhone",
    before: "Mobile Phone",
    after: "Mobile",
  },
];

/**
 * Platform default access matrix. Mirrors the role grants shipped with the
 * API; admins can widen or narrow it per role from Admin -> Access.
 */
export const BASE_ROLE_GRANTS: Record<Role, ResourceClass[]> = {
  sales_rep: [
    "contact.general",
    "company.general",
    "opportunity.general",
    "conversations.general",
    "billing",
    "services",
    "events",
    "emails",
  ],
  fintech: [
    "contact.general",
    "company.general",
    "opportunity.general",
    "easyfund",
    "mastercover",
    "conversations.general",
    "conversations.financing",
    "billing",
    "services",
    "events",
    "referrals",
  ],
  marketing: ["contact.general", "company.general", "emails"],
  admin: [
    "contact.general",
    "company.general",
    "opportunity.general",
    "easyfund",
    "mastercover",
    "conversations.general",
    "conversations.financing",
    "billing",
    "services",
    "events",
    "referrals",
    "emails",
    "admin",
  ],
};

function seedUser(
  id: string, name: string, email: string, role: Role, region = "US", currency = "USD",
): ManagedUser {
  return { id, name, email, role, region, currency, status: "active", extraGrants: [], revokedGrants: [] };
}

const SEED_USERS: ManagedUser[] = [
  seedUser("u_rep", "Mavil", "alex.rivera@yachtway.com", "sales_rep"),
  seedUser("u_fin", "Debbie", "priya.chandra@yachtway.com", "fintech"),
  seedUser("u_mkt", "Gianmarco", "jordan.bell@yachtway.com", "marketing"),
  seedUser("u_adm", "Kristi Toom", "kristi@yachtway.com", "admin"),
  seedUser("u_rep_eu", "Sophie Laurent", "sophie.laurent@yachtway.com", "sales_rep"),
  seedUser("u_rep_uk", "Oliver Whitfield", "oliver.whitfield@yachtway.com", "sales_rep"),
];

const DEFAULT_STATE: AdminState = {
  overrides: {},
  audit: SEED_AUDIT,
  roleGrants: {},
  users: SEED_USERS,
};

let state: AdminState = DEFAULT_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AdminState>;
      state = {
        overrides: parsed.overrides ?? {},
        audit: parsed.audit?.length ? parsed.audit : SEED_AUDIT,
        roleGrants: parsed.roleGrants ?? {},
        users: parsed.users?.length ? parsed.users : SEED_USERS,
      };
    }
  } catch {
    /* corrupt payload - keep defaults */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode - in-memory only */
  }
}

function emit() {
  persist();
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  hydrate();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

const SERVER_SNAPSHOT: AdminState = DEFAULT_STATE;


/** Reactive read of the whole admin config. */
export function useAdminConfig(): AdminState {
  return useSyncExternalStore(
    subscribe,
    () => { hydrate(); return state; },
    () => SERVER_SNAPSHOT,
  );
}

export function overrideKey(object: ObjectKey, fieldKey: string): string {
  return `${object}.${fieldKey}`;
}

export function logAudit(entry: Omit<AuditEntry, "id" | "at">) {
  state = {
    ...state,
    audit: [
      { ...entry, id: `a_${Date.now().toString(36)}`, at: new Date().toISOString() },
      ...state.audit,
    ].slice(0, 500),
  };
  emit();
}

export function setFieldOverride(
  object: ObjectKey,
  fieldKey: string,
  patch: FieldOverride,
  actor: { name: string; role: Role },
  audit?: { action: string; before?: string; after?: string },
) {
  const key = overrideKey(object, fieldKey);
  const next = { ...(state.overrides[key] ?? {}), ...patch };
  // Drop no-op keys so an un-touched field stays "default".
  for (const k of Object.keys(next) as (keyof FieldOverride)[]) {
    if (next[k] === undefined || next[k] === "") delete next[k];
  }
  state = { ...state, overrides: { ...state.overrides, [key]: next } };
  if (audit) {
    logAudit({
      actor: actor.name,
      actorRole: actor.role,
      action: audit.action,
      target: key,
      before: audit.before,
      after: audit.after,
    });
  } else {
    emit();
  }
}

export function resetFieldOverride(
  object: ObjectKey,
  fieldKey: string,
  actor: { name: string; role: Role },
) {
  const key = overrideKey(object, fieldKey);
  if (!state.overrides[key]) return;
  const overrides = { ...state.overrides };
  delete overrides[key];
  state = { ...state, overrides };
  logAudit({ actor: actor.name, actorRole: actor.role, action: "Field reset to default", target: key });
}

/** Flat, override-applied field list for an object - what admin screens render. */
export interface AdminField {
  key: string;
  sectionId: string;
  sectionTitle: string;
  label: string;
  defaultLabel: string;
  type: FieldType;
  sensitivity: ResourceClass;
  defaultSensitivity: ResourceClass;
  hidden: boolean;
  required: boolean;
  customized: boolean;
}

export function adminFields(
  object: ObjectKey,
  overrides: Record<string, FieldOverride>,
): AdminField[] {
  const def = OBJECTS.find((o) => o.key === object);
  if (!def) return [];
  const out: AdminField[] = [];
  for (const section of def.sections) {
    for (const f of section.fields) {
      const o = overrides[overrideKey(object, f.key)] ?? {};
      out.push({
        key: f.key,
        sectionId: section.id,
        sectionTitle: section.title,
        label: o.label ?? f.label,
        defaultLabel: f.label,
        type: f.type,
        sensitivity: o.sensitivity ?? f.sensitivity,
        defaultSensitivity: f.sensitivity,
        hidden: o.hidden ?? false,
        required: o.required ?? false,
        customized: Object.keys(o).length > 0,
      });
    }
  }
  return out;
}

export const SENSITIVITY_OPTIONS: ResourceClass[] = [
  "contact.general",
  "company.general",
  "opportunity.general",
  "easyfund",
  "mastercover",
  "conversations.general",
  "conversations.financing",
  "admin",
];

/* ------------------------------------------------------------------ */
/* Access areas (what a role/user can see in the CRM)                   */
/* ------------------------------------------------------------------ */

export interface AccessArea {
  key: ResourceClass;
  label: string;
  description: string;
  group: "Sales" | "FinTech" | "System";
}

export const ACCESS_AREAS: AccessArea[] = [
  { key: "company.general", label: "Companies", description: "Brokerages, dealers, shipyards and their profiles.", group: "Sales" },
  { key: "contact.general", label: "Contacts", description: "People records, brokers and key personnel.", group: "Sales" },
  { key: "opportunity.general", label: "Opportunities & pipelines", description: "Sales pipeline, deals, forecasting.", group: "Sales" },
  { key: "conversations.general", label: "Conversations", description: "Email, calls, notes and Crisp chats.", group: "Sales" },
  { key: "easyfund", label: "EasyFund (loans)", description: "Loan applications, PFS, lender records.", group: "FinTech" },
  { key: "mastercover", label: "MasterCover (insurance)", description: "Insurance policies and VATO records.", group: "FinTech" },
  { key: "referrals", label: "Referrals & commissions", description: "Referral dashboard, commission payouts and referral invoices.", group: "FinTech" },
  { key: "conversations.financing", label: "Financing conversations", description: "Threads tied to lending and insurance.", group: "FinTech" },
  { key: "billing", label: "Billing, invoices & estimates", description: "Invoices, estimates, amounts and accounting fields.", group: "Sales" },
  { key: "services", label: "Services adoption", description: "Service matrix and per-account adoption.", group: "Sales" },
  { key: "events", label: "Dealer events", description: "Boat shows, onboarding and refresher events.", group: "Sales" },
  { key: "emails", label: "Emails", description: "Email templates: drag-and-drop designer and HTML editor.", group: "Sales" },
  { key: "admin", label: "Admin console", description: "Fields, users, access matrix and audit log.", group: "System" },
];

/** Access areas a role sees, after admin edits. */
export function roleGrantsFor(role: Role, cfg: Pick<AdminState, "roleGrants">): ResourceClass[] {
  return cfg.roleGrants[role] ?? BASE_ROLE_GRANTS[role];
}

/** Final access areas for a specific user: role matrix +/- per-user overrides. */
export function effectiveGrantsFor(
  role: Role,
  cfg: Pick<AdminState, "roleGrants" | "users">,
  userId?: string,
): ResourceClass[] {
  const base = roleGrantsFor(role, cfg);
  const u = userId ? cfg.users.find((x) => x.id === userId) : undefined;
  if (!u) return base;
  if (u.status === "disabled") return [];
  const set = new Set(base);
  for (const g of u.extraGrants) set.add(g);
  for (const g of u.revokedGrants) set.delete(g);
  return ACCESS_AREAS.map((a) => a.key).filter((k) => set.has(k));
}

/** Non-reactive read for consumers outside React (auth bootstrap). */
export function readAdminConfig(): AdminState {
  hydrate();
  return state;
}

type Actor = { name: string; role: Role };

export function setRoleGrant(
  role: Role,
  area: ResourceClass,
  enabled: boolean,
  actor: Actor,
) {
  const current = roleGrantsFor(role, state);
  const next = enabled
    ? Array.from(new Set([...current, area]))
    : current.filter((a) => a !== area);
  state = { ...state, roleGrants: { ...state.roleGrants, [role]: next } };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: enabled ? "Access granted to role" : "Access revoked from role",
    target: `${role} · ${area}`,
  });
}

export function resetRoleGrants(role: Role, actor: Actor) {
  const roleGrants = { ...state.roleGrants };
  delete roleGrants[role];
  state = { ...state, roleGrants };
  logAudit({ actor: actor.name, actorRole: actor.role, action: "Role access reset to default", target: role });
}

export function addUser(
  input: { name: string; email: string; role: Role; region?: string; currency?: string },
  actor: Actor,
) {
  const user: ManagedUser = {
    id: `u_${Date.now().toString(36)}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    region: input.region ?? "US",
    currency: input.currency ?? "USD",
    status: "invited",
    extraGrants: [],
    revokedGrants: [],
  };
  state = { ...state, users: [...state.users, user] };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: "User invited",
    target: user.email,
    after: user.role,
  });
  return user;
}

export function updateUser(id: string, patch: Partial<ManagedUser>, actor: Actor, audit?: { action: string; before?: string; after?: string }) {
  const before = state.users.find((u) => u.id === id);
  if (!before) return;
  state = { ...state, users: state.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) };
  logAudit({
    actor: actor.name,
    actorRole: actor.role,
    action: audit?.action ?? "User updated",
    target: before.email,
    before: audit?.before,
    after: audit?.after,
  });
}

export function setUserGrant(id: string, area: ResourceClass, enabled: boolean, actor: Actor) {
  const u = state.users.find((x) => x.id === id);
  if (!u) return;
  const roleHas = roleGrantsFor(u.role, state).includes(area);
  let extraGrants = u.extraGrants.filter((a) => a !== area);
  let revokedGrants = u.revokedGrants.filter((a) => a !== area);
  if (enabled && !roleHas) extraGrants = [...extraGrants, area];
  if (!enabled && roleHas) revokedGrants = [...revokedGrants, area];
  updateUser(id, { extraGrants, revokedGrants }, actor, {
    action: enabled ? "User access granted" : "User access revoked",
    after: area,
  });
}

export function removeUser(id: string, actor: Actor) {
  const u = state.users.find((x) => x.id === id);
  if (!u) return;
  state = { ...state, users: state.users.filter((x) => x.id !== id) };
  logAudit({ actor: actor.name, actorRole: actor.role, action: "User removed", target: u.email });
}
