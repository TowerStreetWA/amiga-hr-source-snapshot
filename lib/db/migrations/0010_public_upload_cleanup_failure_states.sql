-- Persist only tenant-level cleanup failure times and alert state so incidents
-- survive API restarts without retaining upload paths or credentials.
CREATE TABLE IF NOT EXISTS "public_upload_cleanup_failure_states" (
  "tenant_id" uuid PRIMARY KEY NOT NULL,
  "failure_timestamps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "alert_active" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "public_upload_cleanup_failure_states_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict
);