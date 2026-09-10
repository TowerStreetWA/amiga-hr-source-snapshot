-- Coordinate scheduled public-upload cleanup across API instances.
-- A stopped instance leaves its row behind, but expires_at allows a later
-- instance to reclaim it safely.
CREATE TABLE IF NOT EXISTS "public_upload_cleanup_leases" (
  "tenant_id" uuid PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "public_upload_cleanup_leases_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "public_upload_cleanup_leases_expires_at_idx"
  ON "public_upload_cleanup_leases" ("expires_at");