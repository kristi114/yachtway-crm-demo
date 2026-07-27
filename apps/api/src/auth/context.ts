import type { NextFunction, RequestHandler, Request, Response } from "express";
import { type Role, RoleSchema } from "@yachtway/shared";
import { env } from "../env.js";
import { workosAuthContext } from "./workos.js";

export interface AuthContext {
  userId: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * DEV-ONLY auth shim. Resolves an AuthContext from request headers so the whole
 * permission stack (authorize + RLS + /me) works end-to-end before the WorkOS
 * JWT integration lands. Replace this with real token verification — the seam
 * (populating req.auth) stays identical.
 *
 *   x-crm-role:    SALES_REP | FINTECH | MARKETING | ADMIN   (required)
 *   x-crm-user-id: <user id>                                 (optional)
 */
export function devAuthContext(req: Request, res: Response, next: NextFunction): void {
  const parsed = RoleSchema.safeParse(req.header("x-crm-role"));
  if (!parsed.success) {
    res.status(401).json({ error: "unauthenticated: missing or invalid x-crm-role (dev shim)" });
    return;
  }
  req.auth = {
    userId: req.header("x-crm-user-id") ?? `dev_${parsed.data.toLowerCase()}`,
    role: parsed.data,
  };
  next();
}

/**
 * The auth seam the routers actually use. Selected once by AUTH_MODE:
 * "workos" verifies real JWTs (production), "dev" (default) uses the header
 * shim for local dev + integration tests. Either way it populates req.auth.
 */
export const authContext: RequestHandler =
  env.AUTH_MODE === "workos" ? workosAuthContext : devAuthContext;
