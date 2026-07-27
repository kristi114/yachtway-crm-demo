import type { Role } from "@/lib/auth";

/**
 * WorkOS AuthKit configuration. When VITE_WORKOS_CLIENT_ID is set the app runs
 * real AuthKit auth (hosted login + Bearer token on every API call). When it is
 * absent the app falls back to the local demo role switcher so previews and
 * offline work keep functioning.
 */
export const WORKOS_CLIENT_ID: string | undefined =
  (import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined) || undefined;

export const WORKOS_REDIRECT_URI: string | undefined =
  (import.meta.env.VITE_WORKOS_REDIRECT_URI as string | undefined) || undefined;

export const WORKOS_ENABLED = Boolean(WORKOS_CLIENT_ID);

export function resolveRedirectUri(): string {
  if (WORKOS_REDIRECT_URI) return WORKOS_REDIRECT_URI;
  if (typeof window !== "undefined") return `${window.location.origin}/callback`;
  return "/callback";
}

/**
 * Map a WorkOS organization-membership role slug to the app's local role.
 * The API does the authoritative mapping from the token; this is display only.
 */
export function roleFromWorkOs(slug: string | null | undefined): Role {
  switch ((slug ?? "").toLowerCase()) {
    case "admin":
      return "admin";
    case "fintech":
      return "fintech";
    case "marketing":
      return "marketing";
    case "sales_rep":
    case "member":
      return "sales_rep";
    default:
      return "sales_rep";
  }
}
