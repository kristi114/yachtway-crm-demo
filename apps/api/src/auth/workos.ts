import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { type Role, RoleSchema } from "@yachtway/shared";
import { env } from "../env.js";

/**
 * Production auth: verify a WorkOS AuthKit access token (Bearer JWT) against
 * WorkOS's JWKS, then resolve the CRM role from the token's `role` claim. This
 * populates the exact same `req.auth` seam the dev shim fills, so authorize +
 * withRole + RLS are unchanged. Enable with AUTH_MODE=workos.
 */
const jwksUrl =
  env.WORKOS_JWKS_URL ??
  (env.WORKOS_CLIENT_ID ? `https://api.workos.com/sso/jwks/${env.WORKOS_CLIENT_ID}` : undefined);

// Built lazily and only when configured — no network at import time.
const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;

/**
 * Map WorkOS organization-role slugs to CRM roles. A slug that already matches a
 * CRM role key passes straight through; extend this as WorkOS roles are named.
 */
const ROLE_MAP: Record<string, Role> = {
  admin: "ADMIN",
  sales_rep: "SALES_REP",
  fintech: "FINTECH",
  marketing: "MARKETING",
};

function toRole(claim: unknown): Role | null {
  if (typeof claim !== "string") return null;
  const direct = RoleSchema.safeParse(claim);
  if (direct.success) return direct.data;
  return ROLE_MAP[claim.toLowerCase()] ?? null;
}

export async function workosAuthContext(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!jwks) {
    res.status(500).json({ error: "auth_not_configured: set WORKOS_CLIENT_ID or WORKOS_JWKS_URL" });
    return;
  }
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "unauthenticated: missing bearer token" });
    return;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      ...(env.WORKOS_ISSUER ? { issuer: env.WORKOS_ISSUER } : {}),
    });
    const role = toRole((payload as Record<string, unknown>).role);
    if (!role) {
      res.status(403).json({ error: "no CRM role on token" });
      return;
    }
    req.auth = { userId: String(payload.sub ?? ""), role };
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
