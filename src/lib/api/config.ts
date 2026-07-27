import type { Role as SharedRole } from "@yachtway/shared";
import type { Role as DemoRole } from "@/lib/auth";

/**
 * Base URL for the Express API (apps/api). Overridable via VITE_API_URL.
 * Defaults to http://localhost:4000 for local development.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:4000";

/**
 * Map the demo lowercase role to the shared uppercase `Role`.
 * Only used for local display / the demo fallback - never sent when a real
 * WorkOS token is available (the API derives the role from the token).
 */
export function toApiRole(role: DemoRole): SharedRole {
  switch (role) {
    case "sales_rep": return "SALES_REP";
    case "fintech": return "FINTECH";
    case "marketing": return "MARKETING";
    case "admin": return "ADMIN";
  }
}

/**
 * The api-client asks this provider for a fresh WorkOS AuthKit access token on
 * every request. AuthKit auto-refreshes, so we always call through rather than
 * caching. Registered once by the auth gate when AuthKit is enabled.
 */
type TokenProvider = () => Promise<string | null | undefined>;

let tokenProvider: TokenProvider | null = null;

export function setAccessTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export async function getAccessTokenForApi(): Promise<string | null> {
  if (!tokenProvider) return null;
  try {
    return (await tokenProvider()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Demo fallback headers, used only when no AuthKit token provider is
 * registered (VITE_WORKOS_CLIENT_ID unset) so local/mock mode still works.
 */
export const authHeaders: { role: SharedRole; userId?: string } = {
  role: "SALES_REP",
};

export function setActiveApiRole(role: SharedRole, userId?: string): void {
  authHeaders.role = role;
  authHeaders.userId = userId;
}
