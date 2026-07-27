import {
  ContactSchema,
  type Contact,
  type ContactCreate,
  type ContactUpdate,
} from "@yachtway/shared";
import { apiFetch, listEnvelope } from "./client";

export function listContacts(params?: { cursor?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set("cursor", params.cursor);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/contacts${suffix}`, { response: listEnvelope(ContactSchema) });
}

export function getApiContact(id: string) {
  return apiFetch(`/contacts/${id}`, { response: ContactSchema });
}

export function createApiContact(body: ContactCreate): Promise<Contact> {
  return apiFetch(`/contacts`, { method: "POST", body, response: ContactSchema });
}

export function updateApiContact(id: string, body: ContactUpdate): Promise<Contact> {
  return apiFetch(`/contacts/${id}`, { method: "PATCH", body, response: ContactSchema });
}
