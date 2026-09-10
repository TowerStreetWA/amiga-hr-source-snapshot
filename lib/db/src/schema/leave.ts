import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  date,
  numeric,
  uuid,
  uniqueIndex,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.ts";
import { employeesTable } from "./employees.ts";

export const leaveEntitlementsTable = pgTable(
  "leave_entitlements",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, employee_id) -> employees(tenant_id, id)
    // ON DELETE CASCADE, declared below.
    employeeId: integer("employee_id").notNull(),
    year: integer("year").notNull(),
    leaveType: text("leave_type").notNull(),
    entitledDays: numeric("entitled_days", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    carriedOverDays: numeric("carried_over_days", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    usedDays: numeric("used_days", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    employeeFk: foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employeesTable.tenantId, employeesTable.id],
      name: "leave_entitlements_employee_id_tenant_fk",
    }).onDelete("cascade"),
    // Phase B: uniqueness is per-tenant. The recalcUsedDays upsert's conflict
    // target must match this composite (Phase B.5).
    uniqEmpYearType: uniqueIndex("leave_entitlement_emp_year_type_uniq").on(
      t.tenantId,
      t.employeeId,
      t.year,
      t.leaveType,
    ),
  }),
);

export const leaveRequestsTable = pgTable(
  "leave_requests",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, employee_id) -> employees(tenant_id, id)
    // ON DELETE CASCADE, declared below.
    employeeId: integer("employee_id").notNull(),
    leaveType: text("leave_type").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    workingDays: numeric("working_days", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    reason: text("reason"),
    status: text("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerNote: text("reviewer_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    employeeFk: foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employeesTable.tenantId, employeesTable.id],
      name: "leave_requests_employee_id_tenant_fk",
    }).onDelete("cascade"),
    tenantEmployeeStartIdx: index("leave_requests_tenant_employee_start_idx").on(
      t.tenantId,
      t.employeeId,
      t.startDate,
    ),
  }),
);

export type LeaveEntitlement = typeof leaveEntitlementsTable.$inferSelect;
export type InsertLeaveEntitlement = typeof leaveEntitlementsTable.$inferInsert;
export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequestsTable.$inferInsert;
