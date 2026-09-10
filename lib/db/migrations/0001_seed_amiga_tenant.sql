-- Phase A seed: the first tenant ("Amiga Specialty").
--
-- The id below is a stable, hard-coded UUID:
--     a0000000-0000-4000-8000-000000000001
-- It is mirrored in lib/db/src/constants.ts (DEFAULT_TENANT_ID) and used as the
-- fallback tenant by the api-server middleware while Clerk is disabled. Phase
-- B's backfill (which sets tenant_id on every existing row) references this id,
-- so it MUST NOT change.
--
-- clerk_org_id is left NULL until the tenant is linked to a Clerk Organization.
-- Idempotent: ON CONFLICT DO NOTHING so re-running is safe.
INSERT INTO "tenants" ("id", "slug", "name")
VALUES ('a0000000-0000-4000-8000-000000000001', 'amiga', 'Amiga Specialty')
ON CONFLICT ("id") DO NOTHING;
