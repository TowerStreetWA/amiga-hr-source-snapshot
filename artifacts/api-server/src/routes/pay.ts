import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import {
  ApplyBulkReviewBody,
} from "@workspace/api-zod";
import {
  db,
  employeesTable,
  salaryChangesTable,
} from "@workspace/db";
import { logActivity } from "../lib/activity";
import { SALARY_BANDS } from "../lib/salaryBands";

const router: IRouter = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const REVIEW_DUE_MONTHS = 11;

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

function monthsBetween(fromIso: string, toDate: Date = new Date()): number {
  const from = new Date(fromIso + "T00:00:00.000Z");
  const months =
    (toDate.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (toDate.getUTCMonth() - from.getUTCMonth());
  return Math.max(0, months);
}

async function dueForReviewIds(): Promise<Set<number>> {
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - REVIEW_DUE_MONTHS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  // employees whose latest effective_date is at or before the cutoff (or have none).
  // Only consider currently-employed staff (active or on_leave); exclude terminated.
  const rows = await db.execute<{ employee_id: number }>(sql`
    SELECT e.id AS employee_id
    FROM ${employeesTable} e
    WHERE e.salary IS NOT NULL
      AND e.status IN ('active', 'on_leave')
      AND COALESCE(
        (SELECT MAX(${salaryChangesTable.effectiveDate})
         FROM ${salaryChangesTable}
         WHERE ${salaryChangesTable.employeeId} = e.id),
        '1900-01-01'
      ) <= ${cutoffIso}
  `);
  // drizzle-orm pg returns { rows: [...] } shape via execute
  const list = (rows as unknown as { rows?: Array<{ employee_id: number }> }).rows ?? (rows as unknown as Array<{ employee_id: number }>);
  return new Set(list.map((r) => Number(r.employee_id)));
}

function isCurrentlyEmployed(status: string): boolean {
  return status === "active" || status === "on_leave";
}

router.get("/pay/stats", async (_req: Request, res: Response) => {
  const employees = await db.select().from(employeesTable);
  const salaried = employees.filter((e) => e.salary !== null && isCurrentlyEmployed(e.status));
  const totalAnnual = salaried.reduce((s, e) => s + num(e.salary), 0);
  const due = await dueForReviewIds();

  res.json({
    employeeCount: salaried.length,
    totalAnnualPayroll: Number(totalAnnual.toFixed(2)),
    totalMonthlyPayroll: Number((totalAnnual / 12).toFixed(2)),
    averageSalary: salaried.length ? Number((totalAnnual / salaried.length).toFixed(2)) : 0,
    dueForReviewCount: due.size,
  });
});

router.get("/pay/by-department", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      department: employeesTable.department,
      headcount: sql<string>`COUNT(*)::text`,
      total: sql<string>`COALESCE(SUM(${employeesTable.salary})::text, '0')`,
      avg: sql<string>`COALESCE(AVG(${employeesTable.salary})::text, '0')`,
      min: sql<string>`COALESCE(MIN(${employeesTable.salary})::text, '0')`,
      max: sql<string>`COALESCE(MAX(${employeesTable.salary})::text, '0')`,
    })
    .from(employeesTable)
    .where(
      and(
        sql`${employeesTable.salary} IS NOT NULL`,
        sql`${employeesTable.status} IN ('active', 'on_leave')`,
      ),
    )
    .groupBy(employeesTable.department)
    .orderBy(employeesTable.department);

  res.json(
    rows.map((r) => ({
      department: r.department,
      headcount: Number(r.headcount),
      totalAnnualCost: Number(Number(r.total).toFixed(2)),
      averageSalary: Number(Number(r.avg).toFixed(2)),
      minSalary: Number(Number(r.min).toFixed(2)),
      maxSalary: Number(Number(r.max).toFixed(2)),
    })),
  );
});

router.get("/pay/salary-bands", async (_req: Request, res: Response) => {
  const employees = await db.select().from(employeesTable);
  const salaried = employees.filter((e) => e.salary !== null && isCurrentlyEmployed(e.status));
  const counts = SALARY_BANDS.map((b) => ({ ...b, count: 0 }));
  for (const e of salaried) {
    const s = num(e.salary);
    for (const b of counts) {
      if (s >= b.min && (b.max === null || s < b.max)) {
        b.count++;
        break;
      }
    }
  }
  res.json(counts);
});

router.get("/pay/recent-changes", async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
  const rows = await db
    .select({ change: salaryChangesTable, employee: employeesTable })
    .from(salaryChangesTable)
    .innerJoin(employeesTable, eq(salaryChangesTable.employeeId, employeesTable.id))
    .orderBy(desc(salaryChangesTable.effectiveDate), desc(salaryChangesTable.id))
    .limit(limit);

  res.json(
    rows.map(({ change, employee }) => ({
      id: change.id,
      employeeId: change.employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeNumber: employee.employeeNumber,
      department: employee.department,
      previousSalary: change.previousSalary !== null ? Number(change.previousSalary) : null,
      newSalary: Number(change.newSalary),
      percentChange: change.percentChange !== null ? Number(change.percentChange) : null,
      effectiveDate: change.effectiveDate,
      reason: change.reason,
      createdAt: change.createdAt.toISOString(),
    })),
  );
});

router.get("/pay/due-for-review", async (_req: Request, res: Response) => {
  const ids = await dueForReviewIds();
  if (ids.size === 0) {
    res.json([]);
    return;
  }
  const employees = await db.select().from(employeesTable);
  const lastChanges = await db
    .select({
      employeeId: salaryChangesTable.employeeId,
      lastDate: sql<string>`MAX(${salaryChangesTable.effectiveDate})`,
    })
    .from(salaryChangesTable)
    .groupBy(salaryChangesTable.employeeId);
  const lastByEmp = new Map(lastChanges.map((r) => [r.employeeId, r.lastDate]));

  const result = employees
    .filter((e) => ids.has(e.id))
    .map((e) => {
      const last = lastByEmp.get(e.id) ?? null;
      return {
        employeeId: e.id,
        employeeName: `${e.firstName} ${e.lastName}`,
        employeeNumber: e.employeeNumber,
        department: e.department,
        jobTitle: e.jobTitle,
        currentSalary: e.salary !== null ? Number(e.salary) : null,
        lastReviewDate: last,
        monthsSinceReview: last ? monthsBetween(last) : null,
      };
    })
    .sort((a, b) => {
      // longest overdue first; nulls (never reviewed) at top
      const ma = a.monthsSinceReview ?? 9999;
      const mb = b.monthsSinceReview ?? 9999;
      return mb - ma;
    });
  res.json(result);
});

router.post("/pay/bulk-review", async (req: Request, res: Response) => {
  const parsed = ApplyBulkReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid bulk review", details: parsed.error.issues });
    return;
  }
  const { effectiveDate, reason, items } = parsed.data;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "No items to apply" });
    return;
  }

  // Dedupe by employeeId (last entry wins) so a duplicate in the payload doesn't
  // produce multiple sequential salary changes for the same employee.
  const dedupedMap = new Map<number, (typeof items)[number]>();
  for (const it of items) {
    if (!Number.isFinite(it.newSalary) || Number(it.newSalary) < 0) continue;
    dedupedMap.set(Number(it.employeeId), it);
  }
  const deduped = Array.from(dedupedMap.values());

  const result = await db.transaction(async (tx: Tx) => {
    let applied = 0;
    let skipped = 0;
    for (const item of deduped) {
      const [employee] = await tx
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.id, item.employeeId));
      if (!employee) {
        skipped++;
        continue;
      }
      const previous = employee.salary !== null ? Number(employee.salary) : null;
      const newSalary = Number(item.newSalary);
      if (!Number.isFinite(newSalary) || newSalary < 0) {
        skipped++;
        continue;
      }
      const percent =
        previous !== null && previous > 0
          ? Number((((newSalary - previous) / previous) * 100).toFixed(2))
          : null;

      await tx.insert(salaryChangesTable).values({
        tenantId: req.tenantId,
        employeeId: employee.id,
        previousSalary: previous !== null ? String(previous) : null,
        newSalary: String(newSalary),
        percentChange: percent !== null ? String(percent) : null,
        effectiveDate,
        reason: reason ?? "Annual pay review",
      });
      await tx
        .update(employeesTable)
        .set({ salary: String(newSalary), updatedAt: new Date() })
        .where(eq(employeesTable.id, employee.id));
      applied++;
    }
    return { applied, skipped };
  });

  if (result.applied > 0) {
    await logActivity(
      "bulk_pay_review",
      "system",
      null,
      `Applied bulk pay review to ${result.applied} employees effective ${effectiveDate}`,
      "Admin",
      req.tenantId,
    );
  }
  res.json(result);
});

export default router;
