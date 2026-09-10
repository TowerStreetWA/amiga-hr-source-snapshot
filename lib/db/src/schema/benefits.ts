import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  date,
  timestamp,
  boolean,
  uuid,
  unique,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.ts";
import { employeesTable } from "./employees.ts";

export const BENEFIT_CATEGORIES = [
  "pension",
  "health",
  "life_assurance",
  "income_protection",
  "dental",
  "allowance",
  "other",
] as const;
export type BenefitCategory = (typeof BENEFIT_CATEGORIES)[number];

export const benefitsCatalogTable = pgTable(
  "benefits_catalog",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    provider: text("provider"),
    description: text("description"),
    defaultAnnualValue: numeric("default_annual_value", { precision: 12, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Required so employee_benefits can reference (tenant_id, benefit_id).
    tenantIdUniq: unique("benefits_catalog_tenant_id_uniq").on(t.tenantId, t.id),
  }),
);

export const employeeBenefitsTable = pgTable(
  "employee_benefits",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FKs declared below:
    //   (tenant_id, employee_id) -> employees(tenant_id, id)        ON DELETE CASCADE
    //   (tenant_id, benefit_id)  -> benefits_catalog(tenant_id, id) ON DELETE RESTRICT
    employeeId: integer("employee_id").notNull(),
    benefitId: integer("benefit_id").notNull(),
    employerContribution: numeric("employer_contribution", { precision: 12, scale: 2 }).notNull().default("0"),
    employeeContribution: numeric("employee_contribution", { precision: 12, scale: 2 }).notNull().default("0"),
    annualValue: numeric("annual_value", { precision: 12, scale: 2 }).notNull().default("0"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    employeeFk: foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employeesTable.tenantId, employeesTable.id],
      name: "employee_benefits_employee_id_tenant_fk",
    }).onDelete("cascade"),
    benefitFk: foreignKey({
      columns: [t.tenantId, t.benefitId],
      foreignColumns: [benefitsCatalogTable.tenantId, benefitsCatalogTable.id],
      name: "employee_benefits_benefit_id_tenant_fk",
    }).onDelete("restrict"),
    tenantEmployeeIdx: index("employee_benefits_tenant_employee_idx").on(
      t.tenantId,
      t.employeeId,
    ),
  }),
);

export type BenefitCatalogRow = typeof benefitsCatalogTable.$inferSelect;
export type EmployeeBenefitRow = typeof employeeBenefitsTable.$inferSelect;
