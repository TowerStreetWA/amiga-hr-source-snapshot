import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  CreateSicknessAbsenceBody,
  UpdateSicknessAbsenceBody,
} from "@workspace/api-zod";
import {
  db,
  employeesTable,
  sicknessAbsencesTable,
} from "@workspace/db";
import { logActivity } from "../lib/activity";
import { canViewEmployeeOrReport, directReportIds, forbidden } from "../lib/authz";
import { bradfordScore, riskBand } from "../lib/bradford";
import { todayIsoDate } from "../lib/workingDays";

const router: IRouter = Router();

type AbsenceRow = typeof sicknessAbsencesTable.$inferSelect;

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

function calcDaysLost(start: string, end: string | null | undefined): number {
  if (!end) return 0;
  const s = new Date(start + "T00:00:00.000Z");
  const e = new Date(end + "T00:00:00.000Z");
  if (e < s) return 0;
  return Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function serializeAbsence(row: AbsenceRow) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    startDate: row.startDate,
    endDate: row.endDate,
    daysLost: num(row.daysLost),
    reason: row.reason,
    selfCertified: row.selfCertified,
    fitNoteReceived: row.fitNoteReceived,
    fitNoteExpiry: row.fitNoteExpiry,
    returnToWorkCompleted: row.returnToWorkCompleted,
    returnToWorkDate: row.returnToWorkDate,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/sickness", async (req: Request, res: Response) => {
  // Role scoping: admins see all; managers see their team + themselves;
  // employees never reach this list (not on the allowlist).
  const user = req.appUser;
  const conditions = [];
  if (user && user.role !== "admin") {
    if (user.employeeId === null) {
      res.json([]);
      return;
    }
    if (user.role === "manager") {
      const reports = await directReportIds(req.tenantId, user.employeeId);
      const visibleIds = [user.employeeId, ...reports];
      conditions.push(inArray(sicknessAbsencesTable.employeeId, visibleIds));
    } else {
      conditions.push(eq(sicknessAbsencesTable.employeeId, user.employeeId));
    }
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({ absence: sicknessAbsencesTable, employee: employeesTable })
    .from(sicknessAbsencesTable)
    .innerJoin(employeesTable, eq(sicknessAbsencesTable.employeeId, employeesTable.id))
    .where(where)
    .orderBy(desc(sicknessAbsencesTable.startDate));

  // Group by employee for bradford
  const byEmp = new Map<number, AbsenceRow[]>();
  for (const r of rows) {
    const arr = byEmp.get(r.absence.employeeId) ?? [];
    arr.push(r.absence);
    byEmp.set(r.absence.employeeId, arr);
  }
  const scoreByEmp = new Map<number, number>();
  for (const [empId, list] of byEmp.entries()) {
    scoreByEmp.set(empId, bradfordScore(list));
  }

  res.json(
    rows.map((r) => {
      const score = scoreByEmp.get(r.absence.employeeId) ?? 0;
      return {
        ...serializeAbsence(r.absence),
        employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
        employeeNumber: r.employee.employeeNumber,
        department: r.employee.department,
        bradfordScore: score,
        riskBand: riskBand(score),
      };
    }),
  );
});

router.get("/sickness/employees/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await canViewEmployeeOrReport(req.appUser, id, req.tenantId))) {
    forbidden(res);
    return;
  }
  const today = todayIsoDate();
  const cutoff = new Date(today + "T00:00:00.000Z");
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(sicknessAbsencesTable)
    .where(eq(sicknessAbsencesTable.employeeId, id))
    .orderBy(desc(sicknessAbsencesTable.startDate));

  const score = bradfordScore(rows);
  const window = rows.filter((r) => r.startDate >= cutoffIso);
  const daysWindow = window.reduce((s, r) => s + num(r.daysLost), 0);
  const totalDays = rows.reduce((s, r) => s + num(r.daysLost), 0);
  const currentlyOff = rows.some(
    (r) => r.startDate <= today && (!r.endDate || r.endDate >= today),
  );

  res.json({
    employeeId: id,
    bradfordScore: score,
    riskBand: riskBand(score),
    episodesLast12Months: window.length,
    daysLostLast12Months: daysWindow,
    totalEpisodes: rows.length,
    totalDaysLost: totalDays,
    currentlyOff,
    absences: rows.map(serializeAbsence),
  });
});

router.post("/sickness/employees/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = CreateSicknessAbsenceBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid sickness absence", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const [emp] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, id));
  if (!emp) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const daysLost = calcDaysLost(data.startDate, data.endDate ?? null);

  const [created] = await db
    .insert(sicknessAbsencesTable)
    .values({
      tenantId: req.tenantId,
      employeeId: id,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      daysLost: String(daysLost),
      reason: data.reason ?? null,
      selfCertified: data.selfCertified ?? true,
      fitNoteReceived: data.fitNoteReceived ?? false,
      fitNoteExpiry: data.fitNoteExpiry ?? null,
      returnToWorkCompleted: data.returnToWorkCompleted ?? false,
      returnToWorkDate: data.returnToWorkDate ?? null,
      notes: data.notes ?? null,
    })
    .returning();

  await logActivity(
    "sickness_logged",
    "employee",
    id,
    `Sickness absence logged from ${data.startDate}${data.endDate ? ` to ${data.endDate}` : " (ongoing)"}`,
    "Admin",
    req.tenantId,
  );
  res.status(201).json(serializeAbsence(created));
});

router.patch(
  "/sickness-absences/:absenceId",
  async (req: Request, res: Response) => {
    const absenceId = Number(req.params.absenceId);
    if (!Number.isFinite(absenceId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateSicknessAbsenceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid update", details: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    const [existing] = await db
      .select()
      .from(sicknessAbsencesTable)
      .where(eq(sicknessAbsencesTable.id, absenceId));
    if (!existing) {
      res.status(404).json({ error: "Absence not found" });
      return;
    }

    const newStart = data.startDate ?? existing.startDate;
    const newEnd =
      data.endDate !== undefined ? data.endDate : existing.endDate;
    const updates: Partial<typeof sicknessAbsencesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.endDate !== undefined) updates.endDate = data.endDate;
    if (data.startDate !== undefined || data.endDate !== undefined) {
      if (newEnd && newEnd < newStart) {
        res.status(400).json({ error: "End date must be on or after start date" });
        return;
      }
      updates.daysLost = String(calcDaysLost(newStart, newEnd ?? null));
    }
    if (data.reason !== undefined) updates.reason = data.reason;
    if (data.selfCertified !== undefined) updates.selfCertified = data.selfCertified;
    if (data.fitNoteReceived !== undefined)
      updates.fitNoteReceived = data.fitNoteReceived;
    if (data.fitNoteExpiry !== undefined) updates.fitNoteExpiry = data.fitNoteExpiry;
    if (data.returnToWorkCompleted !== undefined)
      updates.returnToWorkCompleted = data.returnToWorkCompleted;
    if (data.returnToWorkDate !== undefined)
      updates.returnToWorkDate = data.returnToWorkDate;
    if (data.notes !== undefined) updates.notes = data.notes;

    const [updated] = await db
      .update(sicknessAbsencesTable)
      .set(updates)
      .where(eq(sicknessAbsencesTable.id, absenceId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Absence not found" });
      return;
    }
    res.json(serializeAbsence(updated));
  },
);

router.delete(
  "/sickness-absences/:absenceId",
  async (req: Request, res: Response) => {
    const absenceId = Number(req.params.absenceId);
    if (!Number.isFinite(absenceId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [removed] = await db
      .delete(sicknessAbsencesTable)
      .where(eq(sicknessAbsencesTable.id, absenceId))
      .returning();
    if (!removed) {
      res.status(404).json({ error: "Absence not found" });
      return;
    }
    res.status(204).end();
  },
);

// Suppress unused warning for `and` import (kept for consistency / future filters)
void and;

export default router;
