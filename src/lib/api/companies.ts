import {
  CompanySchema,
  type Company,
  type CompanyCreate,
  type CompanyUpdate,
} from "@yachtway/shared";
import { apiFetch, listEnvelope } from "./client";

/** GET /companies - paginated list. */
export function listCompanies(params?: { cursor?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set("cursor", params.cursor);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/companies${suffix}`, { response: listEnvelope(CompanySchema) });
}

export function getApiCompany(id: string) {
  return apiFetch(`/companies/${id}`, { response: CompanySchema });
}

export function createApiCompany(body: CompanyCreate): Promise<Company> {
  return apiFetch(`/companies`, {
    method: "POST",
    body,
    response: CompanySchema,
  });
}

export function updateApiCompany(id: string, body: CompanyUpdate): Promise<Company> {
  return apiFetch(`/companies/${id}`, {
    method: "PATCH",
    body,
    response: CompanySchema,
  });
}
