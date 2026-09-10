import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  date,
  numeric,
  boolean,
  uuid,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.ts";
import { employeesTable } from "./employees.ts";

export const sicknessAbsencesTable = pgTable(
  "sickness_absences",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, employee_id) -> employees(tenant_id, id)
    // ON DELETE CASCADE, declared below.
    employeeId: integer("employee_id").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    daysLost: numeric("days_lost", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    reason: text("reason"),
    selfCertified: boolean("self_certified").notNull().default(true),
    fitNoteReceived: boolean("fit_note_received").notNull().default(false),
    fitNoteExpiry: date("fit_note_expiry"),
    returnToWorkCompleted: boolean("return_to_work_completed")
      .notNull()
      .default(false),
    returnToWorkDate: date("return_to_work_date"),
    notes: text("notes"),
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
      name: "sickness_absences_employee_id_tenant_fk",
    }).onDelete("cascade"),
    tenantEmployeeStartIdx: index(
      "sickness_absences_tenant_employee_start_idx",
    ).on(t.tenantId, t.employeeId, t.startDate),
  }),
);

export type SicknessAbsence = typeof sicknessAbsencesTable.$inferSelect;
export type InsertSicknessAbsence = typeof sicknessAbsencesTable.$inferInsert;
