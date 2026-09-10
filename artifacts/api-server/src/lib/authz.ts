import type { Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, employeesTable, jobsTable } from "@workspace/db";

/**
 * Authorization helpers shared by route handlers. The central `authorize`
 * middleware enforces coarse-grained access (which role may hit which path);
 * these helpers enforce fine-grained *ownership* inside the handlers (which
 * specific rows a non-admin may read or act on).
 */

/** Send a 403 with a stable error code the frontend can branch on. */
export function forbidden(res: Response, message = "You do not have access to this resource") {
  res.status(403).json({ error: "forbidden", message });
}

/**
 * The whitelist of employee fields a non-admin may edit on **their own** record
 * via `PATCH /employees/:id`. Deliberately excludes identity, employment and pay
 * fields (firstName, lastName, email, jobTitle, department, status,
 * employmentType, managerId, startDate, endDate, salary, currency, dateOfBirth,
 * notes) — those stay admin-only. Covers contact, address and emergency details.
 */
export const SELF_EDITABLE_EMPLOYEE_FIELDS = [
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "postcode",
  "country",
  "emergencyName",
  "emergencyRelationship",
  "emergencyPhone",
] as const;

const SELF_EDITABLE_SET: ReadonlySet<string> = new Set(SELF_EDITABLE_EMPLOYEE_FIELDS);

/** Whether a given employee field key is self-editable by a non-admin. */
export function isSelfEditableEmployeeField(key: string): boolean {
  return SELF_EDITABLE_SET.has(key);
}

/**
 * Whether the requesting user may read the given employee's record. Admins can
 * read anyone; everyone else may only read their own linked record.
 */
export function canViewEmployee(
  appUser: Express.AppUserContext | undefined,
  employeeId: number,
): boolean {
  if (!appUser) return false;
  if (appUser.role === "admin") return true;
  return appUser.employeeId === employeeId;
}

/**
 * Whether `targetEmployeeId` is a direct report of `managerEmployeeId` within
 * the tenant (i.e. the target's `managerId` points at the manager).
 */
export async function isDirectReport(
  tenantId: string,
  managerEmployeeId: number,
  targetEmployeeId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ managerId: employeesTable.managerId })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.tenantId, tenantId),
        eq(employeesTable.id, targetEmployeeId),
      ),
    );
  return !!row && row.managerId === managerEmployeeId;
}

/**
 * IDs of a manager's direct reports within the tenant (the employees whose
 * `managerId` points at the manager's own employee record).
 */
export async function directReportIds(
  tenantId: string,
  managerEmployeeId: number,
): Promise<number[]> {
  const rows = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.tenantId, tenantId),
        eq(employeesTable.managerId, managerEmployeeId),
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * Whether the requesting user may read the given employee's record, including a
 * manager reading one of their direct reports. Admins can read anyone; an
 * employee may read only their own record; a manager may read their own record
 * and any direct report's. Async because the direct-report check hits the DB.
 */
export async function canViewEmployeeOrReport(
  appUser: Express.AppUserContext | undefined,
  employeeId: number,
  tenantId: string,
): Promise<boolean> {
  if (!appUser) return false;
  if (appUser.role === "admin") return true;
  if (appUser.employeeId === null) return false;
  if (appUser.employeeId === employeeId) return true;
  if (appUser.role === "manager") {
    return isDirectReport(tenantId, appUser.employeeId, employeeId);
  }
  return false;
}

/**
 * IDs of the jobs a manager owns (their employee record is the job's
 * `hiringManagerId`) within the tenant.
 */
export async function ownedJobIds(
  tenantId: string,
  managerEmployeeId: number,
): Promise<number[]> {
  const rows = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.tenantId, tenantId),
        eq(jobsTable.hiringManagerId, managerEmployeeId),
      ),
    );
  return rows.map((r) => r.id);
}
