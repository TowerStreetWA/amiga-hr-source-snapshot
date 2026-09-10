-- Phase B, step 1 (EXPAND): add a nullable tenant_id to all 18 tenant-scoped
-- tables. Nullable first so this is a fast metadata-only change that cannot fail
-- on existing rows; migration 0003 backfills and 0004 constrains to NOT NULL.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Runs in one transaction (drizzle-kit
-- wraps each migration file in a transaction).
--
-- DOWN (manual rollback), reverse order is irrelevant for a plain column drop:
--   ALTER TABLE "<table>" DROP COLUMN IF EXISTS "tenant_id";
-- for every table below. Dropping the column also drops the FK/indexes/uniques
-- added in 0004–0007 via CASCADE-free dependency removal, so to fully revert
-- Phase B run the down steps of 0007 → 0002 in reverse.

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "salary_changes" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "candidate_documents" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "candidate_stage_history" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "onboarding_tasks" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "training_records" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "leave_entitlements" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "sickness_absences" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "benefits_catalog" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_benefits" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
