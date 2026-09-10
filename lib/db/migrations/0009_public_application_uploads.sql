-- Track public upload intents separately from submitted candidate documents.
-- Expired rows with no claimed_at are safe cleanup candidates.
CREATE TABLE IF NOT EXISTS "public_application_uploads" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "object_path" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "claimed_at" timestamp with time zone,
  "cleanup_started_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "public_application_uploads_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'public_application_uploads_tenant_object_path_uniq'
  ) THEN
    ALTER TABLE "public_application_uploads"
      ADD CONSTRAINT "public_application_uploads_tenant_object_path_uniq"
      UNIQUE ("tenant_id", "object_path");
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_application_uploads_tenant_expiry_idx"
  ON "public_application_uploads" ("tenant_id", "expires_at");