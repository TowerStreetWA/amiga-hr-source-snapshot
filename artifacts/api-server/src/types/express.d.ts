// Augment Express's Request with server-resolved request context.
//
// `tenantContext` (src/middlewares/tenant.ts) sets `req.tenantId` on every
// request before the router runs. `resolveAppUser` (src/middlewares/resolveUser.ts)
// sets `req.appUser` for authenticated /api requests (it is absent on public
// and health routes, hence optional).
import "express";
import type { Role } from "../lib/roles";

declare global {
  namespace Express {
    interface AppUserContext {
      id: number;
      clerkUserId: string;
      email: string;
      role: Role;
      employeeId: number | null;
      accessExpiresAt: string | null;
    }
    interface Request {
      tenantId: string;
      appUser?: AppUserContext;
    }
  }
}

export {};
