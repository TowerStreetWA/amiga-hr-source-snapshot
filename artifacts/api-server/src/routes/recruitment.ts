import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { ConvertCandidateToEmployeeBody } from "@workspace/api-zod";
import {
  db,
  candidatesTable,
  candidateDocumentsTable,
  candidateStageHistoryTable,
  employeesTable,
  employeeDocumentsTable,
  salaryChangesTable,
  jobsTable,
  offersTable,
  interviewsTable,
  onboardingTasksTable,
  trainingRecordsTable,
} from "@workspace/db";
import { logActivity } from "../lib/activity";
import { nextEmployeeNumberForTenant } from "../lib/employeeNumber";
import { buildOnboardingTaskRows } from "../lib/onboardingTemplates";
import { buildMandatoryTrainingRows } from "../lib/trainingTemplates";

const router: IRouter = Router();

const CANDIDATE_DOC_TO_EMPLOYEE_CATEGORY: Record<string, string> = {
  cv: "other",
  cover_letter: "other",
  passport: "id_document",
  right_to_work: "visa",
  qualification: "qualification",
  reference: "other",
  other: "other",
};

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

router.get("/recruitment/stats", async (_req: Request, res: Response) => {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const startOfWeek = new Date();
  startOfWeek.setUTCHours(0, 0, 0, 0);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 7);

  const [
    [openJobsRow],
    [totalRow],
    [activeRow],
    [hiredRow],
    [interviewsRow],
    [offersRow],
    stageRows,
  ] = await Promise.all([
    db.select({ c: sql<number>`COUNT(*)::int` }).from(jobsTable).where(eq(jobsTable.status, "open")),
    db.select({ c: sql<number>`COUNT(*)::int` }).from(candidatesTable),
    db.select({ c: sql<number>`COUNT(*)::int` }).from(candidatesTable).where(sql`${candidatesTable.currentStage} NOT IN ('hired','rejected')`),
    db.select({ c: sql<number>`COUNT(*)::int` }).from(candidatesTable).where(and(eq(candidatesTable.currentStage, "hired"), gte(candidatesTable.updatedAt, startOfMonth))),
    db.select({ c: sql<number>`COUNT(*)::int` }).from(interviewsTable).where(and(gte(interviewsTable.scheduledFor, startOfWeek), sql`${interviewsTable.scheduledFor} < ${endOfWeek}`)),
    db.select({ c: sql<number>`COUNT(*)::int` }).from(offersTable).where(eq(offersTable.status, "sent")),
    db
      .select({ stage: candidatesTable.currentStage, count: sql<number>`COUNT(*)::int` })
      .from(candidatesTable)
      .groupBy(candidatesTable.currentStage),
  ]);

  res.json({
    openJobs: openJobsRow?.c ?? 0,
    totalCandidates: totalRow?.c ?? 0,
    activeCandidates: activeRow?.c ?? 0,
    hiredThisMonth: hiredRow?.c ?? 0,
    interviewsThisWeek: interviewsRow?.c ?? 0,
    pendingOffers: offersRow?.c ?? 0,
    stageBreakdown: stageRows.map((r) => ({ stage: r.stage, count: r.count })),
  });
});

router.post("/candidates/:id/convert-to-employee", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = ConvertCandidateToEmployeeBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid conversion data", details: parsed.error.issues });
    return;
  }
  const overrides = parsed.data;

  type ConversionOutcome =
    | { ok: true; employee: typeof employeesTable.$inferSelect; cand: typeof candidatesTable.$inferSelect }
    | { ok: false; status: 404 | 409; error: string };

  let outcome: ConversionOutcome | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      outcome = await db.transaction(async (tx): Promise<ConversionOutcome> => {
        // Lock candidate row first to make this idempotent against double-submits.
        // Use a typed Drizzle select with .for("update") so we get camelCase
        // properties (raw `tx.execute(sql`SELECT *`)` returns snake_case columns,
        // which silently broke `cand.firstName`/`cand.hiredEmployeeId` etc.).
        const lockedRows = await tx
          .select()
          .from(candidatesTable)
          .where(and(eq(candidatesTable.id, id), eq(candidatesTable.tenantId, req.tenantId)))
          .for("update");
        const cand = lockedRows[0];
        if (!cand) return { ok: false, status: 404, error: "Candidate not found" };
        if (cand.hiredEmployeeId) {
          return { ok: false, status: 409, error: "Candidate already converted" };
        }

        const job = cand.jobId
          ? (
              await tx
                .select()
                .from(jobsTable)
                .where(and(eq(jobsTable.id, cand.jobId), eq(jobsTable.tenantId, req.tenantId)))
            )[0]
          : null;
        const acceptedOffers = await tx
          .select()
          .from(offersTable)
          .where(
            and(
              eq(offersTable.candidateId, id),
              eq(offersTable.tenantId, req.tenantId),
              eq(offersTable.status, "accepted"),
            ),
          );
        const offer = acceptedOffers[0] ?? null;

        const startDate = overrides.startDate ?? offer?.startDate ?? new Date().toISOString().slice(0, 10);
        const salary = overrides.salary ?? (offer ? Number(offer.salary) : cand.expectedSalary !== null ? Number(cand.expectedSalary) : null);
        const jobTitle = overrides.jobTitle ?? job?.title ?? cand.currentRole ?? "New Hire";
        const department = overrides.department ?? job?.department ?? "General";
        const employmentType = overrides.employmentType ?? offer?.employmentType ?? job?.employmentType ?? "full_time";

        const employeeNumber = await nextEmployeeNumberForTenant(
          tx as unknown as typeof db,
          req.tenantId,
        );

        const [emp] = await tx
          .insert(employeesTable)
          .values({
            tenantId: req.tenantId,
            employeeNumber,
            firstName: cand.firstName,
            lastName: cand.lastName,
            email: cand.email,
            phone: cand.phone ?? null,
            jobTitle,
            department,
            status: "active",
            employmentType,
            startDate,
            salary: salary !== null && salary !== undefined ? String(salary) : null,
            currency: cand.currency,
          })
          .returning();

        if (salary !== null && salary !== undefined) {
          await tx.insert(salaryChangesTable).values({
            tenantId: req.tenantId,
            employeeId: emp.id,
            previousSalary: null,
            newSalary: String(salary),
            percentChange: null,
            effectiveDate: startDate,
            reason: "Initial salary on hire",
          });
        }

        const candDocs = await tx
          .select()
          .from(candidateDocumentsTable)
          .where(
            and(
              eq(candidateDocumentsTable.candidateId, id),
              eq(candidateDocumentsTable.tenantId, req.tenantId),
            ),
          );
        if (candDocs.length > 0) {
          const tenantId = req.tenantId;
          await tx.insert(employeeDocumentsTable).values(
            candDocs.map((d) => ({
              tenantId,
              employeeId: emp.id,
              name: d.name,
              category: CANDIDATE_DOC_TO_EMPLOYEE_CATEGORY[d.category] ?? "other",
              objectPath: d.objectPath,
              fileSize: d.fileSize,
              mimeType: d.mimeType,
            })),
          );
        }

        await tx
          .update(candidatesTable)
          .set({
            currentStage: "hired",
            hiredEmployeeId: emp.id,
            updatedAt: new Date(),
          })
          .where(eq(candidatesTable.id, id));

        await tx.insert(candidateStageHistoryTable).values({
          tenantId: req.tenantId,
          candidateId: id,
          fromStage: cand.currentStage,
          toStage: "hired",
          note: `Converted to employee ${employeeNumber}`,
          changedBy: "Admin",
        });

        // Auto-seed onboarding checklist + mandatory training
        const onboardingRows = buildOnboardingTaskRows(emp.id, startDate, req.tenantId);
        if (onboardingRows.length > 0) {
          await tx.insert(onboardingTasksTable).values(onboardingRows);
        }
        const trainingRows = buildMandatoryTrainingRows(emp.id, req.tenantId);
        if (trainingRows.length > 0) {
          await tx.insert(trainingRecordsTable).values(trainingRows);
        }

        return { ok: true, employee: emp, cand };
      });
      if (outcome.ok || !isUniqueViolation(lastError)) break;
    } catch (err) {
      lastError = err;
      if (!isUniqueViolation(err)) throw err;
      req.log.warn({ err, attempt }, "Employee number collision during conversion, retrying");
      outcome = null;
    }
  }

  if (!outcome) {
    req.log.error({ err: lastError }, "Failed conversion after retries");
    res.status(500).json({ error: "Failed to allocate employee number, please retry" });
    return;
  }
  if (!outcome.ok) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }
  const { employee, cand } = outcome;

  await logActivity(
    "hire",
    "candidate",
    id,
    `Hired ${cand.firstName} ${cand.lastName} as ${employee.jobTitle} (${employee.employeeNumber})`,
    "Admin",
    req.tenantId,
  );

  res.status(201).json({
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    jobTitle: employee.jobTitle,
    department: employee.department,
    status: employee.status,
    employmentType: employee.employmentType,
    startDate: employee.startDate,
    endDate: employee.endDate,
    salary: employee.salary !== null ? Number(employee.salary) : null,
    currency: employee.currency,
    dateOfBirth: employee.dateOfBirth,
    addressLine1: employee.addressLine1,
    addressLine2: employee.addressLine2,
    city: employee.city,
    postcode: employee.postcode,
    country: employee.country,
    emergencyName: employee.emergencyName,
    emergencyRelationship: employee.emergencyRelationship,
    emergencyPhone: employee.emergencyPhone,
    notes: employee.notes,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  });
});

export default router;
