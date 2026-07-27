import type { NextFunction, Request, Response } from "express";
import { type Action, can, type ResourceClass } from "@yachtway/shared";
import { loadEffectivePermissions } from "./service.js";

/**
 * Express middleware: allow the request only if the authenticated role holds
 * (resource, action). This is the UX/API gate; Postgres RLS is the backstop, so
 * a missed authorize() still cannot leak data. Deny is default (401 without a
 * role, 403 without the grant).
 */
export function authorize(resource: ResourceClass, action: Action) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    try {
      const perms = await loadEffectivePermissions(req.auth.userId, req.auth.role);
      if (!can(perms, resource, action)) {
        res.status(403).json({
          error: `forbidden: ${req.auth.role} lacks ${action} on ${resource}`,
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Like authorize(), but passes when the role holds `action` on ANY of the listed
 * resource classes. Used where one endpoint spans classes a single role may hold
 * disjointly — e.g. conversations: a rep has conversations.general, Fintech has
 * conversations.financing, and neither holds both. Row-level RLS still decides
 * which rows each caller actually sees.
 */
export function authorizeAny(resources: ResourceClass[], action: Action) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    try {
      const perms = await loadEffectivePermissions(req.auth.userId, req.auth.role);
      if (!resources.some((r) => can(perms, r, action))) {
        res.status(403).json({
          error: `forbidden: ${req.auth.role} lacks ${action} on ${resources.join(" | ")}`,
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
