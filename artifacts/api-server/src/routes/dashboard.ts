import { Router, type IRouter, type Request, type Response } from "express";
import { db, employeesTable, employeeDocumentsTable, activityLogTable } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req: Request, res: Response) => {
  const employees = await db.select().from(employeesTable);
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter((e) => e.status === "active").length;
  const onLeaveEmployees = employees.filter((e) => e.status === "on_leave").length;
  const departments = new Set(employees.map((e) => e.department));

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const newHiresThisMonth = employees.filter((e) => {
    const start = new Date(e.startDate);
    return start >= startOfMonth && e.status !== "terminated";
  }).length;

  const now = Date.now();
  const tenures = employees
    .filter((e) => e.status !== "terminated")
    .map((e) => (now - new Date(e.startDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  const averageTenureYears =
    tenures.length > 0 ? tenures.reduce((a, b) => a + b, 0) / tenures.length : 0;

  const totalPayrollMonthly = employees
    .filter((e) => e.status !== "terminated" && e.salary !== null)
    .reduce((sum, e) => sum + Number(e.salary) / 12, 0);

  const docsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(employeeDocumentsTable);
  const totalDocuments = Number(docsCount[0]?.count ?? 0);

  res.json({
    totalEmployees,
    activeEmployees,
    onLeaveEmployees,
    newHiresThisMonth,
    departmentsCount: departments.size,
    averageTenureYears: Number(averageTenureYears.toFixed(2)),
    totalDocuments,
    totalPayrollMonthly: Number(totalPayrollMonthly.toFixed(2)),
  });
});

router.get("/dashboard/activity", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(activityLogTable)
    .orderBy(desc(activityLogTable.createdAt))
    .limit(15);
  res.json(
    rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      summary: r.summary,
      actor: r.actor,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.get("/dashboard/department-breakdown", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      department: employeesTable.department,
      count: sql<number>`count(*)`,
    })
    .from(employeesTable)
    .where(eq(employeesTable.status, "active"))
    .groupBy(employeesTable.department);
  res.json(
    rows
      .map((r) => ({ department: r.department, count: Number(r.count) }))
      .sort((a, b) => b.count - a.count),
  );
});

router.get("/dashboard/upcoming-anniversaries", async (_req: Request, res: Response) => {
  const employees = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.status, "active"));
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 60);

  const upcoming = employees
    .map((e) => {
      const start = new Date(e.startDate);
      const next = new Date(start);
      next.setFullYear(now.getFullYear());
      if (next < now) next.setFullYear(now.getFullYear() + 1);
      const yearsOfService = next.getFullYear() - start.getFullYear();
      return {
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        firstName: e.firstName,
        lastName: e.lastName,
        jobTitle: e.jobTitle,
        department: e.department,
        startDate: e.startDate,
        yearsOfService,
        anniversaryDate: next.toISOString().slice(0, 10),
        nextDate: next,
      };
    })
    .filter((a) => a.nextDate <= horizon && a.yearsOfService >= 1)
    .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
    .slice(0, 10)
    .map(({ nextDate, ...rest }) => rest);

  res.json(upcoming);
});

export default router;
