ALTER TABLE "app_users"
  ADD COLUMN IF NOT EXISTS "access_expires_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "pending_app_access_invites" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" text NOT NULL DEFAULT 'employee',
  "access_expires_at" timestamp with time zone NOT NULL,
  "clerk_invitation_id" text NOT NULL,
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pending_app_access_invites_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
  CONSTRAINT "pending_app_access_invites_clerk_invitation_uniq"
    UNIQUE ("clerk_invitation_id"),
  CONSTRAINT "pending_app_access_invites_tenant_email_uniq"
    UNIQUE ("tenant_id", "email")
);

CREATE INDEX IF NOT EXISTS "pending_app_access_invites_tenant_email_idx"
  ON "pending_app_access_invites" ("tenant_id", "email");