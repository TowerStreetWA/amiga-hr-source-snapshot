-- Phase B, step 4 (TENANT-SCOPE UNIQUES): the original single-tenant schema had
-- globally-unique employee email / employee_number and a global
-- (employee_id, year, leave_type) leave uniqueness. Under multi-tenancy those
-- must be scoped to the tenant: two tenants may legitimately reuse the same
-- email, employee number, or leave row shape.
--
-- Original names (created by drizzle-kit push from inline .unique() and a
-- uniqueIndex on phase-a-scaffolding):
--   employees.email            -> CONSTRAINT "employees_email_unique"
--   employees.employee_number  -> CONSTRAINT "employees_employee_number_unique"
--   leave_entitlements (emp,year,type) -> INDEX "leave_entitlement_emp_year_type_uniq"
-- Note the first two are table CONSTRAINTs (DROP CONSTRAINT); the leave one is a
-- unique INDEX (DROP INDEX).
--
-- Safe to run after 0004: tenant_id is NOT NULL on every row, so the new
-- composite uniques can be created without NULL-key surprises.
--
-- Idempotent: DROP ... IF EXISTS, and the new uniques are added inside a DO block
-- guarded by pg_constraint / pg_class existence checks.
--
-- DOWN (manual rollback):
--   ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_tenant_email_uniq";
--   ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_tenant_number_uniq";
--   DROP INDEX IF EXISTS "leave_entitlement_emp_year_type_uniq";
--   ALTER TABLE "employees" ADD CONSTRAINT "employees_email_unique" UNIQUE ("email");
--   ALTER TABLE "employees" ADD CONSTRAINT "employees_employee_number_unique" UNIQUE ("employee_number");
--   CREATE UNIQUE INDEX "leave_entitlement_emp_year_type_uniq"
--     ON "leave_entitlements" ("employee_id","year","leave_type");

-- 1. Drop the old global uniques on employees.
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_email_unique";--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_employee_number_unique";--> statement-breakpoint

-- 2. Drop the old global leave unique index, then recreate it tenant-scoped.
--    Reusing the same index name keeps the Drizzle schema (which still calls it
--    "leave_entitlement_emp_year_type_uniq") in sync.
DROP INDEX IF EXISTS "leave_entitlement_emp_year_type_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leave_entitlement_emp_year_type_uniq"
  ON "leave_entitlements" ("tenant_id", "employee_id", "year", "leave_type");--> statement-breakpoint

-- 3. Add the new tenant-scoped uniques on employees (guarded for idempotency).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_tenant_email_uniq') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_tenant_email_uniq" UNIQUE ("tenant_id", "email");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_tenant_number_uniq') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_tenant_number_uniq" UNIQUE ("tenant_id", "employee_number");
  END IF;
END $$;
