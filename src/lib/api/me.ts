import { z } from "zod";
import {
  EffectivePermissionsSchema,
  RoleSchema,
  type EffectivePermissions,
} from "@yachtway/shared";
import { apiFetch } from "./client";

const MeSchema = z.object({
  userId: z.string(),
  role: RoleSchema,
});
export type Me = z.infer<typeof MeSchema>;

export function getMe(): Promise<Me> {
  return apiFetch(`/me`, { response: MeSchema });
}

export function getMyPermissions(): Promise<EffectivePermissions> {
  return apiFetch(`/me/permissions`, { response: EffectivePermissionsSchema });
}

const HealthSchema = z.object({ status: z.string().optional() }).passthrough();
export function health() {
  return apiFetch(`/health`, { response: HealthSchema });
}
