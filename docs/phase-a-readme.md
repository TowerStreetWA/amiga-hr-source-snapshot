# Phase A — Identity & tenant catalog scaffolding

This is the **plumbing-only** first slice of the multi-tenant migration
(`docs/multitenant-migration-plan.md`). It introduces the pieces every later
phase depends on, while leaving runtime behaviour for the existing single-tenant
Amiga deployment unchanged.

## What this ships

- **`tenants` catalog table** (`lib/db/src/schema/tenants.ts`) — control-plane
  registry: `id`, `clerk_org_id` (nullable, unique), `slug` (citext, unique),
  `name`, `tier` (`pool`|`silo`), `status`, timestamps. Created by migration
  `0000_phase_a_tenants.sql` (which also enables the `pgcrypto` and `citext`
  extensions).
- **Seed tenant** — Amiga Specialty, inserted by `0001_seed_amiga_tenant.sql`
  with the stable UUID `a0000000-0000-4000-8000-000000000001`. See the
  "Seed tenant" subsection in the migration plan for why it is hard-coded.
- **`withTenant(tenantId, fn)`** (`lib/db/src/tenant.ts`) — opens a transaction
  and binds `app.current_tenant` via `SET LOCAL` (pooler-safe) for the RLS
  policies that arrive in Phase C. UUID-validated, parameterised. **Not yet
  wired into any route** — Phase B adopts it.
- **`tenantContext` middleware** (`artifacts/api-server/src/middlewares/tenant.ts`)
  — resolves `req.tenantId` ahead of the router. With `CLERK_ENABLED` unset it
  falls back to the seeded Amiga tenant; with it `true`, it maps the Clerk
  session's `orgId` to a `tenants` row (404 if absent/inactive).
- **Tenant-scoped public routes** — `/api/public/:tenantSlug/{jobs,upload-url,applications}`.
  The old un-versioned paths still work as **deprecated aliases** (they resolve
  to the `amiga` tenant and log `{deprecated:true}`).
- **Interim staging-password gate**
  (`artifacts/api-server/src/middlewares/stagingGate.ts`) — closes the "any
  password logs you in" back door until Clerk lands. Active only when
  `CLERK_ENABLED` is unset **and** `STAGING_PASSWORD` is set.

## Explicitly out of scope (later phases)

- **No `tenant_id` columns** on existing tables (Phase B).
- **No RLS** (Phase C).
- **No route-handler logic changes** — handlers do not read `req.tenantId` yet.
- **No new secrets committed** — all keys/passwords come from env.

## Environment variables

See the table in `replit.md` §7. The Phase A additions: `CLERK_ENABLED`,
`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `STAGING_PASSWORD`, and the
Phase-C-reserved `DATABASE_URL_APP`.

## Rollout

1. Run the migrations against the target DB (see below). Idempotent and safe to
   re-run.
2. Leave `CLERK_ENABLED` unset → behaviour is identical to today (single Amiga
   tenant).
3. Optionally set `STAGING_PASSWORD` on staging to gate the authenticated API
   surface immediately.
4. Once the Neon + Clerk spike is validated and Clerk Organizations are wired
   up, set `CLERK_ENABLED=true` plus the two Clerk keys to flip on real
   session-derived tenant resolution.

## Migrations

A versioned `migrations/` workflow now lives alongside the existing
`drizzle-kit push`:

```bash
# generate (regenerates SQL + snapshots from the schema)
pnpm --filter @workspace/db run generate

# apply to DATABASE_URL
pnpm --filter @workspace/db run migrate
```

The two Phase A `.sql` files are the source of truth and are idempotent; if
`drizzle-kit generate` is re-run it will reproduce equivalent SQL.

## Local verification

With `CLERK_ENABLED` unset:

- `GET /api/employees` → works (attributed to the Amiga tenant).
- `GET /api/public/amiga/jobs` → works.
- `GET /api/public/jobs` (old path) → works **and** logs a deprecation warning.

With `STAGING_PASSWORD=secret` set (and Clerk still off):

- `GET /api/employees` → **401** without the password.
- `GET /api/employees?staging=secret` (or `x-staging-pw: secret`) → works.
- `GET /api/public/amiga/jobs` and `GET /api/healthz` → still open.
