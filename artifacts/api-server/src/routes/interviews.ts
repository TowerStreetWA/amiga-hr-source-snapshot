import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { CreateInterviewBody, UpdateInterviewBody } from "@workspace/api-zod";
import { db, interviewsTable, candidatesTable } from "@workspace/db";
import { logActivity } from "../lib/activity";
import { serializeInterview } from "./candidates";
import { sendInterviewInvitation } from "../lib/email";

const router: IRouter = Router();

router.get("/candidates/:id/interviews", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(interviewsTable)
    .where(eq(interviewsTable.candidateId, id))
    .orderBy(desc(interviewsTable.scheduledFor));
  res.json(rows.map(serializeInterview));
});

router.post("/candidates/:id/interviews", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = CreateInterviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid interview data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const scheduledFor = new Date(data.scheduledFor);
  const [created] = await db
    .insert(interviewsTable)
    .values({
      tenantId: req.tenantId,
      candidateId: id,
      type: data.type,
      scheduledFor,
      durationMinutes: data.durationMinutes ?? 30,
      location: data.location ?? null,
      interviewerName: data.interviewerName,
      status: "scheduled",
    })
    .returning();
  const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
  if (cand) {
    await logActivity(
      "interview_scheduled",
      "candidate",
      id,
      `Scheduled ${data.type.replace(/_/g, " ")} interview for ${cand.firstName} ${cand.lastName}`,
      "Admin",
      req.tenantId,
    );
    if (cand.email) {
      const when = scheduledFor.toUTCString();
      void sendInterviewInvitation({
        to: cand.email,
        candidateName: `${cand.firstName} ${cand.lastName}`,
        jobTitle: cand.currentRole ?? "the role",
        scheduledAt: when,
        durationMinutes: data.durationMinutes ?? 30,
        format: data.type.replace(/_/g, " "),
        location: data.location ?? null,
      }).catch((err) => req.log.error({ err }, "interview invitation email failed"));
    }
  }
  res.status(201).json(serializeInterview(created));
});

router.patch("/interviews/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateInterviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid interview data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const updates: Partial<typeof interviewsTable.$inferInsert> = {};
  if (data.scheduledFor !== undefined) {
    updates.scheduledFor = new Date(data.scheduledFor);
  }
  if (data.durationMinutes !== undefined) updates.durationMinutes = data.durationMinutes;
  if (data.location !== undefined) updates.location = data.location;
  if (data.interviewerName !== undefined) updates.interviewerName = data.interviewerName;
  if (data.status !== undefined) {
    updates.status = data.status;
    if (data.status === "completed" && !data.outcome) {
      // allow status change without outcome
    }
    if (data.status === "completed") updates.completedAt = new Date();
  }
  if (data.outcome !== undefined) updates.outcome = data.outcome;
  if (data.score !== undefined) updates.score = data.score;
  if (data.feedback !== undefined) updates.feedback = data.feedback;

  const [updated] = await db.update(interviewsTable).set(updates).where(eq(interviewsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Interview not found" });
    return;
  }
  if (data.status === "completed" && data.outcome) {
    const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, updated.candidateId));
    if (cand) {
      await logActivity(
        "interview_completed",
        "candidate",
        updated.candidateId,
        `${cand.firstName} ${cand.lastName} interview marked ${data.outcome}${data.score ? ` (${data.score}/5)` : ""}`,
        "Admin",
        req.tenantId,
      );
    }
  }
  res.json(serializeInterview(updated));
});

router.delete("/interviews/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [removed] = await db.delete(interviewsTable).where(eq(interviewsTable.id, id)).returning();
  if (!removed) {
    res.status(404).json({ error: "Interview not found" });
    return;
  }
  res.status(204).end();
});

export default router;
