import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { db, employeesTable, salaryChangesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  buildTemplateBuffer,
  parseImportFile,
  validateImportRow,
  highestEmployeeSequence,
  nextEmployeeNumber,
  type ImportRowParsed,
} from "../lib/importEmployees";
import { sendWelcomeEmail } from "../lib/email";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

router.get("/import/template", (_req: Request, res: Response) => {
  const buffer = buildTemplateBuffer();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="amiga-employee-import-template.xlsx"',
  );
  res.send(buffer);
});

router.post(
  "/import/preview",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded (field name: 'file')" });
      return;
    }
    const parsed = parseImportFile(file.buffer, file.originalname);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const existing = await db.select({ email: employeesTable.email }).from(employeesTable);
    const existingEmails = new Set(existing.map((e) => e.email.toLowerCase()));
    // Pre-count emails so duplicates are flagged on every offending row
    // (not just the second occurrence), regardless of other validation errors.
    const fileEmailCounts = new Map<string, number>();
    for (const row of parsed.rows) {
      const e = (row.email ?? "").trim().toLowerCase();
      if (e) fileEmailCounts.set(e, (fileEmailCounts.get(e) ?? 0) + 1);
    }
    const duplicatedInFile = new Set(
      [...fileEmailCounts.entries()].filter(([, n]) => n > 1).map(([e]) => e),
    );
    const seenEmails = new Set<string>();
    const rows = parsed.rows.map((row, idx) => {
      const result = validateImportRow(row, idx + 2, existingEmails, seenEmails);
      const e = (row.email ?? "").trim().toLowerCase();
      if (
        e &&
        duplicatedInFile.has(e) &&
        !result.errors.some((m) => m.toLowerCase().includes("duplicat"))
      ) {
        const errs = [...result.errors, "Email is duplicated in this file"];
        return {
          rowNumber: result.rowNumber,
          status: "error" as const,
          data: result.data,
          errors: errs,
        };
      }
      return result;
    });
    const valid = rows.filter((r) => r.status === "ok").length;
    const invalid = rows.length - valid;
    res.json({
      summary: { total: rows.length, valid, invalid },
      rows,
    });
  },
);

router.post("/import/commit", async (req: Request, res: Response) => {
  const body = req.body as {
    rows?: unknown;
    sendWelcomeEmails?: boolean;
    temporaryPassword?: string | null;
  };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    res.status(400).json({ error: "No rows to import" });
    return;
  }
  // Re-validate server-side from the structured row shape we expect.
  const existing = await db
    .select({ email: employeesTable.email, employeeNumber: employeesTable.employeeNumber })
    .from(employeesTable);
  const existingEmails = new Set(existing.map((e) => e.email.toLowerCase()));
  // (Employee number allocation moved inside the transaction below.)

  // Pre-count emails to flag in-file duplicates on every offending row.
  const submittedRows = body.rows as Array<Record<string, unknown>>;
  const fileEmailCounts = new Map<string, number>();
  for (const r of submittedRows) {
    const e = stringOr(r.email)?.trim().toLowerCase();
    if (e) fileEmailCounts.set(e, (fileEmailCounts.get(e) ?? 0) + 1);
  }
  const duplicatedInFile = new Set(
    [...fileEmailCounts.entries()].filter(([, n]) => n > 1).map(([e]) => e),
  );
  const seenEmails = new Set<string>();

  const validRows: ImportRowParsed[] = [];
  const skipped: string[] = [];
  for (const raw of submittedRows) {
    // Accept both raw input shape and the parsed shape returned by /preview.
    const result = validateImportRow(
      {
        firstName: stringOr(raw.firstName),
        lastName: stringOr(raw.lastName),
        email: stringOr(raw.email),
        phone: stringOr(raw.phone),
        jobTitle: stringOr(raw.jobTitle),
        department: stringOr(raw.department),
        status: stringOr(raw.status),
        employmentType: stringOr(raw.employmentType),
        startDate: stringOr(raw.startDate),
        salary:
          raw.salary === null || raw.salary === undefined
            ? undefined
            : typeof raw.salary === "number"
              ? raw.salary
              : String(raw.salary),
        currency: stringOr(raw.currency),
        dateOfBirth: stringOr(raw.dateOfBirth),
        city: stringOr(raw.city),
        postcode: stringOr(raw.postcode),
        country: stringOr(raw.country),
      },
      0,
      existingEmails,
      seenEmails,
    );
    const emailLc = stringOr(raw.email)?.trim().toLowerCase();
    if (
      result.status === "ok" &&
      emailLc &&
      duplicatedInFile.has(emailLc)
    ) {
      // Promote to error if the email appears more than once in this submission.
      skipped.push(`${emailLc}: Email is duplicated in this file`);
      continue;
    }
    if (result.status === "ok") {
      validRows.push(result.data);
    } else {
      skipped.push(`${result.data.email ?? "(no email)"}: ${result.errors.join("; ")}`);
    }
  }

  if (validRows.length === 0) {
    res.status(400).json({ error: "No valid rows to import", skipped });
    return;
  }

  const inserted: Array<{
    id: number;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    email: string;
    salary: number | null;
    startDate: string;
  }> = [];

  await db.transaction(async (tx) => {
    // Allocate employee numbers inside the transaction so concurrent
    // imports/employee creates don't hand out the same AMG####.
    const tenantId = req.tenantId;
    // Per-tenant advisory lock: serialise number allocation against other
    // imports/creates for the same tenant only (not whole-table).
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}::text, 0))`,
    );
    const inTx = await tx
      .select({ employeeNumber: employeesTable.employeeNumber })
      .from(employeesTable)
      .where(eq(employeesTable.tenantId, tenantId));
    let nextSeq = highestEmployeeSequence(inTx.map((e) => e.employeeNumber));
    for (const row of validRows) {
      nextSeq += 1;
      const employeeNumber = nextEmployeeNumber(nextSeq - 1);
      const [emp] = await tx
        .insert(employeesTable)
        .values({
          tenantId,
          employeeNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone,
          jobTitle: row.jobTitle,
          department: row.department,
          status: row.status,
          employmentType: row.employmentType,
          startDate: row.startDate,
          salary: row.salary !== null ? String(row.salary) : null,
          currency: row.currency,
          dateOfBirth: row.dateOfBirth,
          city: row.city,
          postcode: row.postcode,
          country: row.country,
        })
        .returning();
      if (!emp) continue;
      if (row.salary !== null) {
        await tx.insert(salaryChangesTable).values({
          tenantId,
          employeeId: emp.id,
          previousSalary: null,
          newSalary: String(row.salary),
          percentChange: null,
          effectiveDate: row.startDate,
          reason: "Initial salary (bulk import)",
        });
      }
      inserted.push({
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        salary: row.salary,
        startDate: row.startDate,
      });
    }
  });

  await logActivity(
    "import",
    "employee",
    null,
    `Bulk import: ${inserted.length} employees added`,
    "Admin",
    req.tenantId,
  );

  let emailsSent = 0;
  const tempPassword =
    typeof body.temporaryPassword === "string" && body.temporaryPassword.trim().length > 0
      ? body.temporaryPassword.trim()
      : null;
  const sendEmails = body.sendWelcomeEmails === true && tempPassword !== null;
  const emailResults = new Map<number, boolean>();
  if (sendEmails) {
    // Parallel send with a hard per-email timeout so a slow SMTP server can't
    // hang the import response.
    const sendOne = async (
      emp: (typeof inserted)[number],
    ): Promise<{ id: number; sent: boolean }> => {
      try {
        const result = await Promise.race([
          sendWelcomeEmail({
            to: emp.email,
            firstName: emp.firstName,
            employeeNumber: emp.employeeNumber,
            temporaryPassword: tempPassword!,
          }),
          new Promise<{ sent: false }>((resolve) =>
            setTimeout(() => resolve({ sent: false }), 20_000),
          ),
        ]);
        return { id: emp.id, sent: result.sent };
      } catch (err) {
        req.log.error({ err, email: emp.email }, "welcome email failed");
        return { id: emp.id, sent: false };
      }
    };
    const settled = await Promise.allSettled(inserted.map(sendOne));
    for (const s of settled) {
      if (s.status === "fulfilled") {
        emailResults.set(s.value.id, s.value.sent);
        if (s.value.sent) emailsSent += 1;
      }
    }
  }

  res.json({
    imported: inserted.length,
    skipped: skipped.length,
    emailsSent,
    employees: inserted.map((e) => ({
      id: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      emailSent: emailResults.get(e.id) ?? false,
    })),
  });
});

function stringOr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  return String(v);
}

export default router;
