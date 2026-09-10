-- Phase B, step 5 (COMPOSITE FKs): replace single-column foreign keys with
-- composite (tenant_id, <fk>) -> parent(tenant_id, id) keys so the database
-- itself refuses to link a child row to a parent in a different tenant. Without
-- this, a bug in application code could create cross-tenant references; with it,
-- such a write is rejected by the FK.
--
-- Prerequisites already in place:
--   * tenant_id is NOT NULL on every table (0004).
--   * parents get UNIQUE(tenant_id, id) below — required to be referenced.
--
-- ON DELETE actions are PRESERVED from the original single-column FKs:
--   salary_changes.employee_id          -> employees       CASCADE
--   employee_documents.employee_id      -> employees       CASCADE
--   leave_entitlements.employee_id      -> employees       CASCADE
--   leave_requests.employee_id          -> employees       CASCADE
--   sickness_absences.employee_id       -> employees       CASCADE
--   training_records.employee_id        -> employees       CASCADE
--   onboarding_tasks.employee_id        -> employees       CASCADE
--   employee_benefits.employee_id       -> employees       CASCADE
--   employee_benefits.benefit_id        -> benefits_catalog RESTRICT
--   candidates.job_id                   -> jobs            SET NULL
--   candidate_documents.candidate_id    -> candidates      CASCADE
--   candidate_stage_history.candidate_id-> candidates      CASCADE
--   interviews.candidate_id             -> candidates      CASCADE
--   offers.candidate_id                 -> candidates      CASCADE
--
-- NOT touched: candidates.hired_employee_id keeps its single-column SET NULL FK
-- (candidates_hired_employee_id_employees_id_fk). It is intentionally not part of
-- the composite set.
--
-- Old single-column FK names below follow drizzle-kit's convention
-- <table>_<col>_<reftable>_<refcol>_fk. DROP ... IF EXISTS makes this tolerant of
-- a DB where push created them under that exact name.
--
-- Idempotent: every DROP is IF EXISTS; every ADD is guarded by a pg_constraint
-- existence check in the DO block.
--
-- DOWN (manual rollback): drop each *_tenant_fk constraint and the
-- *_tenant_id_uniq constraints added here, then re-add the single-column FKs,
-- e.g.:
--   ALTER TABLE "salary_changes" DROP CONSTRAINT IF EXISTS "salary_changes_employee_id_tenant_fk";
--   ALTER TABLE "salary_changes" ADD CONSTRAINT "salary_changes_employee_id_employees_id_fk"
--     FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;
--   ... (repeat for each table) ...
--   ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_tenant_id_uniq"; (etc.)

-- 1. Parents must expose UNIQUE(tenant_id, id) before they can be referenced
--    compositely. (employees/jobs/candidates/benefits_catalog.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_tenant_id_uniq') THEN
    ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_uniq" UNIQUE ("tenant_id", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_tenant_id_uniq') THEN
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_uniq" UNIQUE ("tenant_id", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidates_tenant_id_uniq') THEN
    ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenant_id_uniq" UNIQUE ("tenant_id", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'benefits_catalog_tenant_id_uniq') THEN
    ALTER TABLE "benefits_catalog" ADD CONSTRAINT "benefits_catalog_tenant_id_uniq" UNIQUE ("tenant_id", "id");
  END IF;
END $$;--> statement-breakpoint

-- 2. Drop the old single-column FKs that are becoming composite.
ALTER TABLE "salary_changes" DROP CONSTRAINT IF EXISTS "salary_changes_employee_id_employees_id_fk";--> statement-breakpoint
ALTER TABLE "employee_documents" DROP CONSTRAINT IF EXISTS "employee_documents_employee_id_employees_id_fk";--> statement-breakpoint
ALTER TABLE "leave_entitlements" DROP CONSTRAINT IF EXISTS "leave_entitlements_employee_id_employees_id_fk";--> statement-breakpoint
ALTER TABLE "leave_requests" DROP CONSTRAINT IF EXISTS "leave_requests_employee_id_employees_id_fk";--> statement-breakpoint
ALTER TABLE "sickness_absences" DROP CONSTRAINT IF EXISTS "sickness_absences_employee_id_employees_id_fk";--> statement-breakpoint
ALTER TABLE "training_records" DROP CONSTRAINT IF EXISTS "training_records_employee_id_employees_id_fk";--> statement-breakpoint
ALTER TABLE "onboarding_tasks" DROP CONSTRAINT IF EXISTS "onboarding_tasks_employee_id_employees_id_fk";--> statement-breakpoint
ALTER TABLE "employee_benefits" DROP CONSTRAINT IF EXISTS "employee_benefits_employee_id_employees_id_fk";--> statement-breakpoint
ALTER TABLE "employee_benefits" DROP CONSTRAINT IF EXISTS "employee_benefits_benefit_id_benefits_catalog_id_fk";--> statement-breakpoint
ALTER TABLE "candidates" DROP CONSTRAINT IF EXISTS "candidates_job_id_jobs_id_fk";--> statement-breakpoint
ALTER TABLE "candidate_documents" DROP CONSTRAINT IF EXISTS "candidate_documents_candidate_id_candidates_id_fk";--> statement-breakpoint
ALTER TABLE "candidate_stage_history" DROP CONSTRAINT IF EXISTS "candidate_stage_history_candidate_id_candidates_id_fk";--> statement-breakpoint
ALTER TABLE "interviews" DROP CONSTRAINT IF EXISTS "interviews_candidate_id_candidates_id_fk";--> statement-breakpoint
ALTER TABLE "offers" DROP CONSTRAINT IF EXISTS "offers_candidate_id_candidates_id_fk";--> statement-breakpoint

-- 3. Add composite FKs, preserving each original ON DELETE action.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_changes_employee_id_tenant_fk') THEN
    ALTER TABLE "salary_changes" ADD CONSTRAINT "salary_changes_employee_id_tenant_fk"
      FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_documents_employee_id_tenant_fk') THEN
    ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_tenant_fk"
      FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_entitlements_employee_id_tenant_fk') THEN
    ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_employee_id_tenant_fk"
      FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_employee_id_tenant_fk') THEN
    ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_tenant_fk"
      FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sickness_absences_employee_id_tenant_fk') THEN
    ALTER TABLE "sickness_absences" ADD CONSTRAINT "sickness_absences_employee_id_tenant_fk"
      FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_records_employee_id_tenant_fk') THEN
    ALTER TABLE "training_records" ADD CONSTRAINT "training_records_employee_id_tenant_fk"
      FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_tasks_employee_id_tenant_fk') THEN
    ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_employee_id_tenant_fk"
      FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_benefits_employee_id_tenant_fk') THEN
    ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_employee_id_tenant_fk"
      FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_benefits_benefit_id_tenant_fk') THEN
    ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_benefit_id_tenant_fk"
      FOREIGN KEY ("tenant_id","benefit_id") REFERENCES "benefits_catalog"("tenant_id","id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidates_job_id_tenant_fk') THEN
    ALTER TABLE "candidates" ADD CONSTRAINT "candidates_job_id_tenant_fk"
      FOREIGN KEY ("tenant_id","job_id") REFERENCES "jobs"("tenant_id","id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_documents_candidate_id_tenant_fk') THEN
    ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_candidate_id_tenant_fk"
      FOREIGN KEY ("tenant_id","candidate_id") REFERENCES "candidates"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_stage_history_candidate_id_tenant_fk') THEN
    ALTER TABLE "candidate_stage_history" ADD CONSTRAINT "candidate_stage_history_candidate_id_tenant_fk"
      FOREIGN KEY ("tenant_id","candidate_id") REFERENCES "candidates"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interviews_candidate_id_tenant_fk') THEN
    ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_tenant_fk"
      FOREIGN KEY ("tenant_id","candidate_id") REFERENCES "candidates"("tenant_id","id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offers_candidate_id_tenant_fk') THEN
    ALTER TABLE "offers" ADD CONSTRAINT "offers_candidate_id_tenant_fk"
      FOREIGN KEY ("tenant_id","candidate_id") REFERENCES "candidates"("tenant_id","id") ON DELETE CASCADE;
  END IF;
END $$;
