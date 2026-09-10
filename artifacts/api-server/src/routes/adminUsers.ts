import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, appUsersTable, employeesTable } from "@workspace/db";
import { UpdateAppUserBody } from "@workspace/api-zod";
import { isRole } from "../lib/roles";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

// All routes here are admin-only — the `authorize` middleware rejects non-admin
// callers before they reach this router (no /admin path is whitelisted).

// GET /admin/users — list app users with their linked employee, if any.
router.get("/admin/users", async (req: Request, res: Response) => {
  const rows = await db
    .select({ user: appUsersTable, employee: employeesTable })
    .from(appUsersTable)
    .leftJoin(
      employeesTable,
      and(
        eq(appUsersTable.tenantId, employeesTable.tenantId),
        eq(appUsersTable.employeeId, employeesTable.id),
      ),
    )
    .where(eq(appUsersTable.tenantId, req.tenantId))
    .orderBy(asc(appUsersTable.email));

  res.json(
    rows.map((r) => ({
      id: r.user.id,
      clerkUserId: r.user.clerkUserId,
      email: r.user.email,
      role: r.user.role,
      employeeId: r.user.employeeId,
      employeeName: r.employee
        ? `${r.employee.firstName} ${r.employee.lastName}`
        : null,
      employeeNumber: r.employee?.employeeNumber ?? null,
      createdAt: r.user.createdAt.toISOString(),
      updatedAt: r.user.updatedAt.toISOString(),
    })),
  );
});

// PATCH /admin/users/:id — change a user's role and/or linked employee.
router.patch("/admin/users/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateAppUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid update", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  if (data.role !== undefined && !isRole(data.role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  const [target] = await db
    .select()
    .from(appUsersTable)
    .where(
      and(eq(appUsersTable.tenantId, req.tenantId), eq(appUsersTable.id, id)),
    );
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Guard: never demote the last remaining admin.
  if (data.role !== undefined && target.role === "admin" && data.role !== "admin") {
    const [other] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(appUsersTable)
      .where(
        and(
          eq(appUsersTable.tenantId, req.tenantId),
          eq(appUsersTable.role, "admin"),
          ne(appUsersTable.id, id),
        ),
      );
    if ((other?.c ?? 0) === 0) {
      res.status(400).json({ error: "Cannot remove the last administrator" });
      return;
    }
  }

  // Validate employee link (if provided) belongs to this tenant.
  if (data.employeeId !== undefined && data.employeeId !== null) {
    const [emp] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.tenantId, req.tenantId),
          eq(employeesTable.id, data.employeeId),
        ),
      );
    if (!emp) {
      res.status(400).json({ error: "Linked employee not found" });
      return;
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.role !== undefined) updates.role = data.role;
  if (data.employeeId !== undefined) updates.employeeId = data.employeeId;

  const [updated] = await db
    .update(appUsersTable)
    .set(updates)
    .where(
      and(eq(appUsersTable.tenantId, req.tenantId), eq(appUsersTable.id, id)),
    )
    .returning();

  await logActivity(
    "update",
    "app_user",
    updated.id,
    `Updated access for ${updated.email} (role: ${updated.role})`,
    req.appUser?.email ?? "Admin",
    req.tenantId,
  );

  res.json({
    id: updated.id,
    clerkUserId: updated.clerkUserId,
    email: updated.email,
    role: updated.role,
    employeeId: updated.employeeId,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

export default router;
