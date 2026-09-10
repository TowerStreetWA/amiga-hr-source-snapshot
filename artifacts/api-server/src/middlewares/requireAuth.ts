import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth } from "@clerk/express";

/**
 * Require an authenticated Clerk user for API routes.
 *
 * Mounted at `/api`, so `req.path` is router-relative. Everything is protected
 * except:
 *   - `/healthz`                  — liveness probe must stay open.
 *   - `/public/*`                 — the public job-application flow (no auth).
 *   - `/storage/public-objects/*` — public file serving (logos, etc.).
 *
 * A request without a Clerk session yields `401 {error:'unauthorized'}`.
 * `clerkMiddleware()` must run before this so `getAuth(req)` is populated.
 */
const PUBLIC_PREFIXES = ["/public/", "/storage/public-objects/"];

export function requireAuth(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    if (path === "/healthz" || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
      next();
      return;
    }
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
