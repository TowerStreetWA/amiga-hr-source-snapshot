import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, employeesTable } from "@workspace/db";

const router: IRouter = Router();

// GET /me — the current user's role, link status, and (if linked) a compact
// view of their employee record. Drives the role-aware frontend shell.
router.get("/me", async (req: Request, res: Response) => {
  const user = req.appUser;
  if (!user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  let employee: {
    id: number;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    department: string;
  } | null = null;

  if (user.employeeId !== null) {
    const [row] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.tenantId, req.tenantId),
          eq(employeesTable.id, user.employeeId),
        ),
      );
    if (row) {
      employee = {
        id: row.id,
        employeeNumber: row.employeeNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        jobTitle: row.jobTitle,
        department: row.department,
      };
    }
  }

  res.json({
    clerkUserId: user.clerkUserId,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
    linked: user.employeeId !== null && employee !== null,
    employee,
  });
});

export default router;
