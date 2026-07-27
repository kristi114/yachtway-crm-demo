import { MasterCoverSchema } from "@yachtway/shared";
import { apiFetch, listEnvelope } from "./client";

export function listMasterCover(params?: { cursor?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set("cursor", params.cursor);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/mastercover${suffix}`, { response: listEnvelope(MasterCoverSchema) });
}

export function getMasterCover(id: string) {
  return apiFetch(`/mastercover/${id}`, { response: MasterCoverSchema });
}

export function mastercoverForContact(contactId: string) {
  return apiFetch(`/contacts/${contactId}/mastercover`, {
    response: listEnvelope(MasterCoverSchema),
  });
}
