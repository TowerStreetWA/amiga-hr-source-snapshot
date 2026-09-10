import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Coarse-grained authorization for /api routes, mounted AFTER `resolveAppUser`
 * so `req.appUser` is populated. Path checks are router-relative (mounted at
 * `/api`). Fine-grained ownership (e.g. "only your own leave") is enforced
 * inside the individual handlers — see `lib/authz.ts`.
 *
 * Rules:
 *   - admin                → full access.
 *   - manager / employee   → only the whitelisted (method, path) pairs below;
 *                            handlers then scope the data to the caller.
 *   - linked is required    for everything except `GET /me` (so an unlinked
 *                            user can still render the "no access yet" screen).
 */
const PUBLIC_PREFIXES = ["/public/", "/storage/public-objects/"];

function isPublicPath(path: string): boolean {
  return path === "/healthz" || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

// Endpoints non-admin (manager + employee) roles may reach. Handlers enforce
// per-row ownership and role-specific behaviour on top of this. An optional
// `roles` list narrows a rule to specific non-admin roles (omit = both manager
// and employee). Sickness, team pay reads, and candidates are manager-only —
// employees have no self-service screen for those.
type AllowRule = {
  method: string;
  re: RegExp;
  roles?: ("manager" | "employee")[];
};

const NON_ADMIN_ALLOWLIST: AllowRule[] = [
  { method: "GET", re: /^\/me$/ },
  { method: "GET", re: /^\/leave$/ },
  { method: "GET", re: /^\/leave\/calendar$/ },
  { method: "GET", re: /^\/leave\/employees\/\d+\/requests$/ },
  { method: "GET", re: /^\/leave\/employees\/\d+\/entitlements$/ },
  { method: "POST", re: /^\/leave\/employees\/\d+\/requests$/ },
  { method: "PATCH", re: /^\/leave-requests\/\d+$/ },
  // Manager-only: list direct reports (team pay roster). Scoped in the handler.
  { method: "GET", re: /^\/employees$/, roles: ["manager"] },
  { method: "GET", re: /^\/employees\/\d+$/ },
  { method: "PATCH", re: /^\/employees\/\d+$/ },
  { method: "GET", re: /^\/employees\/\d+\/salary-history$/ },
  { method: "GET", re: /^\/employees\/\d+\/documents$/ },
  { method: "GET", re: /^\/employees\/\d+\/benefits$/ },
  { method: "GET", re: /^\/employees\/\d+\/total-reward$/ },
  // Manager-only: team sickness oversight.
  { method: "GET", re: /^\/sickness$/, roles: ["manager"] },
  { method: "GET", re: /^\/sickness\/employees\/\d+$/, roles: ["manager"] },
  // Manager-only: candidates on the roles they own.
  { method: "GET", re: /^\/candidates$/, roles: ["manager"] },
  { method: "GET", re: /^\/candidates\/\d+$/, roles: ["manager"] },
];

export function authorize(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isPublicPath(req.path)) {
      next();
      return;
    }
    const user = req.appUser;
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (
      user.accessExpiresAt !== null &&
      new Date(user.accessExpiresAt).getTime() <= Date.now()
    ) {
      res.status(403).json({
        error: "trial_expired",
        message: "This trial account has expired.",
      });
      return;
    }
    if (user.role === "admin") {
      next();
      return;
    }

    const method = req.method.toUpperCase();
    const path = req.path;

    // Unlinked non-admins can only reach /me (to render "no access yet").
    if (user.employeeId === null) {
      if (method === "GET" && /^\/me$/.test(path)) {
        next();
        return;
      }
      res.status(403).json({
        error: "no_access",
        message: "Your account is not yet linked to an employee record.",
      });
      return;
    }

    const allowed = NON_ADMIN_ALLOWLIST.some(
      (rule) =>
        rule.method === method &&
        rule.re.test(path) &&
        (rule.roles === undefined ||
          rule.roles.includes(user.role as "manager" | "employee")),
    );
    if (!allowed) {
      res.status(403).json({
        error: "forbidden",
        message: "You do not have access to this resource",
      });
      return;
    }
    next();
  };
}
