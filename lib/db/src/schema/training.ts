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

export const trainingRecordsTable = pgTable(
  "training_records",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, employee_id) -> employees(tenant_id, id)
    // ON DELETE CASCADE, declared below.
    employeeId: integer("employee_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("mandatory"),
    provider: text("provider"),
    completedDate: date("completed_date"),
    expiryDate: date("expiry_date"),
    status: text("status").notNull().default("pending"),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("GBP"),
    certificateObjectPath: text("certificate_object_path"),
    notes: text("notes"),
    isMandatory: boolean("is_mandatory").notNull().default(false),
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
      name: "training_records_employee_id_tenant_fk",
    }).onDelete("cascade"),
    tenantEmployeeIdx: index("training_records_tenant_employee_idx").on(
      t.tenantId,
      t.employeeId,
    ),
  }),
);

export type TrainingRecord = typeof trainingRecordsTable.$inferSelect;
export type InsertTrainingRecord = typeof trainingRecordsTable.$inferInsert;
