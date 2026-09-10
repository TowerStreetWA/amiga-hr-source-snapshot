import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, eq, ilike, sql } from "drizzle-orm";
import {
  db,
  appUsersTable,
  employeesTable,
  pendingAppAccessInvitesTable,
} from "@workspace/db";
import type { Role } from "../lib/roles";
import { isRole } from "../lib/roles";

/**
 * Resolve the in-app user (role + linked employee) for an authenticated
 * request and stash it on `req.appUser`.
 *
 * Mounted at `/api` AFTER `requireAuth`, so its path checks are router-relative
 * and every non-public request already has a Clerk `userId`.
 *
 * On a user's first ever request we bootstrap an `app_users` row:
 *   - role = `admin` if no admin exists in the tenant yet, otherwise `employee`;
 *   - `employeeId` linked by matching the Clerk email to an `employees.email`
 *     (case-insensitive); left null when there is no match ("no access yet").
 * The bootstrap runs inside a transaction that locks `app_users` so two
 * simultaneous first sign-ins cannot both become admin or double-insert.
 */
const PUBLIC_PREFIXES = ["/public/", "/storage/public-objects/"];

function isPublicPath(path: string): boolean {
  return path === "/healthz" || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

function primaryEmail(user: {
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
}): string | null {
  const primary = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  );
  return (primary ?? user.emailAddresses[0])?.emailAddress ?? null;
}

function metadataAccessGrant(metadata: Record<string, unknown>): {
  role: Role;
  accessExpiresAt: Date | null;
} | null {
  if (metadata.access_type !== "trial_admin") return null;

  const rawExpiry = metadata.access_expires_at;
  if (typeof rawExpiry !== "string") return null;

  const accessExpiresAt = new Date(rawExpiry);
  if (Number.isNaN(accessExpiresAt.getTime())) return null;

  return { role: "admin", accessExpiresAt };
}

export function resolveAppUser(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isPublicPath(req.path)) {
      next();
      return;
    }
    const { userId } = getAuth(req);
    if (!userId) {
      // requireAuth should have already rejected; defensive fallback.
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const tenantId = req.tenantId;

    try {
      const [existing] = await db
        .select()
        .from(appUsersTable)
        .where(
          and(
            eq(appUsersTable.tenantId, tenantId),
            eq(appUsersTable.clerkUserId, userId),
          ),
        );

      if (existing) {
        req.appUser = {
          id: existing.id,
          clerkUserId: existing.clerkUserId,
          email: existing.email,
          role: isRole(existing.role) ? existing.role : "employee",
          employeeId: existing.employeeId,
          accessExpiresAt: existing.accessExpiresAt?.toISOString() ?? null,
        };
        next();
        return;
      }

      // First sign-in for this Clerk user — bootstrap a row.
      const clerkUser = await clerkClient.users.getUser(userId);
      const email = primaryEmail(clerkUser);
      const clerkGrant = metadataAccessGrant(clerkUser.publicMetadata);

      const created = await db.transaction(async (tx) => {
        await tx.execute(sql`LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE`);

        const [again] = await tx
          .select()
          .from(appUsersTable)
          .where(
            and(
              eq(appUsersTable.tenantId, tenantId),
              eq(appUsersTable.clerkUserId, userId),
            ),
          );
        if (again) return again;

        const [pendingInvite] = email
          ? await tx
              .select()
              .from(pendingAppAccessInvitesTable)
              .where(
                and(
                  eq(pendingAppAccessInvitesTable.tenantId, tenantId),
                  eq(pendingAppAccessInvitesTable.email, email.toLowerCase()),
                ),
              )
              .limit(1)
          : [];

        const [adminCount] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(appUsersTable)
          .where(
            and(
              eq(appUsersTable.tenantId, tenantId),
              eq(appUsersTable.role, "admin"),
            ),
          );
        const role: Role = clerkGrant
          ? clerkGrant.role
          : pendingInvite
          ? (isRole(pendingInvite.role) ? pendingInvite.role : "employee")
          : (adminCount?.c ?? 0) === 0 ? "admin" : "employee";

        let employeeId: number | null = null;
        if (email) {
          const [match] = await tx
            .select({ id: employeesTable.id })
            .from(employeesTable)
            .where(
              and(
                eq(employeesTable.tenantId, tenantId),
                ilike(employeesTable.email, email),
              ),
            );
          employeeId = match?.id ?? null;
        }

        const [row] = await tx
          .insert(appUsersTable)
          .values({
            tenantId,
            clerkUserId: userId,
            email: email ?? "",
            role,
            employeeId,
            accessExpiresAt:
              clerkGrant?.accessExpiresAt ??
              pendingInvite?.accessExpiresAt ??
              null,
          })
          .returning();
        if (pendingInvite) {
          await tx
            .update(pendingAppAccessInvitesTable)
            .set({ claimedAt: new Date() })
            .where(eq(pendingAppAccessInvitesTable.id, pendingInvite.id));
        }
        return row;
      });

      req.appUser = {
        id: created.id,
        clerkUserId: created.clerkUserId,
        email: created.email,
        role: isRole(created.role) ? created.role : "employee",
        employeeId: created.employeeId,
        accessExpiresAt: created.accessExpiresAt?.toISOString() ?? null,
      };
      next();
    } catch (err) {
      req.log.error({ err }, "Failed to resolve app user");
      res.status(503).json({ error: "user_resolution_failed" });
    }
  };
}
