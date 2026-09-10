import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  CreateJobBody,
  UpdateJobBody,
} from "@workspace/api-zod";
import { db, jobsTable, candidatesTable } from "@workspace/db";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function serializeJob(row: typeof jobsTable.$inferSelect, candidateCount = 0, hiredCount = 0) {
  return {
    id: row.id,
    title: row.title,
    department: row.department,
    location: row.location,
    employmentType: row.employmentType,
    salaryMin: row.salaryMin !== null ? Number(row.salaryMin) : null,
    salaryMax: row.salaryMax !== null ? Number(row.salaryMax) : null,
    currency: row.currency,
    description: row.description,
    status: row.status,
    closingDate: row.closingDate,
    hiringManagerId: row.hiringManagerId,
    candidateCount,
    hiredCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/jobs", async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where = status ? eq(jobsTable.status, status) : undefined;
  const rows = await db
    .select({
      job: jobsTable,
      candidateCount: sql<number>`COUNT(${candidatesTable.id})::int`,
      hiredCount: sql<number>`COUNT(${candidatesTable.id}) FILTER (WHERE ${candidatesTable.currentStage} = 'hired')::int`,
    })
    .from(jobsTable)
    .leftJoin(candidatesTable, eq(candidatesTable.jobId, jobsTable.id))
    .where(where)
    .groupBy(jobsTable.id)
    .orderBy(desc(jobsTable.createdAt));
  res.json(rows.map((r) => serializeJob(r.job, r.candidateCount, r.hiredCount)));
});

router.get("/jobs/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select({
      job: jobsTable,
      candidateCount: sql<number>`COUNT(${candidatesTable.id})::int`,
      hiredCount: sql<number>`COUNT(${candidatesTable.id}) FILTER (WHERE ${candidatesTable.currentStage} = 'hired')::int`,
    })
    .from(jobsTable)
    .leftJoin(candidatesTable, eq(candidatesTable.jobId, jobsTable.id))
    .where(eq(jobsTable.id, id))
    .groupBy(jobsTable.id);
  if (!row) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(serializeJob(row.job, row.candidateCount, row.hiredCount));
});

router.post("/jobs", async (req: Request, res: Response) => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid job data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const [created] = await db
    .insert(jobsTable)
    .values({
      tenantId: req.tenantId,
      title: data.title,
      department: data.department,
      location: data.location ?? "London",
      employmentType: data.employmentType,
      salaryMin: data.salaryMin !== undefined && data.salaryMin !== null ? String(data.salaryMin) : null,
      salaryMax: data.salaryMax !== undefined && data.salaryMax !== null ? String(data.salaryMax) : null,
      currency: data.currency ?? "GBP",
      description: data.description ?? null,
      status: data.status ?? "open",
      closingDate: data.closingDate ?? null,
      hiringManagerId: data.hiringManagerId ?? null,
    })
    .returning();
  await logActivity("create", "job", created.id, `Posted role "${created.title}" in ${created.department}`, "Admin", req.tenantId);
  res.status(201).json(serializeJob(created));
});

router.patch("/jobs/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid job data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const updates: Partial<typeof jobsTable.$inferInsert> = { updatedAt: new Date() };
  if (data.title !== undefined) updates.title = data.title;
  if (data.department !== undefined) updates.department = data.department;
  if (data.location !== undefined) updates.location = data.location;
  if (data.employmentType !== undefined) updates.employmentType = data.employmentType;
  if (data.salaryMin !== undefined) updates.salaryMin = data.salaryMin !== null ? String(data.salaryMin) : null;
  if (data.salaryMax !== undefined) updates.salaryMax = data.salaryMax !== null ? String(data.salaryMax) : null;
  if (data.currency !== undefined) updates.currency = data.currency;
  if (data.description !== undefined) updates.description = data.description;
  if (data.status !== undefined) updates.status = data.status;
  if (data.closingDate !== undefined) updates.closingDate = data.closingDate;
  if (data.hiringManagerId !== undefined) updates.hiringManagerId = data.hiringManagerId;
  const [updated] = await db
    .update(jobsTable)
    .set(updates)
    .where(eq(jobsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  await logActivity("update", "job", updated.id, `Updated role "${updated.title}"`, "Admin", req.tenantId);
  res.json(serializeJob(updated));
});

router.delete("/jobs/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [removed] = await db.delete(jobsTable).where(eq(jobsTable.id, id)).returning();
  if (!removed) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  await logActivity("delete", "job", removed.id, `Closed role "${removed.title}"`, "Admin", req.tenantId);
  res.status(204).end();
});

export default router;
