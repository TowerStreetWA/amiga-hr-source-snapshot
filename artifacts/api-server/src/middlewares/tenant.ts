import type { Request, Response, NextFunction, RequestHandler } from "express";
import { DEFAULT_TENANT_ID } from "@workspace/db";

/**
 * Resolve the active tenant for a request and stash it on `req.tenantId`.
 *
 * This deployment is single-tenant: every request is attributed to the seeded
 * Amiga tenant via {@link DEFAULT_TENANT_ID}. Authentication (proving *who* the
 * caller is) is handled separately by Clerk + `requireAuth`; tenant identity is
 * fixed here.
 *
 * Multi-tenant resolution — mapping a Clerk identity to a specific tenant row —
 * is future work. Replit-managed Clerk has no Organizations, so the previous
 * org→tenant mapping is not viable today; a membership model will be needed
 * before this can vary per request.
 */
export function tenantContext(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.tenantId = DEFAULT_TENANT_ID;
    next();
  };
}
