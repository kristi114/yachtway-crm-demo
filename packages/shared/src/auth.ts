import { z } from "zod";
import { IdSchema } from "./common.js";

/**
 * CRM roles (permission sets). The WorkOS-issued JWT resolves to exactly one of
 * these on the API; RLS policies key off it via a per-request session variable.
 */
export const RoleSchema = z.enum(["SALES_REP", "FINTECH", "MARKETING", "ADMIN"]);
export type Role = z.infer<typeof RoleSchema>;

/**
 * System (machine) actors that are NEVER carried by a user JWT — deliberately
 * kept out of RoleSchema so an incoming token can never claim one. They exist
 * only so server-side integration code (provider webhooks) can write under RLS
 * via withRole(), keeping the DB the enforcement point even for machine writes.
 */
export const SystemRoleSchema = z.enum(["INTEGRATION"]);
export type SystemRole = z.infer<typeof SystemRoleSchema>;

/** The authenticated user, as returned by GET /me. */
export const SessionUserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  name: z.string().nullable(),
  role: RoleSchema,
});
export type SessionUser = z.infer<typeof SessionUserSchema>;
