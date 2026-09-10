import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { CreateOfferBody, UpdateOfferBody } from "@workspace/api-zod";
import { db, offersTable, candidatesTable, candidateStageHistoryTable } from "@workspace/db";
import { logActivity } from "../lib/activity";
import { serializeOffer } from "./candidates";
import { sendOfferLetterNotification } from "../lib/email";

const router: IRouter = Router();

router.get("/candidates/:id/offers", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(offersTable)
    .where(eq(offersTable.candidateId, id))
    .orderBy(desc(offersTable.createdAt));
  res.json(rows.map(serializeOffer));
});

router.post("/candidates/:id/offers", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = CreateOfferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid offer data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const status = data.status ?? "sent";
  const created = await db.transaction(async (tx) => {
    const [cand] = await tx
      .select()
      .from(candidatesTable)
      .where(and(eq(candidatesTable.id, id), eq(candidatesTable.tenantId, req.tenantId)));
    if (!cand) return null;

    const [offer] = await tx
      .insert(offersTable)
      .values({
        tenantId: req.tenantId,
        candidateId: id,
        salary: String(data.salary),
        currency: data.currency ?? "GBP",
        startDate: data.startDate,
        employmentType: data.employmentType,
        contractType: data.contractType,
        benefitsNote: data.benefitsNote ?? null,
        status,
        sentAt: status === "sent" ? new Date() : null,
      })
      .returning();
    if (status === "sent") {
      if (cand.currentStage !== "offered") {
        await tx.update(candidatesTable).set({ currentStage: "offered", updatedAt: new Date() }).where(eq(candidatesTable.id, id));
        await tx.insert(candidateStageHistoryTable).values({
          tenantId: req.tenantId,
          candidateId: id,
          fromStage: cand.currentStage,
          toStage: "offered",
          note: "Offer sent",
          changedBy: "Admin",
        });
      }
    }
    return offer;
  });
  if (!created) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
  if (cand) {
    await logActivity("offer_sent", "candidate", id, `Offer ${status} to ${cand.firstName} ${cand.lastName} at ${data.currency ?? "GBP"} ${data.salary.toLocaleString()}`, "Admin", req.tenantId);
    if (status === "sent" && cand.email) {
      void sendOfferLetterNotification({
        to: cand.email,
        candidateName: `${cand.firstName} ${cand.lastName}`,
        jobTitle: cand.currentRole ?? "the role",
        salary: Number(data.salary),
        currency: data.currency ?? "GBP",
        startDate: data.startDate,
      }).catch((err) => req.log.error({ err }, "offer email failed"));
    }
  }
  res.status(201).json(serializeOffer(created));
});

router.patch("/offers/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateOfferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid offer data", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(offersTable)
      .where(and(eq(offersTable.id, id), eq(offersTable.tenantId, req.tenantId)));
    if (!existing) return null;
    const [cand] = await tx
      .select()
      .from(candidatesTable)
      .where(
        and(
          eq(candidatesTable.id, existing.candidateId),
          eq(candidatesTable.tenantId, req.tenantId),
        ),
      );
    if (!cand) return null;
    const updates: Partial<typeof offersTable.$inferInsert> = {};
    if (data.salary !== undefined) updates.salary = String(data.salary);
    if (data.currency !== undefined) updates.currency = data.currency;
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.employmentType !== undefined) updates.employmentType = data.employmentType;
    if (data.contractType !== undefined) updates.contractType = data.contractType;
    if (data.benefitsNote !== undefined) updates.benefitsNote = data.benefitsNote;
    if (data.declinedReason !== undefined) updates.declinedReason = data.declinedReason;
    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === "sent" && !existing.sentAt) updates.sentAt = new Date();
      if (["accepted", "declined", "withdrawn"].includes(data.status)) updates.respondedAt = new Date();
    }
    const [row] = await tx.update(offersTable).set(updates).where(eq(offersTable.id, id)).returning();

    if (data.status === "accepted" || data.status === "declined") {
      // "accepted" -> awaiting onboarding (offer_pending in our enum represents accepted-pending-start)
      // we'll actually keep "offered" until conversion, so use a fitting target:
      const target = data.status === "accepted" ? "offered" : "rejected";
      if (cand.currentStage !== target) {
        await tx.update(candidatesTable).set({
          currentStage: target,
          rejectedReason: data.status === "declined" ? (data.declinedReason ?? "Offer declined") : cand.rejectedReason,
          updatedAt: new Date(),
        }).where(and(eq(candidatesTable.id, existing.candidateId), eq(candidatesTable.tenantId, req.tenantId)));
        await tx.insert(candidateStageHistoryTable).values({
          tenantId: req.tenantId,
          candidateId: existing.candidateId,
          fromStage: cand.currentStage,
          toStage: target,
          note: data.status === "accepted" ? "Offer accepted" : `Offer declined: ${data.declinedReason ?? "no reason given"}`,
          changedBy: "Admin",
        });
      }
    }
    return row;
  });
  if (!updated) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  if (data.status === "accepted" || data.status === "declined") {
    const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, updated.candidateId));
    if (cand) {
      await logActivity(
        `offer_${data.status}`,
        "candidate",
        updated.candidateId,
        `${cand.firstName} ${cand.lastName} ${data.status} the offer`,
        "Admin",
        req.tenantId,
      );
    }
  }
  res.json(serializeOffer(updated));
});

router.delete("/offers/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [removed] = await db
    .delete(offersTable)
    .where(and(eq(offersTable.id, id), eq(offersTable.tenantId, req.tenantId)))
    .returning();
  if (!removed) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  res.status(204).end();
});

export default router;
