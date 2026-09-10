/**
 * In-app roles. Replit-managed Clerk has no Organizations/roles, so role lives
 * in our own `app_users` table and is resolved server-side per request.
 *
 *   - admin    — full access to every screen and API (default HR admin).
 *   - manager  — self-service + approve/decline leave for their direct reports.
 *   - employee — self-service only (own leave, read-only own profile/pay/benefits).
 */
export const ROLES = ["admin", "manager", "employee"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
