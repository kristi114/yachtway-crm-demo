import { z } from "zod";
import { IdSchema } from "./common.js";

/**
 * Brands — managed reference/picklist that backs `Company.authorized_brands` and
 * `Contact.brand_interests` (a many-to-many lookup, same shape as Tags). Replaces
 * the old 1,000+-option free multi-picklist so brand values are controlled,
 * de-duplicated, and admin-managed. Read by any authenticated user; only ADMIN
 * mutates (RLS-enforced).
 */

/** Normalized dedupe key: trimmed + lowercased. "Sea Ray" and " sea ray " collapse. */
export function brandKey(name: string): string {
  return name.trim().toLowerCase();
}

export const BrandSchema = z.object({
  id: IdSchema,
  name: z.string(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type Brand = z.infer<typeof BrandSchema>;

export const BrandCreateSchema = z.object({
  name: z.string().min(1).max(200),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type BrandCreate = z.infer<typeof BrandCreateSchema>;

export const BrandUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type BrandUpdate = z.infer<typeof BrandUpdateSchema>;

/**
 * Optional local-dev seed for the brands picklist. In production the
 * authoritative list lives in the platform's AWS database and is populated via
 * the SYNC service (the dual-write upserts brand rows + company/contact brand
 * associations), NOT from here — leave this empty in prod. The sync must derive
 * its dedupe key the same way as `brandKey()` (trim + lowercase) so it matches
 * the `brands.name_key` unique constraint. `seedBrands()` upserts these by
 * `brandKey`, so this array is only a convenience for local dev.
 */
export const BRAND_SEED: string[] = [
  // e.g. "Sea Ray", "Beneteau", "Azimut", … — real values arrive via the sync.
];
