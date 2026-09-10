-- Phase A scaffolding: control-plane `tenants` catalog table.
-- Idempotent and re-runnable. Adds no tenant_id columns to existing tables
-- (that is Phase B) and enables no RLS (that is Phase C).
--
-- pgcrypto provides gen_random_uuid(); citext gives case-insensitive slugs.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "citext";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"tier" text DEFAULT 'pool' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_clerk_org_id_uniq" UNIQUE("clerk_org_id"),
	CONSTRAINT "tenants_slug_uniq" UNIQUE("slug"),
	CONSTRAINT "tenants_tier_check" CHECK ("tenants"."tier" IN ('pool', 'silo'))
);
