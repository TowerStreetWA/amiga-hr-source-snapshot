import { Router, type IRouter, type Request, type Response } from "express";
import { db, employeesTable, salaryChangesTable, employeeDocumentsTable, onboardingTasksTable, trainingRecordsTable } from "@workspace/db";
import { buildOnboardingTaskRows } from "../lib/onboardingTemplates";
import { buildMandatoryTrainingRows } from "../lib/trainingTemplates";
import { nextEmployeeNumberForTenant } from "../lib/employeeNumber";
import { logActivity } from "../lib/activity";
import {
  canViewEmployee,
  canViewEmployeeOrReport,
  directReportIds,
  forbidden,
  isSelfEditableEmployeeField,
} from "../lib/authz";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  ListEmployeesQueryParams,
  GetEmployeeParams,
  CreateEmployeeBody,
  UpdateEmployeeParams,
  UpdateEmployeeBody,
  DeleteEmployeeParams,
  ListSalaryHistoryParams,
  CreateSalaryChangeParams,
  CreateSalaryChangeBody,
  ListEmployeeDocumentsParams,
  CreateEmployeeDocumentParams,
  CreateEmployeeDocumentBody,
  DeleteEmployeeDocumentParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeEmployee(row: typeof employeesTable.$inferSelect) {
  return {
    id: row.id,
    employeeNumber: row.employeeNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    jobTitle: row.jobTitle,
    department: row.department,
    status: row.status,
    employmentType: row.employmentType,
    managerId: row.managerId,
    startDate: row.startDate,
    endDate: row.endDate,
    salary: row.salary !== null ? Number(row.salary) : null,
    currency: row.currency,
    dateOfBirth: row.dateOfBirth,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    postcode: row.postcode,
    country: row.country,
    emergencyName: row.emergencyName,
    emergencyRelationship: row.emergencyRelationship,
    emergencyPhone: row.emergencyPhone,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSalary(row: typeof salaryChangesTable.$inferSelect) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    previousSalary: row.previousSalary !== null ? Number(row.previousSalary) : null,
    newSalary: Number(row.newSalary),
    percentChange: row.percentChange !== null ? Number(row.percentChange) : null,
    effectiveDate: row.effectiveDate,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeDocument(row: typeof employeeDocumentsTable.$inferSelect) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    name: row.name,
    category: row.category,
    objectPath: row.objectPath,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

// GET /employees
router.get("/employees", async (req: Request, res: Response) => {
  const parsed = ListEmployeesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }
  const { search, status, department } = parsed.data;
  const conditions = [];
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(employeesTable.firstName, term),
        ilike(employeesTable.lastName, term),
        ilike(employeesTable.email, term),
        ilike(employeesTable.employeeNumber, term),
        ilike(employeesTable.jobTitle, term),
      ),
    );
  }
  if (status) conditions.push(eq(employeesTable.status, status));
  if (department) conditions.push(eq(employeesTable.department, department));
  // Role scoping: managers only see their own direct reports. Employees never
  // reach this list (not on the allowlist); admins see everyone.
  const user = req.appUser;
  if (user && user.role === "manager") {
    const reports = user.employeeId === null
      ? []
      : await directReportIds(req.tenantId, user.employeeId);
    if (reports.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(employeesTable.id, reports));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(employeesTable)
    .where(where)
    .orderBy(asc(employeesTable.lastName), asc(employeesTable.firstName));
  res.json(rows.map(serializeEmployee));
});

// POST /employees
router.post("/employees", async (req: Request, res: Response) => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid employee data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  let created: typeof employeesTable.$inferSelect | undefined;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      created = await db.transaction(async (tx) => {
        await tx.execute(sql`LOCK TABLE employees IN SHARE ROW EXCLUSIVE MODE`);
        const employeeNumber = await nextEmployeeNumberForTenant(tx as unknown as typeof db, req.tenantId);
        const [row] = await tx
          .insert(employeesTable)
          .values({
            tenantId: req.tenantId,
            employeeNumber,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone ?? null,
            jobTitle: data.jobTitle,
            department: data.department,
            status: data.status ?? "active",
            employmentType: data.employmentType,
            managerId: data.managerId ?? null,
            startDate: data.startDate,
            endDate: data.endDate ?? null,
            salary: data.salary !== undefined && data.salary !== null ? String(data.salary) : null,
            currency: data.currency ?? "GBP",
            dateOfBirth: data.dateOfBirth ?? null,
            addressLine1: data.addressLine1 ?? null,
            addressLine2: data.addressLine2 ?? null,
            city: data.city ?? null,
            postcode: data.postcode ?? null,
            country: data.country ?? null,
            emergencyName: data.emergencyName ?? null,
            emergencyRelationship: data.emergencyRelationship ?? null,
            emergencyPhone: data.emergencyPhone ?? null,
            notes: data.notes ?? null,
          })
          .returning();
        if (data.salary !== undefined && data.salary !== null) {
          await tx.insert(salaryChangesTable).values({
            tenantId: req.tenantId,
            employeeId: row.id,
            previousSalary: null,
            newSalary: String(data.salary),
            percentChange: null,
            effectiveDate: data.startDate,
            reason: "Initial salary",
          });
        }
        const onboardingRows = buildOnboardingTaskRows(row.id, data.startDate, req.tenantId);
        if (onboardingRows.length > 0) {
          await tx.insert(onboardingTasksTable).values(onboardingRows);
        }
        const trainingRows = buildMandatoryTrainingRows(row.id, req.tenantId);
        if (trainingRows.length > 0) {
          await tx.insert(trainingRecordsTable).values(trainingRows);
        }
        return row;
      });
      break;
    } catch (err) {
      lastError = err;
      if (!isUniqueViolation(err)) throw err;
      req.log.warn({ err, attempt }, "Employee number collision, retrying");
    }
  }
  if (!created) {
    req.log.error({ err: lastError }, "Failed to allocate employee number after retries");
    res.status(500).json({ error: "Could not allocate employee number, please retry" });
    return;
  }

  await logActivity(
    "create",
    "employee",
    created.id,
    `Added ${created.firstName} ${created.lastName} (${created.employeeNumber}) as ${created.jobTitle}`,
    "Admin",
    req.tenantId,
  );
  res.status(201).json(serializeEmployee(created));
});

// GET /employees/:id
router.get("/employees/:id", async (req: Request, res: Response) => {
  const parsed = GetEmployeeParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await canViewEmployeeOrReport(req.appUser, parsed.data.id, req.tenantId))) {
    forbidden(res);
    return;
  }
  const [row] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, parsed.data.id));
  if (!row) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json(serializeEmployee(row));
});

// PATCH /employees/:id
router.patch("/employees/:id", async (req: Request, res: Response) => {
  const paramsParsed = UpdateEmployeeParams.safeParse(req.params);
  const bodyParsed = UpdateEmployeeBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid update payload" });
    return;
  }
  const id = paramsParsed.data.id;
  const data = bodyParsed.data;

  const isAdmin = req.appUser?.role === "admin";
  const attemptedFields = Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

  // Non-admins may only edit their OWN record, and only a whitelist of safe
  // personal fields (contact / address / emergency). Sensitive employment and
  // pay fields stay admin-only.
  if (!isAdmin) {
    if (!req.appUser || req.appUser.employeeId !== id) {
      forbidden(res);
      return;
    }
    const disallowed = attemptedFields.filter((key) => !isSelfEditableEmployeeField(key));
    if (disallowed.length > 0) {
      forbidden(
        res,
        `You can only update your contact, address and emergency details. Not editable: ${disallowed.join(", ")}`,
      );
      return;
    }
  }

  const updateValues: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (key === "salary") {
      updateValues.salary = value === null ? null : String(value);
    } else {
      updateValues[key] = value;
    }
  }
  const [updated] = await db
    .update(employeesTable)
    .set(updateValues)
    .where(eq(employeesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const actor = isAdmin ? "Admin" : `${updated.firstName} ${updated.lastName}`;
  await logActivity(
    "update",
    "employee",
    updated.id,
    `Updated profile for ${updated.firstName} ${updated.lastName}`,
    actor,
    req.tenantId,
  );
  res.json(serializeEmployee(updated));
});

// DELETE /employees/:id
router.delete("/employees/:id", async (req: Request, res: Response) => {
  const parsed = DeleteEmployeeParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [removed] = await db
    .delete(employeesTable)
    .where(eq(employeesTable.id, parsed.data.id))
    .returning();
  if (!removed) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  await logActivity(
    "delete",
    "employee",
    removed.id,
    `Removed ${removed.firstName} ${removed.lastName} (${removed.employeeNumber})`,
    "Admin",
    req.tenantId,
  );
  res.status(204).end();
});

// GET /employees/:id/salary-history
router.get("/employees/:id/salary-history", async (req: Request, res: Response) => {
  const parsed = ListSalaryHistoryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await canViewEmployeeOrReport(req.appUser, parsed.data.id, req.tenantId))) {
    forbidden(res);
    return;
  }
  const rows = await db
    .select()
    .from(salaryChangesTable)
    .where(eq(salaryChangesTable.employeeId, parsed.data.id))
    .orderBy(desc(salaryChangesTable.effectiveDate));
  res.json(rows.map(serializeSalary));
});

// POST /employees/:id/salary-changes
router.post("/employees/:id/salary-history", async (req: Request, res: Response) => {
  const paramsParsed = CreateSalaryChangeParams.safeParse(req.params);
  const bodyParsed = CreateSalaryChangeBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid salary change payload" });
    return;
  }
  const employeeId = paramsParsed.data.id;
  const { newSalary, effectiveDate, reason } = bodyParsed.data;
  const [employee] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const previousSalary = employee.salary !== null ? Number(employee.salary) : null;
  const percentChange =
    previousSalary !== null && previousSalary > 0
      ? ((Number(newSalary) - previousSalary) / previousSalary) * 100
      : null;
  const [created] = await db
    .insert(salaryChangesTable)
    .values({
      tenantId: req.tenantId,
      employeeId,
      previousSalary: previousSalary !== null ? String(previousSalary) : null,
      newSalary: String(newSalary),
      percentChange: percentChange !== null ? percentChange.toFixed(2) : null,
      effectiveDate,
      reason: reason ?? null,
    })
    .returning();
  await db
    .update(employeesTable)
    .set({ salary: String(newSalary), updatedAt: new Date() })
    .where(eq(employeesTable.id, employeeId));
  await logActivity(
    "salary_change",
    "employee",
    employeeId,
    `Salary updated for ${employee.firstName} ${employee.lastName}` +
      (percentChange !== null ? ` (${percentChange >= 0 ? "+" : ""}${percentChange.toFixed(1)}%)` : ""),
    "Admin",
    req.tenantId,
  );
  res.status(201).json(serializeSalary(created));
});

// GET /employees/:id/documents
router.get("/employees/:id/documents", async (req: Request, res: Response) => {
  const parsed = ListEmployeeDocumentsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await canViewEmployeeOrReport(req.appUser, parsed.data.id, req.tenantId))) {
    forbidden(res);
    return;
  }
  const rows = await db
    .select()
    .from(employeeDocumentsTable)
    .where(eq(employeeDocumentsTable.employeeId, parsed.data.id))
    .orderBy(desc(employeeDocumentsTable.uploadedAt));
  res.json(rows.map(serializeDocument));
});

// POST /employees/:id/documents
router.post("/employees/:id/documents", async (req: Request, res: Response) => {
  const paramsParsed = CreateEmployeeDocumentParams.safeParse(req.params);
  const bodyParsed = CreateEmployeeDocumentBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid document payload" });
    return;
  }
  const employeeId = paramsParsed.data.id;
  const { name, category, objectPath, fileSize, mimeType } = bodyParsed.data;
  const [employee] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const [created] = await db
    .insert(employeeDocumentsTable)
    .values({
      tenantId: req.tenantId,
      employeeId,
      name,
      category,
      objectPath,
      fileSize: fileSize ?? null,
      mimeType: mimeType ?? null,
    })
    .returning();
  await logActivity(
    "upload_document",
    "document",
    created.id,
    `Uploaded ${name} for ${employee.firstName} ${employee.lastName}`,
    "Admin",
    req.tenantId,
  );
  res.status(201).json(serializeDocument(created));
});

// DELETE /documents/:docId
router.delete("/documents/:docId", async (req: Request, res: Response) => {
  const parsed = DeleteEmployeeDocumentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }
  const [removed] = await db
    .delete(employeeDocumentsTable)
    .where(eq(employeeDocumentsTable.id, parsed.data.docId))
    .returning();
  if (!removed) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  await logActivity(
    "delete_document",
    "document",
    removed.id,
    `Removed document ${removed.name}`,
    "Admin",
    req.tenantId,
  );
  res.status(204).end();
});

export default router;
