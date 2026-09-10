import {
  pgTable,
  serial,
  text,
  timestamp,
  numeric,
  integer,
  date,
  uuid,
  unique,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.ts";

export const employeesTable = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    employeeNumber: text("employee_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    jobTitle: text("job_title").notNull(),
    department: text("department").notNull(),
    status: text("status").notNull().default("active"),
    employmentType: text("employment_type").notNull().default("full_time"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    salary: numeric("salary", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("GBP"),
    dateOfBirth: date("date_of_birth"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    postcode: text("postcode"),
    country: text("country"),
    emergencyName: text("emergency_name"),
    emergencyRelationship: text("emergency_relationship"),
    emergencyPhone: text("emergency_phone"),
    notes: text("notes"),
    // Self-referencing line manager. Composite FK (tenant_id, manager_id) ->
    // employees(tenant_id, id) declared below. Drives manager→team leave
    // approvals in the RBAC layer.
    managerId: integer("manager_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Phase B: email and employee_number are unique *within a tenant*, not
    // globally — two tenants may each have an alice@ or an AMG0001.
    emailUniq: unique("employees_tenant_email_uniq").on(t.tenantId, t.email),
    employeeNumberUniq: unique("employees_tenant_number_uniq").on(
      t.tenantId,
      t.employeeNumber,
    ),
    // Required so child tables can reference (tenant_id, id) as a composite FK.
    tenantIdUniq: unique("employees_tenant_id_uniq").on(t.tenantId, t.id),
    // Self-referencing line-manager FK. Composite so a manager can only be
    // another employee in the same tenant.
    managerFk: foreignKey({
      columns: [t.tenantId, t.managerId],
      foreignColumns: [t.tenantId, t.id],
      name: "employees_manager_id_tenant_fk",
    }).onDelete("set null"),
    tenantManagerIdx: index("employees_tenant_manager_idx").on(
      t.tenantId,
      t.managerId,
    ),
    tenantEmailIdx: index("employees_tenant_email_idx").on(t.tenantId, t.email),
    tenantStatusIdx: index("employees_tenant_status_idx").on(
      t.tenantId,
      t.status,
    ),
  }),
);

export const salaryChangesTable = pgTable(
  "salary_changes",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, employee_id) -> employees(tenant_id, id)
    // ON DELETE CASCADE, declared below. This blocks cross-tenant references.
    employeeId: integer("employee_id").notNull(),
    previousSalary: numeric("previous_salary", { precision: 12, scale: 2 }),
    newSalary: numeric("new_salary", { precision: 12, scale: 2 }).notNull(),
    percentChange: numeric("percent_change", { precision: 6, scale: 2 }),
    effectiveDate: date("effective_date").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    employeeFk: foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employeesTable.tenantId, employeesTable.id],
      name: "salary_changes_employee_id_tenant_fk",
    }).onDelete("cascade"),
    tenantEmployeeIdx: index("salary_changes_tenant_employee_idx").on(
      t.tenantId,
      t.employeeId,
    ),
  }),
);

export const employeeDocumentsTable = pgTable(
  "employee_documents",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, employee_id) -> employees(tenant_id, id)
    // ON DELETE CASCADE, declared below.
    employeeId: integer("employee_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    objectPath: text("object_path").notNull(),
    fileSize: integer("file_size"),
    mimeType: text("mime_type"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    employeeFk: foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employeesTable.tenantId, employeesTable.id],
      name: "employee_documents_employee_id_tenant_fk",
    }).onDelete("cascade"),
    tenantEmployeeIdx: index("employee_documents_tenant_employee_idx").on(
      t.tenantId,
      t.employeeId,
    ),
  }),
);

export const activityLogTable = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    summary: text("summary").notNull(),
    actor: text("actor"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantCreatedAtIdx: index("activity_log_tenant_created_at_idx").on(
      t.tenantId,
      t.createdAt,
    ),
  }),
);

export type Employee = typeof employeesTable.$inferSelect;
export type InsertEmployee = typeof employeesTable.$inferInsert;
export type SalaryChange = typeof salaryChangesTable.$inferSelect;
export type EmployeeDocument = typeof employeeDocumentsTable.$inferSelect;
export type ActivityLog = typeof activityLogTable.$inferSelect;
