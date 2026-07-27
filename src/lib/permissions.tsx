import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_ROLE_GRANTS,
  can as sharedCan,
  type Action,
  type EffectivePermissions,
  type ResourceClass as SharedResourceClass,
  type Role as SharedRole,
} from "@yachtway/shared";
import { useAuth } from "@/lib/auth";
import { setActiveApiRole } from "@/lib/api/config";
import { getMyPermissions } from "@/lib/api/me";
import { toApiRole } from "@/lib/api/config";

type ApiStatus = "idle" | "connecting" | "online" | "offline";

interface PermissionsContextValue {
  permissions: EffectivePermissions;
  apiRole: SharedRole;
  apiStatus: ApiStatus;
  /** True when permissions came from the live API (not the local fallback). */
  source: "api" | "fallback";
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

/**
 * Loads `/me/permissions` on mount and whenever the active role changes.
 * Falls back to `DEFAULT_ROLE_GRANTS` from the shared contract when the API
 * is unreachable so screens keep working against mock data.
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, isRealSession } = useAuth();
  const apiRole = toApiRole(user.role);

  const fallback: EffectivePermissions = useMemo(() => ({
    userId: user.id,
    role: apiRole,
    grants: DEFAULT_ROLE_GRANTS[apiRole],
  }), [user.id, apiRole]);

  const [state, setState] = useState<{
    permissions: EffectivePermissions;
    status: ApiStatus;
    source: "api" | "fallback";
  }>({ permissions: fallback, status: "idle", source: "fallback" });

  useEffect(() => {
    if (!isRealSession) setActiveApiRole(apiRole, user.id);
    let cancelled = false;
    setState((s) => ({ ...s, permissions: fallback, source: "fallback", status: "connecting" }));
    getMyPermissions()
      .then((perms) => {
        if (cancelled) return;
        setState({ permissions: perms, status: "online", source: "api" });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ permissions: fallback, status: "offline", source: "fallback" });
      });
    return () => { cancelled = true; };
  }, [apiRole, user.id, fallback, isRealSession]);

  const value: PermissionsContextValue = {
    permissions: state.permissions,
    apiRole,
    apiStatus: state.status,
    source: state.source,
  };

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider");
  return ctx;
}

/**
 * `useCan("easyfund", "read")` - matches the shared `can()` predicate. Use
 * this for API-backed sections (Companies, Contacts, EasyFund, MasterCover,
 * Conversations, Analytics). Legacy mock-only sections keep using
 * `useAuth().can(...)`.
 */
export function useCan(resource: SharedResourceClass, action: Action = "read"): boolean {
  const { permissions } = usePermissions();
  return sharedCan(permissions, resource, action);
}
