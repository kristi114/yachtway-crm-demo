import { createContext, useContext, useState, type ReactNode } from "react";
import type { CurrencyCode, Region } from "./currency";
import { REGION_CURRENCY } from "./currency";
import { effectiveGrantsFor, useAdminConfig } from "./admin-config";

/**
 * Mock auth / role model - mirrors the roles from the CRM build plan.
 * Backend will replace this with a Clerk/WorkOS session + Postgres RLS.
 */
export type Role =
  | "sales_rep"
  | "fintech"
  | "marketing"
  | "admin"
  | "lender_partner"
  | "insurance_partner";

export type ResourceClass =
  | "contact.general"
  | "company.general"
  | "opportunity.general"
  | "easyfund"
  | "mastercover"
  | "conversations.general"
  | "conversations.financing"
  | "billing"
  | "services"
  | "events"
  | "referrals"
  | "emails"
  | "admin";

// Default role -> access-area matrix now lives in `admin-config.ts`
// (BASE_ROLE_GRANTS) so admins can edit it from the Admin console.



export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  region: Region;
  currency: CurrencyCode;
  /** For partner roles: the partner org whose deals/contacts they may access. */
  partnerId?: string;
}

const DEMO_USERS: Record<Role, User> = {
  sales_rep: {
    id: "u_rep",
    name: "Mavil",
    email: "alex.rivera@yachtway.com",
    role: "sales_rep",
    region: "US",
    currency: "USD",
  },
  fintech: {
    id: "u_fin",
    name: "Debbie",
    email: "priya.chandra@yachtway.com",
    role: "fintech",
    region: "US",
    currency: "USD",
  },
  marketing: {
    id: "u_mkt",
    name: "Gianmarco",
    email: "jordan.bell@yachtway.com",
    role: "marketing",
    region: "US",
    currency: "USD",
  },
  admin: {
    id: "u_adm",
    name: "Kristi Toom",
    email: "kristi@yachtway.com",
    role: "admin",
    region: "US",
    currency: "USD",
  },
  lender_partner: {
    id: "u_lp",
    name: "Oceanline Capital",
    email: "partner@oceanlinecapital.com",
    role: "lender_partner",
    region: "US",
    currency: "USD",
    partnerId: "lp_oceanline",
  },
  insurance_partner: {
    id: "u_ip",
    name: "MasterCover Underwriters",
    email: "partner@mastercover.com",
    role: "insurance_partner",
    region: "US",
    currency: "USD",
    partnerId: "ip_mastercover",
  },
};

// Extra reps not tied to the demo-role switcher, used for scoping targets & EU coverage.
export const EXTRA_USERS: User[] = [
  {
    id: "u_rep_eu",
    name: "Sophie Laurent",
    email: "sophie.laurent@yachtway.com",
    role: "sales_rep",
    region: "US",
    currency: "USD",
  },
  {
    id: "u_rep_uk",
    name: "Oliver Whitfield",
    email: "oliver.whitfield@yachtway.com",
    role: "sales_rep",
    region: "US",
    currency: "USD",
  },
];

export const DEMO_USER_LIST: User[] = [...Object.values(DEMO_USERS), ...EXTRA_USERS];

interface AuthContextValue {
  user: User;
  setRole: (role: Role) => void;
  /** Override the display currency for the active session. */
  setCurrency: (currency: CurrencyCode) => void;
  can: (cls: ResourceClass) => boolean;
  grants: ResourceClass[];
  /** True when the session comes from a real WorkOS sign-in (no role switching). */
  isRealSession: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** A signed-in WorkOS user, passed down by the AuthKit gate. */
export interface SessionOverride {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export function AuthProvider({
  children,
  session,
}: {
  children: ReactNode;
  session?: SessionOverride | null;
}) {
  const adminCfg = useAdminConfig();
  const [role, setRoleState] = useState<Role>("sales_rep");
  const [currencyOverride, setCurrencyOverride] = useState<CurrencyCode | null>(null);

  const activeRole = session?.role ?? role;
  const base: User = session
    ? {
        id: session.id,
        name: session.name,
        email: session.email,
        role: session.role,
        region: "US",
        currency: "USD",
      }
    : DEMO_USERS[role];
  const user: User = currencyOverride
    ? {
        ...base,
        currency: currencyOverride,
        region:
          currencyOverride === "EUR" ? "EU"
          : currencyOverride === "GBP" ? "UK"
          : "US",
      }
    : base;
  // Admin console can widen/narrow access per role and per user; fall back to
  // the platform defaults when nothing has been customised.
  const grants = effectiveGrantsFor(activeRole, adminCfg, base.id) as ResourceClass[];


  const value: AuthContextValue = {
    user,
    isRealSession: Boolean(session),
    setRole: (r) => {
      // Real sessions get their role from the WorkOS token - never switchable.
      if (session) return;
      setRoleState(r);
      // Reset the override so the new role's home currency applies.
      setCurrencyOverride(null);
    },
    setCurrency: setCurrencyOverride,
    grants,
    can: (cls) => grants.includes(cls),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Hook returning a currency-aware formatter.
 *
 * `format(n, entityCurrency?)` uses:
 *  - the active user's currency (which reflects any topbar override)
 *  - falling back to the entity's own currency
 *  - falling back to USD.
 *
 * When the user has explicitly picked a display currency (region override),
 * that always wins so EU reps see everything in EUR.
 */
export function useMoney() {
  const { user } = useAuth();
  const active = user.currency;
  return {
    currency: active,
    region: user.region,
    format: (n: number, entityCurrency?: CurrencyCode) => {
      const code = active ?? entityCurrency ?? "USD";
      return new Intl.NumberFormat(
        code === "USD" ? "en-US" : code === "GBP" ? "en-GB" : "de-DE",
        { style: "currency", currency: code, maximumFractionDigits: 0 },
      ).format(n);
    },
    formatCompact: (n: number) => {
      const sym = active === "EUR" ? "€" : active === "GBP" ? "£" : "$";
      if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${sym}${(n / 1_000).toFixed(0)}k`;
      return `${sym}${Math.round(n)}`;
    },
  };
}

/** Non-hook helper for cases where we know the currency directly. */
export function REGION_TO_CURRENCY(region: Region): CurrencyCode {
  return REGION_CURRENCY[region];
}

export const ROLE_LABELS: Record<Role, string> = {
  sales_rep: "Sales Rep",
  fintech: "Fintech",
  marketing: "Marketing",
  admin: "Admin",
  lender_partner: "Lender Partner",
  insurance_partner: "Insurance Partner",
};

/** Partner (external) roles get a limited, scoped portal. */
export function isPartnerRole(role: Role): boolean {
  return role === "lender_partner" || role === "insurance_partner";
}

/**
 * FinTech customers (banks, lenders, loan applicants, loan brokers) are
 * restricted from sales reps. Marketing/admin/fintech roles all keep access.
 */
export function canSeeFinTech(role: Role): boolean {
  return role !== "sales_rep" && role !== "marketing";
}
