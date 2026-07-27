import { EasyFundSchema } from "@yachtway/shared";
import { apiFetch, listEnvelope } from "./client";

/** All loan applications - Fintech/Admin only. */
export function listEasyFund(params?: { cursor?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set("cursor", params.cursor);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/easyfund${suffix}`, { response: listEnvelope(EasyFundSchema) });
}

export function getEasyFund(id: string) {
  return apiFetch(`/easyfund/${id}`, { response: EasyFundSchema });
}

/** Loans linked to a contact via their opportunities. */
export function easyfundForContact(contactId: string) {
  return apiFetch(`/contacts/${contactId}/easyfund`, {
    response: listEnvelope(EasyFundSchema),
  });
}
