import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  CreateLeaveRequestBody,
  UpdateLeaveRequestBody,
  UpsertEmployeeLeaveEntitlementBody as UpsertLeaveEntitlementBody,
  SeedEmployeeLeaveDefaultsBody as SeedLeaveDefaultsBody,
} from "@workspace/api-zod";
import {
  db,
  employeesTable,
  leaveEntitlementsTable,
  leaveRequestsTable,
  sicknessAbsencesTable,
} from "@workspace/db";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
import { logActivity } from "../lib/activity";
import { forbidden, isDirectReport } from "../lib/authz";
import { inArray } from "drizzle-orm";
import {
  sendLeaveDecisionNotification,
  sendLeaveRequestNotification,
} from "../lib/email";

async function notifyHrLeaveRequest(args: {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
}) {
  const hrEmail = process.env.HR_NOTIFICATION_EMAIL?.trim();
  if (!hrEmail) return;
  await sendLeaveRequestNotification({ to: hrEmail, ...args });
}
import {
  DEFAULT_LEAVE_ENTITLEMENT_DAYS,
  LEAVE_TYPES,
  SEEDABLE_LEAVE_TYPES,
  type LeaveType,
} from "../lib/leaveDefaults";
import { countWorkingDays, countWorkingDaysInYear, todayIsoDate } from "../lib/workingDays";

const router: IRouter = Router();

type EntitlementRow = typeof leaveEntitlementsTable.$inferSelect;
type RequestRow = typeof leaveRequestsTable.$inferSelect;

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

function serializeEntitlement(row: EntitlementRow) {
  const entitled = num(row.entitledDays);
  const carried = num(row.carriedOverDays);
  const used = num(row.usedDays);
  return {
    id: row.id,
    employeeId: row.employeeId,
    year: row.year,
    leaveType: row.leaveType,
    entitledDays: entitled,
    carriedOverDays: carried,
    usedDays: used,
    remainingDays: Math.max(0, entitled + carried - used),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRequest(row: RequestRow) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    leaveType: row.leaveType,
    startDate: row.startDate,
    endDate: row.endDate,
    workingDays: num(row.workingDays),
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewerNote: row.reviewerNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isLeaveType(s: string): s is LeaveType {
  return (LEAVE_TYPES as readonly string[]).includes(s);
}

async function recalcUsedDays(
  tx: Tx,
  employeeId: number,
  leaveType: string,
  year: number,
  tenantId: string,
) {
  // Allocate by actual day overlap with the calendar year so that cross-year
  // requests are split between the two entitlement buckets correctly.
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const overlapping = await tx
    .select({
      startDate: leaveRequestsTable.startDate,
      endDate: leaveRequestsTable.endDate,
    })
    .from(leaveRequestsTable)
    .where(
      and(
        eq(leaveRequestsTable.employeeId, employeeId),
        eq(leaveRequestsTable.leaveType, leaveType),
        eq(leaveRequestsTable.status, "approved"),
        lte(leaveRequestsTable.startDate, yearEnd),
        gte(leaveRequestsTable.endDate, yearStart),
      ),
    );

  let total = 0;
  for (const r of overlapping) {
    total += countWorkingDaysInYear(r.startDate, r.endDate, year);
  }
  const used = String(total);

  await tx
    .insert(leaveEntitlementsTable)
    .values({
      tenantId,
      employeeId,
      year,
      leaveType,
      entitledDays: "0",
      carriedOverDays: "0",
      usedDays: used,
    })
    .onConflictDoUpdate({
      target: [
        leaveEntitlementsTable.tenantId,
        leaveEntitlementsTable.employeeId,
        leaveEntitlementsTable.year,
        leaveEntitlementsTable.leaveType,
      ],
      set: { usedDays: used, updatedAt: new Date() },
    });
}

router.get("/leave", async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const leaveType =
    typeof req.query.leaveType === "string" ? req.query.leaveType : undefined;
  const conditions = [];
  if (status && status !== "all")
    conditions.push(eq(leaveRequestsTable.status, status));
  if (leaveType && leaveType !== "all")
    conditions.push(eq(leaveRequestsTable.leaveType, leaveType));

  // Role scoping: admins see all; managers see their team + themselves;
  // employees see only their own requests.
  const user = req.appUser;
  if (user && user.role !== "admin") {
    if (user.employeeId === null) {
      res.json([]);
      return;
    }
    if (user.role === "manager") {
      const reports = await db
        .select({ id: employeesTable.id })
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.tenantId, req.tenantId),
            eq(employeesTable.managerId, user.employeeId),
          ),
        );
      const visibleIds = [user.employeeId, ...reports.map((r) => r.id)];
      conditions.push(inArray(leaveRequestsTable.employeeId, visibleIds));
    } else {
      conditions.push(eq(leaveRequestsTable.employeeId, user.employeeId));
    }
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({ request: leaveRequestsTable, employee: employeesTable })
    .from(leaveRequestsTable)
    .innerJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
    .where(where)
    .orderBy(desc(leaveRequestsTable.startDate));

  res.json(
    rows.map((r) => ({
      ...serializeRequest(r.request),
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      employeeNumber: r.employee.employeeNumber,
      department: r.employee.department,
      jobTitle: r.employee.jobTitle,
    })),
  );
});

router.get("/leave/calendar", async (req: Request, res: Response) => {
  const today = todayIsoDate();
  const from = typeof req.query.from === "string" ? req.query.from : today;
  const toParam = typeof req.query.to === "string" ? req.query.to : null;
  let to = toParam;
  if (!to) {
    const d = new Date(from + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + 60);
    to = d.toISOString().slice(0, 10);
  }

  const rows = await db
    .select({ request: leaveRequestsTable, employee: employeesTable })
    .from(leaveRequestsTable)
    .innerJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
    .where(
      and(
        eq(leaveRequestsTable.status, "approved"),
        lte(leaveRequestsTable.startDate, to),
        gte(leaveRequestsTable.endDate, from),
      ),
    )
    .orderBy(asc(leaveRequestsTable.startDate));

  res.json(
    rows.map((r) => ({
      id: r.request.id,
      employeeId: r.request.employeeId,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      leaveType: r.request.leaveType,
      startDate: r.request.startDate,
      endDate: r.request.endDate,
    })),
  );
});

router.get("/leave/stats", async (_req: Request, res: Response) => {
  const today = todayIsoDate();

  const [pendingRow] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(leaveRequestsTable)
    .where(eq(leaveRequestsTable.status, "pending"));

  const offTodayRows = await db
    .select({ employee: employeesTable, request: leaveRequestsTable })
    .from(leaveRequestsTable)
    .innerJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
    .where(
      and(
        eq(leaveRequestsTable.status, "approved"),
        lte(leaveRequestsTable.startDate, today),
        gte(leaveRequestsTable.endDate, today),
      ),
    );

  const offSickTodayRows = await db
    .select({ employee: employeesTable, absence: sicknessAbsencesTable })
    .from(sicknessAbsencesTable)
    .innerJoin(employeesTable, eq(sicknessAbsencesTable.employeeId, employeesTable.id))
    .where(
      and(
        lte(sicknessAbsencesTable.startDate, today),
        sql`(${sicknessAbsencesTable.endDate} IS NULL OR ${sicknessAbsencesTable.endDate} >= ${today})`,
      ),
    );

  res.json({
    pendingRequests: pendingRow?.c ?? 0,
    offTodayCount: offTodayRows.length,
    offSickTodayCount: offSickTodayRows.length,
    offTodayNames: offTodayRows.map(
      (r) => `${r.employee.firstName} ${r.employee.lastName}`,
    ),
    offSickTodayNames: offSickTodayRows.map(
      (r) => `${r.employee.firstName} ${r.employee.lastName}`,
    ),
  });
});

router.get("/leave/employees/:id/entitlements", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = req.appUser;
  if (user && user.role !== "admin" && user.employeeId !== id) {
    forbidden(res);
    return;
  }
  const yearParam = typeof req.query.year === "string" ? Number(req.query.year) : NaN;
  const year = Number.isFinite(yearParam) ? yearParam : new Date().getUTCFullYear();
  const rows = await db
    .select()
    .from(leaveEntitlementsTable)
    .where(
      and(
        eq(leaveEntitlementsTable.employeeId, id),
        eq(leaveEntitlementsTable.year, year),
      ),
    )
    .orderBy(asc(leaveEntitlementsTable.leaveType));
  res.json(rows.map(serializeEntitlement));
});

router.put(
  "/leave/employees/:id/entitlements/:leaveType",
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const leaveType = String(req.params.leaveType ?? "");
    if (!Number.isFinite(id) || !isLeaveType(leaveType)) {
      res.status(400).json({ error: "Invalid id or leave type" });
      return;
    }
    const parsed = UpsertLeaveEntitlementBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid entitlement", details: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, id));
    if (!emp) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      await tx
        .insert(leaveEntitlementsTable)
        .values({
          tenantId: req.tenantId,
          employeeId: id,
          year: data.year,
          leaveType,
          entitledDays: String(data.entitledDays),
          carriedOverDays:
            data.carriedOverDays !== undefined && data.carriedOverDays !== null
              ? String(data.carriedOverDays)
              : "0",
          usedDays: "0",
        })
        .onConflictDoUpdate({
          target: [
            leaveEntitlementsTable.tenantId,
            leaveEntitlementsTable.employeeId,
            leaveEntitlementsTable.year,
            leaveEntitlementsTable.leaveType,
          ],
          set: {
            entitledDays: String(data.entitledDays),
            carriedOverDays:
              data.carriedOverDays !== undefined && data.carriedOverDays !== null
                ? String(data.carriedOverDays)
                : "0",
            updatedAt: new Date(),
          },
        });
      await recalcUsedDays(tx, id, leaveType, data.year, req.tenantId);
      const [row] = await tx
        .select()
        .from(leaveEntitlementsTable)
        .where(
          and(
            eq(leaveEntitlementsTable.employeeId, id),
            eq(leaveEntitlementsTable.year, data.year),
            eq(leaveEntitlementsTable.leaveType, leaveType),
          ),
        );
      return row;
    });

    res.json(serializeEntitlement(updated));
  },
);

router.post(
  "/leave/employees/:id/seed-defaults",
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = SeedLeaveDefaultsBody.safeParse(req.body ?? {});
    const year =
      parsed.success && parsed.data.year ? parsed.data.year : new Date().getUTCFullYear();
    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, id));
    if (!emp) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    const rows = await db.transaction(async (tx) => {
      for (const lt of SEEDABLE_LEAVE_TYPES) {
        await tx
          .insert(leaveEntitlementsTable)
          .values({
            tenantId: req.tenantId,
            employeeId: id,
            year,
            leaveType: lt,
            entitledDays: String(DEFAULT_LEAVE_ENTITLEMENT_DAYS[lt]),
            carriedOverDays: "0",
            usedDays: "0",
          })
          .onConflictDoNothing({
            target: [
              leaveEntitlementsTable.tenantId,
              leaveEntitlementsTable.employeeId,
              leaveEntitlementsTable.year,
              leaveEntitlementsTable.leaveType,
            ],
          });
        await recalcUsedDays(tx, id, lt, year, req.tenantId);
      }
      return tx
        .select()
        .from(leaveEntitlementsTable)
        .where(
          and(
            eq(leaveEntitlementsTable.employeeId, id),
            eq(leaveEntitlementsTable.year, year),
          ),
        )
        .orderBy(asc(leaveEntitlementsTable.leaveType));
    });

    res.json(rows.map(serializeEntitlement));
  },
);

router.get(
  "/leave/employees/:id/requests",
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const user = req.appUser;
    if (user && user.role !== "admin" && user.employeeId !== id) {
      forbidden(res);
      return;
    }
    const rows = await db
      .select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.employeeId, id))
      .orderBy(desc(leaveRequestsTable.startDate));
    res.json(rows.map(serializeRequest));
  },
);

router.post(
  "/leave/employees/:id/requests",
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const user = req.appUser;
    if (user && user.role !== "admin" && user.employeeId !== id) {
      forbidden(res);
      return;
    }
    const parsed = CreateLeaveRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid leave request", details: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    if (data.endDate < data.startDate) {
      res.status(400).json({ error: "End date must be on or after start date" });
      return;
    }
    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, id));
    if (!emp) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }
    const workingDays = countWorkingDays(data.startDate, data.endDate);

    const [created] = await db
      .insert(leaveRequestsTable)
      .values({
        tenantId: req.tenantId,
        employeeId: id,
        leaveType: data.leaveType,
        startDate: data.startDate,
        endDate: data.endDate,
        workingDays: String(workingDays),
        reason: data.reason ?? null,
        status: "pending",
      })
      .returning();
    await logActivity(
      "leave_requested",
      "employee",
      id,
      `Leave request: ${data.leaveType} ${data.startDate} → ${data.endDate} (${workingDays} days)`,
      "Admin",
      req.tenantId,
    );
    // Notify HR (best-effort)
    void notifyHrLeaveRequest({
      employeeName: `${emp.firstName} ${emp.lastName}`,
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
      days: workingDays,
      reason: data.reason ?? null,
    }).catch((err) => req.log.error({ err }, "leave request email failed"));
    res.status(201).json(serializeRequest(created));
  },
);

router.patch("/leave-requests/:requestId", async (req: Request, res: Response) => {
  const requestId = Number(req.params.requestId);
  if (!Number.isFinite(requestId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateLeaveRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid update", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  // Role-based authorization before mutating:
  //   - admin    → any change.
  //   - own request (manager OR employee) → may only cancel it (never
  //     self-approve, never edit dates/type/reason via this endpoint).
  //   - manager on a direct report's request → may only decide
  //     (approve / decline + reviewer note); no edits to the request itself.
  //   - anyone else → forbidden.
  const user = req.appUser;
  if (user && user.role !== "admin") {
    const [target] = await db
      .select({
        employeeId: leaveRequestsTable.employeeId,
        status: leaveRequestsTable.status,
      })
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.id, requestId));
    if (!target) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (user.employeeId === null) {
      forbidden(res);
      return;
    }

    const touchesRequestFields =
      data.startDate !== undefined ||
      data.endDate !== undefined ||
      data.leaveType !== undefined ||
      data.reason !== undefined;

    if (target.employeeId === user.employeeId) {
      // Own request: self-service cancel only — no self-approval, no edits.
      const cancelOnly =
        data.status === "cancelled" &&
        !touchesRequestFields &&
        data.reviewedBy === undefined &&
        data.reviewerNote === undefined;
      if (!cancelOnly) {
        forbidden(res, "You can only cancel your own leave requests");
        return;
      }
      // ...and only while it is still pending (an already-decided request can't
      // be self-cancelled).
      if (target.status !== "pending") {
        forbidden(res, "You can only cancel a leave request while it is pending");
        return;
      }
    } else if (user.role === "manager") {
      const ok = await isDirectReport(req.tenantId, user.employeeId, target.employeeId);
      if (!ok) {
        forbidden(res, "You can only manage leave for your own team");
        return;
      }
      // Managers may only make a decision, not edit the request.
      const decisionOnly =
        (data.status === "approved" || data.status === "declined") &&
        !touchesRequestFields;
      if (!decisionOnly) {
        forbidden(res, "Managers can only approve or decline team leave requests");
        return;
      }
    } else {
      // Employee acting on someone else's request.
      forbidden(res);
      return;
    }
  }

  let updated: { row: typeof leaveRequestsTable.$inferSelect; existing: typeof leaveRequestsTable.$inferSelect } | null;
  try {
    updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.id, requestId));
    if (!existing) return null;

    const updates: Partial<typeof leaveRequestsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    let datesChanged = false;
    let newStart = existing.startDate;
    let newEnd = existing.endDate;
    let newType = existing.leaveType;
    if (data.startDate !== undefined) {
      newStart = data.startDate;
      datesChanged = true;
    }
    if (data.endDate !== undefined) {
      newEnd = data.endDate;
      datesChanged = true;
    }
    if (data.leaveType !== undefined) {
      newType = data.leaveType;
    }
    if (datesChanged) {
      if (newEnd < newStart) {
        throw new Error("BAD_DATES");
      }
      updates.startDate = newStart;
      updates.endDate = newEnd;
      updates.workingDays = String(countWorkingDays(newStart, newEnd));
    }
    if (data.leaveType !== undefined) updates.leaveType = data.leaveType;
    if (data.reason !== undefined) updates.reason = data.reason;
    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === "approved" || data.status === "declined") {
        updates.reviewedAt = new Date();
        updates.reviewedBy = data.reviewedBy ?? "Admin";
      }
    }
    if (data.reviewerNote !== undefined) updates.reviewerNote = data.reviewerNote;

    const [row] = await tx
      .update(leaveRequestsTable)
      .set(updates)
      .where(eq(leaveRequestsTable.id, requestId))
      .returning();

    // Recalculate usedDays for every (leaveType, year) bucket touched by the
    // old or new request range — including any years a cross-year span covers.
    const buckets = new Set<string>();
    const addYears = (lt: string, start: string, end: string) => {
      const ys = Number(start.slice(0, 4));
      const ye = Number(end.slice(0, 4));
      for (let y = ys; y <= ye; y++) buckets.add(`${lt}|${y}`);
    };
    addYears(existing.leaveType, existing.startDate, existing.endDate);
    addYears(newType, newStart, newEnd);
    for (const b of buckets) {
      const [lt, yr] = b.split("|");
      await recalcUsedDays(tx, existing.employeeId, lt, Number(yr), req.tenantId);
    }

    return { row, existing };
  });
  } catch (err) {
    if (err instanceof Error && err.message === "BAD_DATES") {
      res.status(400).json({ error: "End date must be on or after start date" });
      return;
    }
    throw err;
  }

  if (!updated) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (data.status === "approved" || data.status === "declined") {
    await logActivity(
      data.status === "approved" ? "leave_approved" : "leave_declined",
      "employee",
      updated.row.employeeId,
      `Leave ${data.status}: ${updated.row.leaveType} ${updated.row.startDate} → ${updated.row.endDate}`,
      "Admin",
      req.tenantId,
    );
    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, updated.row.employeeId));
    if (emp?.email) {
      void sendLeaveDecisionNotification({
        to: emp.email,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        leaveType: updated.row.leaveType,
        startDate: updated.row.startDate,
        endDate: updated.row.endDate,
        decision: data.status,
        reviewerName: data.reviewedBy ?? "Admin",
        comments: data.reviewerNote ?? null,
      }).catch((err) => req.log.error({ err }, "leave decision email failed"));
    }
  }
  res.json(serializeRequest(updated.row));
});

router.delete("/leave-requests/:requestId", async (req: Request, res: Response) => {
  const requestId = Number(req.params.requestId);
  if (!Number.isFinite(requestId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const removed = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.id, requestId));
    if (!existing) return null;
    await tx
      .delete(leaveRequestsTable)
      .where(eq(leaveRequestsTable.id, requestId));
    const ys = Number(existing.startDate.slice(0, 4));
    const ye = Number(existing.endDate.slice(0, 4));
    for (let y = ys; y <= ye; y++) {
      await recalcUsedDays(tx, existing.employeeId, existing.leaveType, y, req.tenantId);
    }
    return existing;
  });
  if (!removed) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  res.status(204).end();
});

export default router;
