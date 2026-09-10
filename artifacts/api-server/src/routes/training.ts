import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, lt, lte, gt, sql } from "drizzle-orm";
import {
  CreateTrainingRecordBody,
  UpdateTrainingRecordBody,
} from "@workspace/api-zod";
import {
  db,
  employeesTable,
  trainingRecordsTable,
  onboardingTasksTable,
} from "@workspace/db";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

type RecordRow = typeof trainingRecordsTable.$inferSelect;

function serializeRecord(row: RecordRow) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    name: row.name,
    category: row.category,
    provider: row.provider,
    completedDate: row.completedDate,
    expiryDate: row.expiryDate,
    status: row.status,
    cost: row.cost !== null ? Number(row.cost) : null,
    currency: row.currency,
    certificateObjectPath: row.certificateObjectPath,
    notes: row.notes,
    isMandatory: row.isMandatory,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function effectiveStatus(row: RecordRow, today: string): string {
  if (row.status === "completed" && row.expiryDate && row.expiryDate < today) return "expired";
  return row.status;
}

router.get("/training", async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setUTCDate(soon.getUTCDate() + 60);
  const soonStr = soon.toISOString().slice(0, 10);

  const conditions = [];
  if (category) conditions.push(eq(trainingRecordsTable.category, category));
  if (status === "overdue") {
    // Pending past due (we approximate using expiryDate as the deadline) OR expired (completed but expiry passed)
    conditions.push(
      sql`(
        (${trainingRecordsTable.status} = 'completed' AND ${trainingRecordsTable.expiryDate} IS NOT NULL AND ${trainingRecordsTable.expiryDate} < ${today})
        OR ${trainingRecordsTable.status} = 'expired'
      )`,
    );
  } else if (status === "expiring_soon") {
    conditions.push(
      and(
        eq(trainingRecordsTable.status, "completed"),
        sql`${trainingRecordsTable.expiryDate} IS NOT NULL AND ${trainingRecordsTable.expiryDate} >= ${today} AND ${trainingRecordsTable.expiryDate} <= ${soonStr}`,
      )!,
    );
  } else if (status && status !== "all") {
    conditions.push(eq(trainingRecordsTable.status, status));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select({
      record: trainingRecordsTable,
      employee: employeesTable,
    })
    .from(trainingRecordsTable)
    .innerJoin(employeesTable, eq(trainingRecordsTable.employeeId, employeesTable.id))
    .where(where)
    .orderBy(asc(trainingRecordsTable.expiryDate), desc(trainingRecordsTable.createdAt));

  res.json(
    rows.map((r) => ({
      ...serializeRecord(r.record),
      status: effectiveStatus(r.record, today),
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      employeeNumber: r.employee.employeeNumber,
      department: r.employee.department,
    })),
  );
});

router.get("/training/stats", async (_req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setUTCDate(soon.getUTCDate() + 60);
  const soonStr = soon.toISOString().slice(0, 10);

  const [
    [employeesInOnboardingRow],
    [overdueOnboardingRow],
    [overdueTrainingRow],
    [expiringSoonRow],
  ] = await Promise.all([
    db
      .select({ c: sql<number>`COUNT(DISTINCT ${onboardingTasksTable.employeeId})::int` })
      .from(onboardingTasksTable)
      .where(eq(onboardingTasksTable.status, "pending")),
    db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(onboardingTasksTable)
      .where(
        and(
          eq(onboardingTasksTable.status, "pending"),
          lt(onboardingTasksTable.dueDate, today),
        ),
      ),
    db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(trainingRecordsTable)
      .where(
        sql`(
          (${trainingRecordsTable.status} = 'completed' AND ${trainingRecordsTable.expiryDate} IS NOT NULL AND ${trainingRecordsTable.expiryDate} < ${today})
          OR ${trainingRecordsTable.status} = 'expired'
        )`,
      ),
    db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(trainingRecordsTable)
      .where(
        and(
          eq(trainingRecordsTable.status, "completed"),
          sql`${trainingRecordsTable.expiryDate} IS NOT NULL AND ${trainingRecordsTable.expiryDate} >= ${today} AND ${trainingRecordsTable.expiryDate} <= ${soonStr}`,
        ),
      ),
  ]);

  res.json({
    employeesInOnboarding: employeesInOnboardingRow?.c ?? 0,
    overdueOnboardingTasks: overdueOnboardingRow?.c ?? 0,
    overdueTrainingRecords: overdueTrainingRow?.c ?? 0,
    expiringSoonRecords: expiringSoonRow?.c ?? 0,
  });
});

router.get("/training/employees/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(trainingRecordsTable)
    .where(eq(trainingRecordsTable.employeeId, id))
    .orderBy(desc(trainingRecordsTable.isMandatory), asc(trainingRecordsTable.expiryDate), asc(trainingRecordsTable.name));
  res.json(rows.map((r) => ({ ...serializeRecord(r), status: effectiveStatus(r, today) })));
});

router.post("/training/employees/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = CreateTrainingRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid record data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
  if (!emp) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const [created] = await db
    .insert(trainingRecordsTable)
    .values({
      tenantId: req.tenantId,
      employeeId: id,
      name: data.name,
      category: data.category ?? "professional",
      provider: data.provider ?? null,
      completedDate: data.completedDate ?? null,
      expiryDate: data.expiryDate ?? null,
      status: data.status ?? (data.completedDate ? "completed" : "pending"),
      cost: data.cost !== undefined && data.cost !== null ? String(data.cost) : null,
      currency: data.currency ?? "GBP",
      notes: data.notes ?? null,
      isMandatory: data.isMandatory ?? false,
    })
    .returning();
  res.status(201).json(serializeRecord(created));
});

router.patch("/training-records/:recordId", async (req: Request, res: Response) => {
  const recordId = Number(req.params.recordId);
  if (!Number.isFinite(recordId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateTrainingRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid record data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const [existing] = await db
    .select()
    .from(trainingRecordsTable)
    .where(eq(trainingRecordsTable.id, recordId));
  if (!existing) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  const updates: Partial<typeof trainingRecordsTable.$inferInsert> = { updatedAt: new Date() };
  if (data.name !== undefined) {
    if (existing.isMandatory && data.name !== existing.name) {
      res.status(403).json({ error: "Cannot rename a mandatory training record" });
      return;
    }
    updates.name = data.name;
  }
  if (data.category !== undefined) {
    if (existing.isMandatory && data.category !== existing.category) {
      res.status(403).json({ error: "Cannot change category of a mandatory training record" });
      return;
    }
    updates.category = data.category;
  }
  if (data.provider !== undefined) updates.provider = data.provider;
  if (data.completedDate !== undefined) updates.completedDate = data.completedDate;
  if (data.expiryDate !== undefined) updates.expiryDate = data.expiryDate;
  if (data.status !== undefined) updates.status = data.status;
  if (data.cost !== undefined) updates.cost = data.cost !== null ? String(data.cost) : null;
  if (data.currency !== undefined) updates.currency = data.currency;
  if (data.notes !== undefined) updates.notes = data.notes;

  const [updated] = await db
    .update(trainingRecordsTable)
    .set(updates)
    .where(eq(trainingRecordsTable.id, recordId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  if (data.status === "completed") {
    await logActivity(
      "training_completed",
      "employee",
      updated.employeeId,
      `Training completed: ${updated.name}`,
      "Admin",
      req.tenantId,
    );
  }
  res.json(serializeRecord(updated));
});

router.delete("/training-records/:recordId", async (req: Request, res: Response) => {
  const recordId = Number(req.params.recordId);
  if (!Number.isFinite(recordId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select()
    .from(trainingRecordsTable)
    .where(eq(trainingRecordsTable.id, recordId));
  if (!existing) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  if (existing.isMandatory) {
    res.status(403).json({ error: "Cannot delete a mandatory training record" });
    return;
  }
  await db.delete(trainingRecordsTable).where(eq(trainingRecordsTable.id, recordId));
  res.status(204).end();
});

export default router;
