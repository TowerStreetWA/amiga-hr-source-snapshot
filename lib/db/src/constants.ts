// Stable UUID for the first ("Amiga Specialty") seed tenant. Hard-coded so the
// Phase B backfill (which sets tenant_id on every existing row) can reference a
// known value. Inserted by migration 0001_seed_amiga_tenant.sql and used as the
// fallback tenant by the api-server middleware while Clerk is disabled.
export const DEFAULT_TENANT_ID = "a0000000-0000-4000-8000-000000000001";
