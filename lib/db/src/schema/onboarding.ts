import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  date,
  boolean,
  uuid,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.ts";
import { employeesTable } from "./employees.ts";

export const onboardingTasksTable = pgTable(
  "onboarding_tasks",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, employee_id) -> employees(tenant_id, id)
    // ON DELETE CASCADE, declared below.
    employeeId: integer("employee_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull().default("admin"),
    dueDate: date("due_date"),
    status: text("status").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by"),
    sortOrder: integer("sort_order").notNull().default(0),
    isCustom: boolean("is_custom").notNull().default(false),
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
      name: "onboarding_tasks_employee_id_tenant_fk",
    }).onDelete("cascade"),
    tenantEmployeeIdx: index("onboarding_tasks_tenant_employee_idx").on(
      t.tenantId,
      t.employeeId,
    ),
  }),
);

export type OnboardingTask = typeof onboardingTasksTable.$inferSelect;
export type InsertOnboardingTask = typeof onboardingTasksTable.$inferInsert;
