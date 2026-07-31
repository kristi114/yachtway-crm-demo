import { z } from "zod";
import { RoleSchema, type Role, SystemRoleSchema, type SystemRole } from "./auth.js";
import { IdSchema } from "./common.js";

/**
 * Resource classes are the unit of authorization. Every table/endpoint maps to
 * one. Sensitive domains are their own classes so access is table-level (RLS),
 * not per-column masking.
 */
export const ResourceClassSchema = z.enum([
  "company.general",
  "contact.general",
  "contact.sensitive", // buyer PII/financial signals on the contact record
  "opportunity.general", // opportunities + pipelines/stages (non-financing rows)
  "easyfund", // easyfund_loans satellite (income, credit, down payment…)
  "mastercover", // mastercover_applications satellite
  "conversations.general",
  "conversations.financing",
  "analytics", // analytics_profiles / analytics_snapshots (channel insights + spend)
  "invoice.general", // invoices/payments for subscription/studio/other (non-financing)
  "invoice.financing", // easyfund/mastercover referral invoices + their payments/credit notes
  "bill.general", // payables (studio spend, etc.)
  "bill.financing", // easyfund/mastercover payables
  "estimate.general", // CRM-only client estimates (no financing estimates in v1)
  "receivable.financing", // partner (lender/insurer) amounts owed — accrued on close
  "payout.financing", // money owed/paid to dealers (referral payouts)
  "email.general", // 1:1 transactional + system email and its per-recipient results
  "email.marketing", // templates, campaigns, audiences and bulk marketing sends
  "task.general", // tasks on any record
  "note.general", // notes on any record (private/secure rows filtered per author)
  "appointment.general", // meetings on a record + the owner's personal calendar
]);
export type ResourceClass = z.infer<typeof ResourceClassSchema>;

export const ActionSchema = z.enum(["read", "write"]);
export type Action = z.infer<typeof ActionSchema>;

export const PermissionGrantSchema = z.object({
  resource: ResourceClassSchema,
  read: z.boolean(),
  write: z.boolean(),
});
export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;

/** Payload returned by GET /me/permissions. UI hides what the user can't see; RLS enforces it. */
export const EffectivePermissionsSchema = z.object({
  userId: IdSchema,
  role: RoleSchema,
  grants: z.array(PermissionGrantSchema),
});
export type EffectivePermissions = z.infer<typeof EffectivePermissionsSchema>;

/** Convenience predicate for both the API's authorize() middleware and the UI. */
export function can(
  perms: EffectivePermissions,
  resource: ResourceClass,
  action: Action,
): boolean {
  const grant = perms.grants.find((g) => g.resource === resource);
  return grant ? grant[action] : false;
}

/**
 * Default role -> grants matrix. The DB-backed permission engine is the source
 * of truth; this mirror lets the mock server and UI render before it exists,
 * and documents the intended policy the permission spike must prove out.
 */
const rw = (resource: ResourceClass): PermissionGrant => ({ resource, read: true, write: true });
const ro = (resource: ResourceClass): PermissionGrant => ({ resource, read: true, write: false });

export const DEFAULT_ROLE_GRANTS: Record<Role, PermissionGrant[]> = {
  ADMIN: (ResourceClassSchema.options as ResourceClass[]).map(rw),
  SALES_REP: [
    rw("company.general"),
    rw("contact.general"),
    rw("opportunity.general"),
    rw("conversations.general"),
    ro("analytics"),
    rw("invoice.general"), // subscription/studio/other invoices; a rep may approve their own
    rw("estimate.general"),
    rw("email.general"), // reps send 1:1 mail from their own mailbox
    ro("email.marketing"), // may read campaign results, may not send bulk
    rw("task.general"),
    rw("note.general"),
    rw("appointment.general"),
    // intentionally NO easyfund / mastercover / contact.sensitive / conversations.financing
    // / invoice.financing / bill.* → EasyFund & MasterCover pipeline opportunities and their
    // referral invoices/payables are filtered out for reps (only the Company rollup shows).
  ],
  FINTECH: [
    ro("company.general"),
    ro("contact.general"),
    rw("contact.sensitive"),
    rw("opportunity.general"),
    rw("easyfund"),
    rw("mastercover"),
    rw("conversations.financing"),
    ro("analytics"),
    rw("invoice.general"),
    rw("invoice.financing"),
    rw("bill.general"),
    rw("bill.financing"),
    rw("estimate.general"),
    rw("receivable.financing"),
    rw("payout.financing"),
    rw("task.general"),
    rw("note.general"),
    rw("appointment.general"),
  ],
  MARKETING: [
    ro("company.general"),
    ro("contact.general"),
    ro("opportunity.general"),
    ro("conversations.general"),
    rw("analytics"),
    ro("invoice.general"),
    ro("estimate.general"),
    rw("email.general"),
    rw("email.marketing"), // marketing owns templates, audiences and campaigns
    rw("task.general"),
    rw("note.general"),
    rw("appointment.general"),
  ],
};

/**
 * Grants for system actors (see SystemRoleSchema). INTEGRATION is the identity
 * provider webhooks/inbound run under: it may write conversations (both classes,
 * since inbound email can be general OR financing) and contacts (to flag
 * unsubscribe/complaint). It is intentionally NOT a user role.
 */
export const SYSTEM_ROLE_GRANTS: Record<SystemRole, PermissionGrant[]> = {
  INTEGRATION: [
    rw("conversations.general"),
    rw("conversations.financing"),
    rw("contact.general"),
    // Xero-via-Make inbound: write invoices/payments/bills/credit-notes of both
    // classes, plus company.general to materialize the rep-visible paid-referral /
    // credit / shoot-credit rollups onto the dealer's Company (§4.7 of the plan),
    // and estimate.general for the public accept/decline → invoice-draft conversion.
    rw("invoice.general"),
    rw("invoice.financing"),
    rw("bill.general"),
    rw("bill.financing"),
    rw("estimate.general"),
    rw("company.general"),
    // opportunity.general so the Xero callback can write resolved per-line amounts
    // back onto opportunity_line_items (which share the opportunity.general class).
    rw("opportunity.general"),
    // read-only easyfund/mastercover so the X2 payment webhook can resolve the
    // referring dealer (easyfund_loans.dealer_id) to materialize the rep-visible
    // paid-referral rollup. Read only — it never writes the financing satellites.
    ro("easyfund"),
    ro("mastercover"),
    // partner receivables + dealer payouts: accrued/settled/paid by the system on
    // stage close + settlement + payout endpoints (rolls the dealer/partner totals).
    rw("receivable.financing"),
    rw("payout.financing"),
  ],
};

/** All role keys that must exist in the DB (user roles + system actors). */
export const ALL_ROLE_KEYS: (Role | SystemRole)[] = [
  ...RoleSchema.options,
  ...SystemRoleSchema.options,
];
