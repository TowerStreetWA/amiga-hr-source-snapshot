-- Add an optional owning line manager ("hiring manager") to jobs so a manager
-- can be scoped to the candidates applying for the roles they own. Additive and
-- idempotent — safe to run on an existing populated DB or replay via migrate.
--
-- ON DELETE SET NULL: removing an employee never orphans or deletes a job.

ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "hiring_manager_id" integer;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_hiring_manager_id_employees_id_fk'
  ) THEN
    ALTER TABLE "jobs"
      ADD CONSTRAINT "jobs_hiring_manager_id_employees_id_fk"
      FOREIGN KEY ("hiring_manager_id") REFERENCES "employees"("id")
      ON DELETE SET NULL;
  END IF;
END$$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "jobs_tenant_hiring_manager_idx"
  ON "jobs" ("tenant_id", "hiring_manager_id");
