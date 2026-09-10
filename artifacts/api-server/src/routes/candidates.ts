import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  CreateCandidateBody,
  UpdateCandidateBody,
  ChangeCandidateStageBody,
  CreateCandidateDocumentBody,
} from "@workspace/api-zod";
import {
  db,
  candidatesTable,
  candidateDocumentsTable,
  candidateStageHistoryTable,
  interviewsTable,
  offersTable,
  jobsTable,
} from "@workspace/db";
import { logActivity } from "../lib/activity";
import { sendCandidateStageChange } from "../lib/email";
import { forbidden, ownedJobIds } from "../lib/authz";
import { inArray } from "drizzle-orm";

const router: IRouter = Router();

type CandidateRow = typeof candidatesTable.$inferSelect;
type DocRow = typeof candidateDocumentsTable.$inferSelect;
type HistoryRow = typeof candidateStageHistoryTable.$inferSelect;
type InterviewRow = typeof interviewsTable.$inferSelect;
type OfferRow = typeof offersTable.$inferSelect;

function serializeCandidate(row: CandidateRow, jobTitle: string | null = null) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    jobId: row.jobId,
    jobTitle,
    currentStage: row.currentStage,
    source: row.source,
    rightToWorkStatus: row.rightToWorkStatus,
    linkedinUrl: row.linkedinUrl,
    currentCompany: row.currentCompany,
    currentRole: row.currentRole,
    yearsExperience: row.yearsExperience,
    currentSalary: row.currentSalary !== null ? Number(row.currentSalary) : null,
    expectedSalary: row.expectedSalary !== null ? Number(row.expectedSalary) : null,
    noticePeriod: row.noticePeriod,
    lastBonusAmount: row.lastBonusAmount !== null ? Number(row.lastBonusAmount) : null,
    lastBonusPercentage: row.lastBonusPercentage !== null ? Number(row.lastBonusPercentage) : null,
    currentPensionPercentage: row.currentPensionPercentage !== null ? Number(row.currentPensionPercentage) : null,
    referenceOneName: row.referenceOneName,
    referenceOneCompany: row.referenceOneCompany,
    referenceOneJobTitle: row.referenceOneJobTitle,
    referenceOneEmail: row.referenceOneEmail,
    referenceOnePhone: row.referenceOnePhone,
    referenceTwoName: row.referenceTwoName,
    referenceTwoCompany: row.referenceTwoCompany,
    referenceTwoJobTitle: row.referenceTwoJobTitle,
    referenceTwoEmail: row.referenceTwoEmail,
    referenceTwoPhone: row.referenceTwoPhone,
    currency: row.currency,
    coverLetter: row.coverLetter,
    notes: row.notes,
    appliedAt: row.appliedAt.toISOString(),
    hiredEmployeeId: row.hiredEmployeeId,
    rejectedReason: row.rejectedReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeDoc(row: DocRow) {
  return {
    id: row.id,
    candidateId: row.candidateId,
    name: row.name,
    category: row.category,
    objectPath: row.objectPath,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}

function serializeHistory(row: HistoryRow) {
  return {
    id: row.id,
    candidateId: row.candidateId,
    fromStage: row.fromStage,
    toStage: row.toStage,
    note: row.note,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString(),
  };
}

export function serializeInterview(row: InterviewRow) {
  return {
    id: row.id,
    candidateId: row.candidateId,
    type: row.type,
    scheduledFor: row.scheduledFor.toISOString(),
    durationMinutes: row.durationMinutes,
    location: row.location,
    interviewerName: row.interviewerName,
    status: row.status,
    outcome: row.outcome,
    score: row.score,
    feedback: row.feedback,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeOffer(row: OfferRow) {
  return {
    id: row.id,
    candidateId: row.candidateId,
    salary: Number(row.salary),
    currency: row.currency,
    startDate: row.startDate,
    employmentType: row.employmentType,
    contractType: row.contractType,
    benefitsNote: row.benefitsNote,
    status: row.status,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
    declinedReason: row.declinedReason,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/candidates", async (req: Request, res: Response) => {
  const stage = typeof req.query.stage === "string" ? req.query.stage : undefined;
  const jobIdRaw = typeof req.query.jobId === "string" ? Number(req.query.jobId) : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;

  const conditions = [eq(candidatesTable.tenantId, req.tenantId)];
  // Role scoping: managers only see candidates on the jobs they own. Employees
  // never reach this list (not on the allowlist); admins see everything.
  const user = req.appUser;
  if (user && user.role === "manager") {
    const jobIds = user.employeeId === null
      ? []
      : await ownedJobIds(req.tenantId, user.employeeId);
    if (jobIds.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(candidatesTable.jobId, jobIds));
  }
  if (stage) conditions.push(eq(candidatesTable.currentStage, stage));
  if (jobIdRaw !== undefined && Number.isFinite(jobIdRaw)) conditions.push(eq(candidatesTable.jobId, jobIdRaw));
  if (search) {
    const term = `%${search}%`;
    const searchCondition = or(
      ilike(candidatesTable.firstName, term),
      ilike(candidatesTable.lastName, term),
      ilike(candidatesTable.email, term),
      ilike(candidatesTable.currentCompany, term),
      ilike(candidatesTable.currentRole, term),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({ candidate: candidatesTable, jobTitle: jobsTable.title })
    .from(candidatesTable)
    .leftJoin(jobsTable, eq(candidatesTable.jobId, jobsTable.id))
    .where(where)
    .orderBy(desc(candidatesTable.appliedAt));
  res.json(rows.map((r) => serializeCandidate(r.candidate, r.jobTitle)));
});

router.get("/candidates/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select({ candidate: candidatesTable, jobTitle: jobsTable.title })
    .from(candidatesTable)
    .leftJoin(jobsTable, eq(candidatesTable.jobId, jobsTable.id))
    .where(
      and(
        eq(candidatesTable.id, id),
        eq(candidatesTable.tenantId, req.tenantId),
      ),
    );
  if (!row) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  // Managers may only view candidates on the jobs they own.
  const user = req.appUser;
  if (user && user.role === "manager") {
    const jobIds = user.employeeId === null
      ? []
      : await ownedJobIds(req.tenantId, user.employeeId);
    if (row.candidate.jobId === null || !jobIds.includes(row.candidate.jobId)) {
      forbidden(res);
      return;
    }
  }
  const [docs, history, interviews, offers] = await Promise.all([
    db
      .select()
      .from(candidateDocumentsTable)
      .where(
        and(
          eq(candidateDocumentsTable.candidateId, id),
          eq(candidateDocumentsTable.tenantId, req.tenantId),
        ),
      )
      .orderBy(desc(candidateDocumentsTable.uploadedAt)),
    db
      .select()
      .from(candidateStageHistoryTable)
      .where(
        and(
          eq(candidateStageHistoryTable.candidateId, id),
          eq(candidateStageHistoryTable.tenantId, req.tenantId),
        ),
      )
      .orderBy(asc(candidateStageHistoryTable.changedAt)),
    db.select().from(interviewsTable).where(eq(interviewsTable.candidateId, id)).orderBy(desc(interviewsTable.scheduledFor)),
    db.select().from(offersTable).where(eq(offersTable.candidateId, id)).orderBy(desc(offersTable.createdAt)),
  ]);

  res.json({
    ...serializeCandidate(row.candidate, row.jobTitle),
    documents: docs.map(serializeDoc),
    stageHistory: history.map(serializeHistory),
    interviews: interviews.map(serializeInterview),
    offers: offers.map(serializeOffer),
  });
});

router.post("/candidates", async (req: Request, res: Response) => {
  const parsed = CreateCandidateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid candidate data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const stage = data.currentStage ?? "new";
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(candidatesTable)
      .values({
        tenantId: req.tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone ?? null,
        jobId: data.jobId ?? null,
        currentStage: stage,
        source: data.source ?? "manual",
        rightToWorkStatus: data.rightToWorkStatus ?? "unknown",
        linkedinUrl: data.linkedinUrl ?? null,
        currentCompany: data.currentCompany ?? null,
        currentRole: data.currentRole ?? null,
        yearsExperience: data.yearsExperience ?? null,
         currentSalary: data.currentSalary !== undefined && data.currentSalary !== null ? String(data.currentSalary) : null,
        expectedSalary: data.expectedSalary !== undefined && data.expectedSalary !== null ? String(data.expectedSalary) : null,
         noticePeriod: data.noticePeriod ?? null,
         lastBonusAmount: data.lastBonusAmount !== undefined && data.lastBonusAmount !== null ? String(data.lastBonusAmount) : null,
         lastBonusPercentage: data.lastBonusPercentage !== undefined && data.lastBonusPercentage !== null ? String(data.lastBonusPercentage) : null,
         currentPensionPercentage: data.currentPensionPercentage !== undefined && data.currentPensionPercentage !== null ? String(data.currentPensionPercentage) : null,
         referenceOneName: data.referenceOneName ?? null,
         referenceOneCompany: data.referenceOneCompany ?? null,
         referenceOneJobTitle: data.referenceOneJobTitle ?? null,
         referenceOneEmail: data.referenceOneEmail ?? null,
         referenceOnePhone: data.referenceOnePhone ?? null,
         referenceTwoName: data.referenceTwoName ?? null,
         referenceTwoCompany: data.referenceTwoCompany ?? null,
         referenceTwoJobTitle: data.referenceTwoJobTitle ?? null,
         referenceTwoEmail: data.referenceTwoEmail ?? null,
         referenceTwoPhone: data.referenceTwoPhone ?? null,
        currency: data.currency ?? "GBP",
        coverLetter: data.coverLetter ?? null,
        notes: data.notes ?? null,
      })
      .returning();
    await tx.insert(candidateStageHistoryTable).values({
      tenantId: req.tenantId,
      candidateId: row.id,
      fromStage: null,
      toStage: stage,
      note: "Application received",
      changedBy: "System",
    });
    return row;
  });
  await logActivity(
    "create",
    "candidate",
    created.id,
    `New candidate ${created.firstName} ${created.lastName}${created.jobId ? "" : ""}`,
    "Admin",
    req.tenantId,
  );
  res.status(201).json(serializeCandidate(created));
});

router.patch("/candidates/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateCandidateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid candidate data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const updates: Partial<typeof candidatesTable.$inferInsert> = { updatedAt: new Date() };
  if (data.firstName !== undefined) updates.firstName = data.firstName;
  if (data.lastName !== undefined) updates.lastName = data.lastName;
  if (data.email !== undefined) updates.email = data.email;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.jobId !== undefined) updates.jobId = data.jobId;
  if (data.rightToWorkStatus !== undefined) updates.rightToWorkStatus = data.rightToWorkStatus;
  if (data.linkedinUrl !== undefined) updates.linkedinUrl = data.linkedinUrl;
  if (data.currentCompany !== undefined) updates.currentCompany = data.currentCompany;
  if (data.currentRole !== undefined) updates.currentRole = data.currentRole;
  if (data.yearsExperience !== undefined) updates.yearsExperience = data.yearsExperience;
  if (data.currentSalary !== undefined) updates.currentSalary = data.currentSalary !== null ? String(data.currentSalary) : null;
  if (data.expectedSalary !== undefined) updates.expectedSalary = data.expectedSalary !== null ? String(data.expectedSalary) : null;
  if (data.noticePeriod !== undefined) updates.noticePeriod = data.noticePeriod;
  if (data.lastBonusAmount !== undefined) updates.lastBonusAmount = data.lastBonusAmount !== null ? String(data.lastBonusAmount) : null;
  if (data.lastBonusPercentage !== undefined) updates.lastBonusPercentage = data.lastBonusPercentage !== null ? String(data.lastBonusPercentage) : null;
  if (data.currentPensionPercentage !== undefined) updates.currentPensionPercentage = data.currentPensionPercentage !== null ? String(data.currentPensionPercentage) : null;
  if (data.referenceOneName !== undefined) updates.referenceOneName = data.referenceOneName;
  if (data.referenceOneCompany !== undefined) updates.referenceOneCompany = data.referenceOneCompany;
  if (data.referenceOneJobTitle !== undefined) updates.referenceOneJobTitle = data.referenceOneJobTitle;
  if (data.referenceOneEmail !== undefined) updates.referenceOneEmail = data.referenceOneEmail;
  if (data.referenceOnePhone !== undefined) updates.referenceOnePhone = data.referenceOnePhone;
  if (data.referenceTwoName !== undefined) updates.referenceTwoName = data.referenceTwoName;
  if (data.referenceTwoCompany !== undefined) updates.referenceTwoCompany = data.referenceTwoCompany;
  if (data.referenceTwoJobTitle !== undefined) updates.referenceTwoJobTitle = data.referenceTwoJobTitle;
  if (data.referenceTwoEmail !== undefined) updates.referenceTwoEmail = data.referenceTwoEmail;
  if (data.referenceTwoPhone !== undefined) updates.referenceTwoPhone = data.referenceTwoPhone;
  if (data.currency !== undefined && data.currency !== null) updates.currency = data.currency;
  if (data.coverLetter !== undefined) updates.coverLetter = data.coverLetter;
  if (data.notes !== undefined) updates.notes = data.notes;

  const [updated] = await db.update(candidatesTable).set(updates).where(eq(candidatesTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  res.json(serializeCandidate(updated));
});

router.delete("/candidates/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [removed] = await db.delete(candidatesTable).where(eq(candidatesTable.id, id)).returning();
  if (!removed) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  await logActivity("delete", "candidate", removed.id, `Removed candidate ${removed.firstName} ${removed.lastName}`, "Admin", req.tenantId);
  res.status(204).end();
});

router.post("/candidates/:id/stage", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = ChangeCandidateStageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid stage", details: parsed.error.issues });
    return;
  }
  const { toStage, note, rejectedReason } = parsed.data;
  if (toStage === "rejected" && !rejectedReason && !note) {
    res.status(400).json({ error: "A reason is required when rejecting a candidate." });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(candidatesTable)
      .where(and(eq(candidatesTable.id, id), eq(candidatesTable.tenantId, req.tenantId)));
    if (!current) return null;
    const [row] = await tx
      .update(candidatesTable)
      .set({
        currentStage: toStage,
        // Set rejection reason when moving to rejected; clear it when moving back to any active stage.
        rejectedReason: toStage === "rejected" ? (rejectedReason ?? note ?? null) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(candidatesTable.id, id), eq(candidatesTable.tenantId, req.tenantId)))
      .returning();
    await tx.insert(candidateStageHistoryTable).values({
      tenantId: req.tenantId,
      candidateId: id,
      fromStage: current.currentStage,
      toStage,
      note: note ?? null,
      changedBy: "Admin",
    });
    return row;
  });
  if (!updated) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  await logActivity(
    "stage_change",
    "candidate",
    updated.id,
    `${updated.firstName} ${updated.lastName} moved to ${toStage.replace(/_/g, " ")}`,
    "Admin",
    req.tenantId,
  );
  // Stage-change notification (skip for "rejected" — handled by separate offer/decline flow,
  // and we don't want to surprise candidates with an automated "rejected" email).
  if (updated.email && toStage !== "rejected") {
    void sendCandidateStageChange({
      to: updated.email,
      candidateName: `${updated.firstName} ${updated.lastName}`,
      jobTitle: updated.currentRole ?? "the role",
      newStage: toStage.replace(/_/g, " "),
    }).catch((err) => req.log.error({ err }, "stage change email failed"));
  }
  res.json(serializeCandidate(updated));
});

router.get("/candidates/:id/documents", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db.select().from(candidateDocumentsTable).where(eq(candidateDocumentsTable.candidateId, id)).orderBy(desc(candidateDocumentsTable.uploadedAt));
  res.json(rows.map(serializeDoc));
});

router.post("/candidates/:id/documents", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = CreateCandidateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid document data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const [created] = await db
    .insert(candidateDocumentsTable)
    .values({
      tenantId: req.tenantId,
      candidateId: id,
      name: data.name,
      category: data.category,
      objectPath: data.objectPath,
      fileSize: data.fileSize ?? null,
      mimeType: data.mimeType ?? null,
    })
    .returning();
  res.status(201).json(serializeDoc(created));
});

router.delete("/candidate-documents/:docId", async (req: Request, res: Response) => {
  const docId = Number(req.params.docId);
  if (!Number.isFinite(docId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [removed] = await db.delete(candidateDocumentsTable).where(eq(candidateDocumentsTable.id, docId)).returning();
  if (!removed) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.status(204).end();
});

export default router;
