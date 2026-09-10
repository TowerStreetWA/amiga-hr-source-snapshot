-- Phase B, step 6 (TENANT-LEADING INDEXES): every hot lookup in this app filters
-- by tenant first (after Phase B.5 wiring), so each index is (tenant_id, <hot
-- cols>). These match the index() declarations in the Drizzle schema 1:1 — the
-- schema lets `drizzle-kit push` create them (non-concurrently, fine on an empty
-- or fresh DB); this file is the safe path for an EXISTING populated DB.
--
-- !!! RUN THIS FILE OUTSIDE drizzle-kit migrate !!!
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and
-- drizzle-kit migrate wraps each migration file in a single transaction. Running
-- this file through `migrate` will fail with
--   "CREATE INDEX CONCURRENTLY cannot run inside a transaction block".
-- Apply it manually instead, e.g.:
--   psql "$DATABASE_URL" -f lib/db/migrations/0007_phase_b_tenant_indexes.sql
-- It is kept as a numbered migration for documentation/ordering, and is listed in
-- the PR's manual-steps section. On a fresh DB, `push` already created these from
-- the schema, so this is a no-op there (IF NOT EXISTS guards every statement).
--
-- CONCURRENTLY = no ACCESS EXCLUSIVE lock; reads/writes continue while the index
-- builds. Each statement is independent (no --> statement-breakpoint joining them
-- into one tx).
--
-- DOWN (manual rollback): DROP INDEX CONCURRENTLY IF EXISTS "<name>"; for each.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "employees_tenant_email_idx"
  ON "employees" ("tenant_id", "email");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "employees_tenant_status_idx"
  ON "employees" ("tenant_id", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "salary_changes_tenant_employee_idx"
  ON "salary_changes" ("tenant_id", "employee_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "employee_documents_tenant_employee_idx"
  ON "employee_documents" ("tenant_id", "employee_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "activity_log_tenant_created_at_idx"
  ON "activity_log" ("tenant_id", "created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "candidates_tenant_stage_idx"
  ON "candidates" ("tenant_id", "current_stage");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "candidates_tenant_job_idx"
  ON "candidates" ("tenant_id", "job_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "candidate_documents_tenant_candidate_idx"
  ON "candidate_documents" ("tenant_id", "candidate_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "candidate_stage_history_tenant_candidate_idx"
  ON "candidate_stage_history" ("tenant_id", "candidate_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "interviews_tenant_candidate_idx"
  ON "interviews" ("tenant_id", "candidate_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "offers_tenant_candidate_idx"
  ON "offers" ("tenant_id", "candidate_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "leave_requests_tenant_employee_start_idx"
  ON "leave_requests" ("tenant_id", "employee_id", "start_date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sickness_absences_tenant_employee_start_idx"
  ON "sickness_absences" ("tenant_id", "employee_id", "start_date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "training_records_tenant_employee_idx"
  ON "training_records" ("tenant_id", "employee_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "onboarding_tasks_tenant_employee_idx"
  ON "onboarding_tasks" ("tenant_id", "employee_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "employee_benefits_tenant_employee_idx"
  ON "employee_benefits" ("tenant_id", "employee_id");
