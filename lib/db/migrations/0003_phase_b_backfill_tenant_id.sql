-- Phase B, step 2 (BACKFILL): attribute every existing row to the seed Amiga
-- tenant. This is the single-tenant data that predates multi-tenancy.
--
-- The seed UUID a0000000-0000-4000-8000-000000000001 matches
-- lib/db/src/constants.ts (DEFAULT_TENANT_ID) and migration
-- 0001_seed_amiga_tenant.sql. It MUST exist before this runs (it does — 0001
-- inserts it).
--
-- Idempotent: the WHERE tenant_id IS NULL guard means re-running touches no row
-- that already has a tenant.
--
-- SCALE NOTE: these are unbatched single-statement UPDATEs. That is fine for the
-- existing Amiga dataset (small). For a large table this would hold a long write
-- lock — production-scale data would need batched updates (e.g. update in
-- chunks of N ids in a loop). Called out as a future hardening item in the PR.
--
-- DOWN (manual rollback): not meaningful on its own — to revert, drop the column
-- (see 0002 down). Re-setting to NULL would only matter if 0004 had not run.

UPDATE "employees" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "salary_changes" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "employee_documents" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "activity_log" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "jobs" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "candidates" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "candidate_documents" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "candidate_stage_history" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "interviews" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "offers" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "onboarding_tasks" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "training_records" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "leave_entitlements" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "leave_requests" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "sickness_absences" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "benefits_catalog" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "employee_benefits" SET "tenant_id" = 'a0000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
