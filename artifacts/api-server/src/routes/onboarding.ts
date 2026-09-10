import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import {
  CreateOnboardingTaskBody,
  UpdateOnboardingTaskBody,
} from "@workspace/api-zod";
import {
  db,
  employeesTable,
  onboardingTasksTable,
} from "@workspace/db";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

type TaskRow = typeof onboardingTasksTable.$inferSelect;

function serializeTask(row: TaskRow) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    title: row.title,
    description: row.description,
    category: row.category,
    dueDate: row.dueDate,
    status: row.status,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    completedBy: row.completedBy,
    sortOrder: row.sortOrder,
    isCustom: row.isCustom,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function deriveStatus(total: number, completed: number, overdue: number): "not_started" | "on_track" | "needs_attention" | "completed" {
  if (total === 0) return "not_started";
  if (completed === total) return "completed";
  if (overdue > 0) return "needs_attention";
  return "on_track";
}

router.get("/onboarding/overview", async (_req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      employee: employeesTable,
      totalTasks: sql<number>`COUNT(${onboardingTasksTable.id})::int`,
      completedTasks: sql<number>`COUNT(*) FILTER (WHERE ${onboardingTasksTable.status} = 'completed')::int`,
      overdueTasks: sql<number>`COUNT(*) FILTER (WHERE ${onboardingTasksTable.status} = 'pending' AND ${onboardingTasksTable.dueDate} < ${today})::int`,
    })
    .from(employeesTable)
    .leftJoin(onboardingTasksTable, eq(onboardingTasksTable.employeeId, employeesTable.id))
    .where(eq(employeesTable.status, "active"))
    .groupBy(employeesTable.id)
    .orderBy(desc(employeesTable.startDate));

  const overview = rows
    .filter((r) => r.totalTasks > 0)
    .map((r) => {
      const total = r.totalTasks;
      const completed = r.completedTasks;
      const overdue = r.overdueTasks;
      const progressPercent = total === 0 ? 0 : Math.round((completed / total) * 100);
      return {
        employeeId: r.employee.id,
        employeeNumber: r.employee.employeeNumber,
        firstName: r.employee.firstName,
        lastName: r.employee.lastName,
        jobTitle: r.employee.jobTitle,
        department: r.employee.department,
        startDate: r.employee.startDate,
        totalTasks: total,
        completedTasks: completed,
        overdueTasks: overdue,
        progressPercent,
        statusLabel: deriveStatus(total, completed, overdue),
      };
    });
  res.json(overview);
});

router.get("/onboarding/employees/:id/tasks", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(onboardingTasksTable)
    .where(eq(onboardingTasksTable.employeeId, id))
    .orderBy(asc(onboardingTasksTable.sortOrder), asc(onboardingTasksTable.id));
  res.json(rows.map(serializeTask));
});

router.post("/onboarding/employees/:id/tasks", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = CreateOnboardingTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid task data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
  if (!emp) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const [maxRow] = await db
    .select({ m: sql<number>`COALESCE(MAX(${onboardingTasksTable.sortOrder}), -1)::int` })
    .from(onboardingTasksTable)
    .where(eq(onboardingTasksTable.employeeId, id));
  const nextSort = (maxRow?.m ?? -1) + 1;
  const [created] = await db
    .insert(onboardingTasksTable)
    .values({
      tenantId: req.tenantId,
      employeeId: id,
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? "other",
      dueDate: data.dueDate ?? null,
      sortOrder: data.sortOrder ?? nextSort,
      isCustom: true,
    })
    .returning();
  res.status(201).json(serializeTask(created));
});

router.patch("/onboarding-tasks/:taskId", async (req: Request, res: Response) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(taskId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateOnboardingTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid task data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const updates: Partial<typeof onboardingTasksTable.$inferInsert> = { updatedAt: new Date() };
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.category !== undefined) updates.category = data.category;
  if (data.dueDate !== undefined) updates.dueDate = data.dueDate;
  if (data.status !== undefined) {
    updates.status = data.status;
    if (data.status === "completed") {
      updates.completedAt = new Date();
      updates.completedBy = data.completedBy ?? "Admin";
    } else {
      updates.completedAt = null;
      updates.completedBy = null;
    }
  }

  const [updated] = await db
    .update(onboardingTasksTable)
    .set(updates)
    .where(eq(onboardingTasksTable.id, taskId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (data.status === "completed") {
    await logActivity(
      "onboarding_task_completed",
      "employee",
      updated.employeeId,
      `Onboarding task completed: ${updated.title}`,
      "Admin",
      req.tenantId,
    );
  }
  res.json(serializeTask(updated));
});

router.delete("/onboarding-tasks/:taskId", async (req: Request, res: Response) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(taskId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [removed] = await db
    .delete(onboardingTasksTable)
    .where(eq(onboardingTasksTable.id, taskId))
    .returning();
  if (!removed) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.status(204).end();
});

// Internal export so other route modules don't need to know about lt
export { lt as _lt };
export default router;
