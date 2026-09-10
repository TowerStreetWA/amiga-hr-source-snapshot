import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  CreateBenefitBody,
  UpdateBenefitBody,
  CreateEmployeeBenefitBody,
  UpdateEmployeeBenefitBody,
} from "@workspace/api-zod";
import {
  db,
  employeesTable,
  benefitsCatalogTable,
  employeeBenefitsTable,
  leaveEntitlementsTable,
} from "@workspace/db";
import { logActivity } from "../lib/activity";
import { canViewEmployeeOrReport, forbidden } from "../lib/authz";
import { BENEFIT_CATEGORIES } from "@workspace/db";
import { todayIsoDate } from "../lib/workingDays";

const router: IRouter = Router();

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

function serializeBenefit(row: typeof benefitsCatalogTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    provider: row.provider,
    description: row.description,
    defaultAnnualValue: row.defaultAnnualValue !== null ? Number(row.defaultAnnualValue) : null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeEmployeeBenefit(row: typeof employeeBenefitsTable.$inferSelect) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    benefitId: row.benefitId,
    employerContribution: num(row.employerContribution),
    employeeContribution: num(row.employeeContribution),
    annualValue: num(row.annualValue),
    startDate: row.startDate,
    endDate: row.endDate,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/benefits", async (_req: Request, res: Response) => {
  const rows = await db.select().from(benefitsCatalogTable).orderBy(asc(benefitsCatalogTable.name));
  res.json(rows.map(serializeBenefit));
});

router.post("/benefits", async (req: Request, res: Response) => {
  const parsed = CreateBenefitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid benefit", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  if (!(BENEFIT_CATEGORIES as readonly string[]).includes(data.category)) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  const [row] = await db
    .insert(benefitsCatalogTable)
    .values({
      tenantId: req.tenantId,
      name: data.name,
      category: data.category,
      provider: data.provider ?? null,
      description: data.description ?? null,
      defaultAnnualValue: data.defaultAnnualValue !== undefined && data.defaultAnnualValue !== null ? String(data.defaultAnnualValue) : null,
      isActive: data.isActive ?? true,
    })
    .returning();
  await logActivity("benefit_created", "benefit", row.id, `Benefit added: ${row.name}`, "Admin", req.tenantId);
  res.status(201).json(serializeBenefit(row));
});

router.patch("/benefits/:benefitId", async (req: Request, res: Response) => {
  const benefitId = Number(req.params.benefitId);
  if (!Number.isFinite(benefitId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateBenefitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid update", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const updates: Partial<typeof benefitsCatalogTable.$inferInsert> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.category !== undefined) updates.category = data.category;
  if (data.provider !== undefined) updates.provider = data.provider;
  if (data.description !== undefined) updates.description = data.description;
  if (data.defaultAnnualValue !== undefined)
    updates.defaultAnnualValue = data.defaultAnnualValue === null ? null : String(data.defaultAnnualValue);
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  const [row] = await db
    .update(benefitsCatalogTable)
    .set(updates)
    .where(eq(benefitsCatalogTable.id, benefitId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Benefit not found" });
    return;
  }
  res.json(serializeBenefit(row));
});

router.delete("/benefits/:benefitId", async (req: Request, res: Response) => {
  const benefitId = Number(req.params.benefitId);
  if (!Number.isFinite(benefitId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  // Block delete if assigned to employees (FK is restrict but we surface a friendly error)
  const [assigned] = await db
    .select({ id: employeeBenefitsTable.id })
    .from(employeeBenefitsTable)
    .where(eq(employeeBenefitsTable.benefitId, benefitId))
    .limit(1);
  if (assigned) {
    res.status(409).json({ error: "Benefit is assigned to one or more employees and cannot be deleted." });
    return;
  }
  await db.delete(benefitsCatalogTable).where(eq(benefitsCatalogTable.id, benefitId));
  res.status(204).end();
});

router.get("/employees/:id/benefits", async (req: Request, res: Response) => {
  const employeeId = Number(req.params.id);
  if (!Number.isFinite(employeeId)) {
    res.status(400).json({ error: "Invalid employee id" });
    return;
  }
  if (!(await canViewEmployeeOrReport(req.appUser, employeeId, req.tenantId))) {
    forbidden(res);
    return;
  }
  const rows = await db
    .select({ eb: employeeBenefitsTable, b: benefitsCatalogTable })
    .from(employeeBenefitsTable)
    .innerJoin(benefitsCatalogTable, eq(employeeBenefitsTable.benefitId, benefitsCatalogTable.id))
    .where(eq(employeeBenefitsTable.employeeId, employeeId))
    .orderBy(desc(employeeBenefitsTable.startDate));
  res.json(
    rows.map(({ eb, b }) => ({
      ...serializeEmployeeBenefit(eb),
      name: b.name,
      category: b.category,
      provider: b.provider,
    })),
  );
});

router.post("/employees/:id/benefits", async (req: Request, res: Response) => {
  const employeeId = Number(req.params.id);
  if (!Number.isFinite(employeeId)) {
    res.status(400).json({ error: "Invalid employee id" });
    return;
  }
  const parsed = CreateEmployeeBenefitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid assignment", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const [benefit] = await db.select().from(benefitsCatalogTable).where(eq(benefitsCatalogTable.id, data.benefitId));
  if (!benefit) {
    res.status(404).json({ error: "Benefit not found" });
    return;
  }

  const annualValue =
    data.annualValue !== undefined && data.annualValue !== null
      ? Number(data.annualValue)
      : benefit.defaultAnnualValue !== null
        ? Number(benefit.defaultAnnualValue)
        : 0;

  const [row] = await db
    .insert(employeeBenefitsTable)
    .values({
      tenantId: req.tenantId,
      employeeId,
      benefitId: data.benefitId,
      employerContribution: data.employerContribution !== undefined && data.employerContribution !== null ? String(data.employerContribution) : "0",
      employeeContribution: data.employeeContribution !== undefined && data.employeeContribution !== null ? String(data.employeeContribution) : "0",
      annualValue: String(annualValue),
      startDate: data.startDate ?? todayIsoDate(),
      endDate: data.endDate ?? null,
      notes: data.notes ?? null,
    })
    .returning();
  await logActivity("benefit_assigned", "employee", employeeId, `Benefit assigned: ${benefit.name}`, "Admin", req.tenantId);
  res.status(201).json(serializeEmployeeBenefit(row));
});

router.patch("/employee-benefits/:employeeBenefitId", async (req: Request, res: Response) => {
  const id = Number(req.params.employeeBenefitId);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateEmployeeBenefitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid update", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const updates: Partial<typeof employeeBenefitsTable.$inferInsert> = { updatedAt: new Date() };
  if (data.employerContribution !== undefined) updates.employerContribution = String(data.employerContribution);
  if (data.employeeContribution !== undefined) updates.employeeContribution = String(data.employeeContribution);
  if (data.annualValue !== undefined) updates.annualValue = String(data.annualValue);
  if (data.startDate !== undefined) updates.startDate = data.startDate;
  if (data.endDate !== undefined) updates.endDate = data.endDate;
  if (data.notes !== undefined) updates.notes = data.notes;

  const [row] = await db
    .update(employeeBenefitsTable)
    .set(updates)
    .where(eq(employeeBenefitsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  res.json(serializeEmployeeBenefit(row));
});

router.delete("/employee-benefits/:employeeBenefitId", async (req: Request, res: Response) => {
  const id = Number(req.params.employeeBenefitId);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [removed] = await db
    .delete(employeeBenefitsTable)
    .where(eq(employeeBenefitsTable.id, id))
    .returning();
  if (!removed) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  res.status(204).end();
});

router.get("/employees/:id/total-reward", async (req: Request, res: Response): Promise<void> => {
  const employeeId = Number(req.params.id);
  if (!Number.isFinite(employeeId)) {
    res.status(400).json({ error: "Invalid employee id" });
    return;
  }
  if (!(await canViewEmployeeOrReport(req.appUser, employeeId, req.tenantId))) {
    forbidden(res);
    return;
  }
  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const benefitRows = await db
    .select({ eb: employeeBenefitsTable, b: benefitsCatalogTable })
    .from(employeeBenefitsTable)
    .innerJoin(benefitsCatalogTable, eq(employeeBenefitsTable.benefitId, benefitsCatalogTable.id))
    .where(
      and(
        eq(employeeBenefitsTable.employeeId, employeeId),
      ),
    )
    .orderBy(asc(benefitsCatalogTable.name));

  const today = todayIsoDate();
  // Active = startDate has begun AND not ended.
  const activeBenefits = benefitRows.filter(
    ({ eb }) => eb.startDate <= today && (!eb.endDate || eb.endDate >= today),
  );
  const totalBenefitsValue = activeBenefits.reduce((s, { eb }) => s + num(eb.annualValue), 0);
  const baseSalary = employee.salary !== null ? Number(employee.salary) : 0;

  const year = new Date().getUTCFullYear();
  const entitlements = await db
    .select()
    .from(leaveEntitlementsTable)
    .where(and(eq(leaveEntitlementsTable.employeeId, employeeId), eq(leaveEntitlementsTable.year, year)))
    .orderBy(asc(leaveEntitlementsTable.leaveType));

  res.json({
    employeeId,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeNumber: employee.employeeNumber,
    jobTitle: employee.jobTitle,
    department: employee.department,
    startDate: employee.startDate,
    baseSalary,
    benefits: activeBenefits.map(({ eb, b }) => ({
      ...serializeEmployeeBenefit(eb),
      name: b.name,
      category: b.category,
      provider: b.provider,
    })),
    totalBenefitsValue: Number(totalBenefitsValue.toFixed(2)),
    totalPackageValue: Number((baseSalary + totalBenefitsValue).toFixed(2)),
    leaveEntitlements: entitlements.map((e) => {
      const entitled = num(e.entitledDays);
      const carried = num(e.carriedOverDays);
      const used = num(e.usedDays);
      return {
        leaveType: e.leaveType,
        entitledDays: entitled + carried,
        remainingDays: Math.max(0, entitled + carried - used),
      };
    }),
    generatedAt: new Date().toISOString(),
  });
});

export default router;
