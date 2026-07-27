import { z } from "zod";

import { apiFetch, listEnvelope } from "./client";

/**
 * Brands are a managed lookup owned by the database (`brands` table). The CRM
 * never treats them as free text: pickers read this catalogue and write back
 * brand ids.
 */
export const ApiBrandSchema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean().optional().default(true),
  manufacturerCountry: z.string().nullish(),
  tier: z.enum(["Luxury", "Premium", "Mainstream"]).nullish(),
});
export type ApiBrand = z.infer<typeof ApiBrandSchema>;

/** GET /brands - full managed catalogue. */
export function listBrands(params?: { limit?: number; search?: string }) {
  const qs = new URLSearchParams();
  qs.set("limit", String(params?.limit ?? 500));
  if (params?.search) qs.set("search", params.search);
  return apiFetch(`/brands?${qs}`, { response: listEnvelope(ApiBrandSchema) });
}

export function createApiBrand(body: { name: string; active?: boolean }) {
  return apiFetch(`/brands`, { method: "POST", body, response: ApiBrandSchema });
}

export function updateApiBrand(id: string, body: { name?: string; active?: boolean }) {
  return apiFetch(`/brands/${id}`, { method: "PATCH", body, response: ApiBrandSchema });
}

/** PATCH /companies/:id - authorizedBrands is the m2m relation on Company. */
export function setApiCompanyBrands(companyId: string, brandIds: string[]) {
  return apiFetch(`/companies/${companyId}`, {
    method: "PATCH",
    body: { authorizedBrands: brandIds },
    response: z.object({ id: z.string() }).passthrough(),
  });
}
