# Multi-Tenant Migration Plan — Amiga Specialty HR

A concrete, phased plan for turning the current **single-tenant** Amiga Specialty
HR app into a **multi-tenant SaaS**, tailored to this codebase and to the Replit
platform it runs on.

This plan adapts the generic roadmap in
`attached_assets/hr_saas_multitenant_roadmap_1781176156122.md`. That roadmap is
excellent but written for an AWS shop (S3 / IAM / KMS / PgBouncer / SOC 2 team).
This document translates each recommendation into **what is actually true and
achievable in this repo** today, and flags where the roadmap assumes
infrastructure we do not have.

---

## 0. Where we are today (the honest baseline)

Before any planning, three facts dominate everything that follows:

1. **There is no authentication.** `pages/login.tsx` accepts any password and
   drops every visitor into the same admin session. There is no concept of a
   "user", let alone which tenant they belong to. **Multi-tenancy is impossible
   without real auth first** — the tenant id has to come from a server-validated
   identity, never from the client.
2. **There is no `tenant_id` anywhere.** All 18 tables in `lib/db/src/schema/*`
   assume one company. Every query, every join, every FK is single-tenant.
3. **One shared database, one connection string.** `lib/db/src/index.ts` opens a
   single `pg.Pool` from `DATABASE_URL`. That role is the database owner, which
   matters a lot for Row-Level Security (see Phase 2).

So the roadmap's "Pool + RLS" target is the right one, but we are starting from
**Phase 0**, not from a working auth system.

### Platform translation table (roadmap assumption → this app's reality)

| Roadmap assumes | This app actually has | Consequence for the plan |
| --- | --- | --- |
| Auth0 / WorkOS / Cognito IdP | No auth at all | Adopt **Clerk** (Replit-managed) — its **Organizations** feature *is* a tenant model out of the box. This is the single highest-leverage decision. |
| AWS S3 + IAM prefix conditions | Replit **App Storage** object bucket | Enforce `tenant_id/` key prefixes in our own storage routes; there is no IAM to lean on. |
| AWS KMS per-tenant keys | No KMS | Per-tenant encryption keys are **out of scope** on Replit. App-level field encryption with one platform key is the realistic ceiling. |
| PgBouncer transaction-mode pool | `pg.Pool` against Neon | Use `SET LOCAL` **inside a Drizzle transaction** — that is safe regardless of pooler mode. |
| Database-per-tenant (Silo SKU) | Single Neon DB | Silo tier is a **future / enterprise-only** item; the realistic target here is **Pool + RLS**. |
| SIEM, SOC 2, pen tests, mTLS | — | Organizational/process work, not code. Listed in Phase 5 as "aspirational, not built by us." |

---

## 1. Scope decision: what we will actually build

The roadmap describes a 24-week enterprise programme. For this app I recommend a
**leaner "real second tenant" target** and explicitly defer the enterprise
hardening. Two tiers:

- **MVP multi-tenancy (Phases A–D below):** real auth, a tenant catalog,
  `tenant_id` on every table, RLS enforcing, and a genuine second tenant live.
  This is the line that turns "single-tenant app with extra columns" into "a
  multi-tenant product."
- **Enterprise hardening (Phase E):** Silo tier, per-tenant KMS, SOC 2, SIEM,
  step-up MFA, DLP. Documented here for completeness but **not** something to
  start now — most of it needs infrastructure Replit doesn't expose.

The tenant boundary is **one tenant = one MGA / customer company.** The existing
Amiga Specialty data becomes the first seed tenant.

---

## 2. PII surface (do this mapping before touching code)

The roadmap's "ROPA / DPIA" step matters because HR data is the highest-risk
category. In this schema the sensitive fields already are:

- `employees`: `salary`, `date_of_birth`, home address, `emergency_*`,
  `national_id`-equivalent (not modelled yet but will be).
- `salary_changes`: full pay history.
- `sickness_absences`: `reason`, fit-note data — **medical data** (special
  category under GDPR).
- `candidates`: `right_to_work_status`, `expected_salary` — immigration + pay.
- `employee_documents` / `candidate_documents`: CVs, contracts, RTW scans in
  object storage.

These are the fields that must **never** cross a tenant boundary and the ones
worth app-level encryption later.

---

## 3. Phased plan (tailored)

### Phase A — Identity & tenant catalog (the foundation)

**Goal:** every request carries a server-validated `(user, tenant)` context.

1. **Add Clerk auth** (see the `clerk-auth` skill). Use Clerk **Organizations**:
   one Clerk Organization = one tenant. Clerk then owns user↔tenant membership,
   roles (owner/admin/member), and invitations — which is exactly the
   `users / memberships / tenants` model in §6 of the roadmap, without us
   building it.
2. **Mirror a tenant catalog in our DB.** Add a control-plane table:
   - `tenants` — `id (uuid pk)`, `clerk_org_id (unique)`, `slug`, `name`,
     `tier ('pool')`, `status`, `created_at`. (No `silo_dsn` / `kms_key_arn`
     columns yet — those are enterprise-tier and we are not building Silo.)
3. **Replace the dev login.** `pages/login.tsx` → Clerk sign-in;
   `pages/apply.tsx` stays public (it is the only un-authed surface and must keep
   working).
4. **Add auth middleware in `artifacts/api-server`** that:
   - validates the Clerk session,
   - resolves the active org → looks up the matching `tenants` row,
   - attaches `req.tenantId` (and rejects with **404** — not 403 — if the org
     has no active tenant row, per the roadmap's "don't reveal existence" rule).
5. **Public routes (`/api/public/*`) get an explicit tenant resolver.** Today
   `/apply` has no tenant. Decision needed: either a per-tenant apply URL
   (`/apply/:tenantSlug`) or a single marketing tenant. Recommend
   `/apply/:tenantSlug` so applications land in the right company.

> Phase A is the hardest to undo (token/identity design). Get it right before
> touching the schema.

#### Seed tenant

The first tenant (Amiga Specialty) is inserted with a **stable, hard-coded UUID**:

```
a0000000-0000-4000-8000-000000000001
```

This id is fixed on purpose. It is referenced in three places that must agree:

- `lib/db/src/constants.ts` as `DEFAULT_TENANT_ID`,
- the seed migration `lib/db/migrations/0001_seed_amiga_tenant.sql`,
- the api-server tenant middleware, which uses it as the fallback tenant while
  `CLERK_ENABLED` is unset.

Phase B's backfill sets `tenant_id` on every existing row to this value, so the
UUID **must not change** once any environment has run the seed. `clerk_org_id`
stays `NULL` until the tenant is linked to a Clerk Organization. The seed is
idempotent (`ON CONFLICT DO NOTHING`).

### Phase B — Expand the schema (add `tenant_id` everywhere)

**Goal:** every tenant-scoped table carries a non-null `tenant_id`, enforced by
the database, not just app code.

The 18 tables that need `tenant_id` (all of `lib/db/src/schema/*`):

`employees`, `salary_changes`, `employee_documents`, `activity_log`, `jobs`,
`candidates`, `candidate_documents`, `candidate_stage_history`, `interviews`,
`offers`, `onboarding_tasks`, `training_records`, `leave_entitlements`,
`leave_requests`, `sickness_absences`, `benefits_catalog`, `employee_benefits`.
(`tenants` itself is the only non-tenant-scoped table.)

Follow the roadmap's **expand → backfill → contract** so nothing breaks mid-flight:

1. **Expand:** add `tenant_id uuid NULL` to all 18 tables (nullable first).
2. **Backfill:** set every existing row to the seed Amiga tenant id, in batches.
3. **Constrain:** `ALTER COLUMN tenant_id SET NOT NULL`.
4. **Tenant-scope the unique constraints.** This is a real trap in our schema:
   - `employees.email` and `employees.employee_number` are currently global
     `UNIQUE`. They must become `UNIQUE (tenant_id, email)` /
     `UNIQUE (tenant_id, employee_number)`, otherwise two tenants can't each
     have an `alice@…` or their own `AMG0001`.
   - This also means **AMG#### allocation becomes per-tenant** — the
     `convert-to-employee` and `import/commit` allocators (which today lock the
     whole `employees` table) must allocate the next number *within a tenant*.
5. **Composite keys — recommended but staged.** The roadmap wants
   `PRIMARY KEY (tenant_id, id)` and FKs that include `tenant_id`. That is the
   strongest guarantee but it rewrites every Drizzle relation and join in the
   repo. Recommendation:
   - **MVP:** keep single-column `id` PKs, add `tenant_id NOT NULL`, and add
     **composite FKs that include `tenant_id`** (e.g.
     `FOREIGN KEY (tenant_id, employee_id) REFERENCES employees(tenant_id, id)`
     once a `UNIQUE (tenant_id, id)` exists). This blocks cross-tenant orphans.
   - **Later:** promote to composite PKs if/when we go enterprise. Document the
     decision either way.
6. **Indexes lead with `tenant_id`.** Add `(tenant_id, …)` indexes for the hot
   lookups (employee by email, candidates by stage, leave by employee, etc.).

All migrations live in `lib/db` and must be **idempotent and reversible**
(`WHERE tenant_id IS NULL` guards on backfills).

#### Phase B — implementation status (SCHEMA-ONLY)

Shipped in the `phase-b-tenant-id` branch (stacks on Phase A). This is the
**schema layer only** — route handlers still allocate against the seed tenant
via `DEFAULT_TENANT_ID` and are flagged with `// TODO Phase B.5`. Wiring the
real `req.tenantId` into handlers is **Phase B.5**, deliberately out of scope
here.

Migrations (expand → backfill → contract), in apply order:

| File | Purpose | Reversible |
| --- | --- | --- |
| `0002_phase_b_add_tenant_id.sql` | Add `tenant_id uuid NULL` to all 17 tenant-scoped tables | `DROP COLUMN tenant_id` |
| `0003_phase_b_backfill_tenant_id.sql` | Set every existing row to the seed Amiga tenant (`WHERE tenant_id IS NULL` guard) | re-`NULL` the backfilled rows |
| `0004_phase_b_tenant_id_not_null.sql` | `SET NOT NULL` + FK each `tenant_id → tenants(id)` | `DROP CONSTRAINT` + `DROP NOT NULL` |
| `0005_phase_b_tenant_scoped_uniques.sql` | Drop global `employees.email` / `employee_number` uniques; add `UNIQUE(tenant_id, …)`; tenant-scope the leave-entitlement unique | recreate global uniques, drop tenant ones |
| `0006_phase_b_composite_fks.sql` | `UNIQUE(tenant_id, id)` on the 4 parent tables; replace 14 single-column FKs with tenant-carrying composite FKs (original `ON DELETE` preserved) | drop composite FKs, recreate single-column FKs |
| `0007_phase_b_tenant_indexes.sql` | 16 `(tenant_id, …)`-leading indexes for hot lookups | `DROP INDEX` each |

**Decisions taken:**
- **MVP composite FKs, not composite PKs.** Single-column `id` PKs are kept;
  cross-tenant orphans are blocked by `FOREIGN KEY (tenant_id, fk) REFERENCES
  parent(tenant_id, id)` against a `UNIQUE(tenant_id, id)`. Promotion to
  composite PKs is left for the enterprise tier.
- **`candidates.hired_employee_id`** stays a single-column `ON DELETE SET NULL`
  FK (not in the composite set) — it points across the recruitment/HR boundary
  and a tenant-carrying composite there would be redundant.
- **Per-tenant `AMG####`.** `nextEmployeeNumberForTenant` allocates the next
  number *within a tenant* under a `pg_advisory_xact_lock` keyed on the tenant,
  replacing the whole-table `LOCK TABLE employees`. Existing single-tenant call
  sites delegate via `DEFAULT_TENANT_ID`.
- **`0007` runs OUTSIDE `drizzle-kit migrate`.** `CREATE INDEX CONCURRENTLY`
  cannot run inside a transaction (drizzle wraps each file in one), so apply it
  manually: `psql "$DATABASE_URL" -f lib/db/migrations/0007_phase_b_tenant_indexes.sql`.
- **Backfill is single-statement**, sized for Amiga's single-tenant dataset.
  Production-scale multi-tenant backfill would need batching — future hardening.

**Deferred to Phase B.5:** every `// TODO Phase B.5` marker — threading the
resolved `req.tenantId` into route handlers, `logActivity`, and the onboarding/
training row builders (which currently default to `DEFAULT_TENANT_ID`).

### Phase C — Enforce isolation with RLS (the safety net)

**Goal:** make it *impossible* for a missing `WHERE tenant_id` to leak data,
even with an application bug.

1. **Create an unprivileged app role** (no `BYPASSRLS`) and point the runtime
   `DATABASE_URL` at it; keep an elevated role for migrations only.
   - ⚠️ **Replit/Neon caveat:** the provisioned `DATABASE_URL` is typically the
     owner role. We need to verify we can create a second, restricted role on
     this Neon instance and wire it as the app's connection. If we cannot, RLS
     can still be enabled with `FORCE ROW LEVEL SECURITY` (which applies even to
     the table owner) — confirm this during Phase C spike.
2. **Per-request tenant GUC.** Change `lib/db` so each request runs inside a
   transaction that first does `SET LOCAL app.current_tenant = $tenantId`.
   `SET LOCAL` + a transaction is leak-safe regardless of pooler mode — this is
   the right pattern for our `pg.Pool`. This is a meaningful change to the data
   access layer: route handlers move from `db.query…` to
   `withTenant(req.tenantId, (tx) => …)`.
3. **Enable + FORCE RLS** on all 18 tables with the standard policy:
   `USING (tenant_id = current_setting('app.current_tenant')::uuid)` and a
   matching `WITH CHECK`.
4. **Roll out in permissive mode first** — log violations to a side table for a
   week, then promote to enforcing (roadmap Phase 2→3).
5. **Background/seed scripts run as a tenant too** — the seed script must set
   `app.current_tenant`, not run as god-mode.

### Phase D — Object storage isolation + second tenant

1. **Prefix every object key with the tenant.** Today uploads go to
   public/private dirs. Move to `<tenant_id>/employees/<id>/<doc>` and
   `<tenant_id>/candidates/<id>/<doc>`. Enforce the prefix in
   `routes/storage.ts` and `routes/public.ts` when minting signed URLs — the
   same tenant check the API uses. (Replit App Storage has no IAM prefix
   conditions, so **our route is the enforcement point**; there is no second
   line of defence here, which is worth noting.)
2. **Onboard a real second tenant.** Per the roadmap's most important rule: until
   a genuine second company is on the system, it's single-tenant in disguise.
   Create a second Clerk org + `tenants` row, run the apply→hire→leave flows for
   it, and confirm zero bleed (reconciliation: row counts per `tenant_id`).

### Phase E — Enterprise hardening (documented, NOT scheduled)

These come straight from the roadmap's Zero Trust checklist but depend on
infrastructure Replit does not expose, or are organizational. Listed so they're
not forgotten, **not** part of the MVP:

- **Silo (DB-per-tenant) tier**, blue/green per-tenant migration runner.
- **Per-tenant KMS / BYOK**, app-level field encryption of salary / medical /
  national-id fields.
- **Step-up MFA** for salary views and bulk exports; SSO/SCIM per enterprise
  tenant (Clerk can do much of this on higher plans).
- **SIEM, immutable PII audit log in a separate account, pgAudit, DLP/virus
  scanning on uploads, SOC 2 / ISO 27001, DPIA, Trust Center.**

---

## 4. Suggested sequencing & rough effort

| Phase | What | Relative size | Risk |
| --- | --- | --- | --- |
| A | Clerk auth + Organizations + `tenants` catalog + middleware | Large | Highest (identity is hard to undo) |
| B | `tenant_id` on 18 tables, tenant-scoped uniques, per-tenant AMG####, composite FKs | Large | Long-running backfill locks |
| C | Unprivileged role + `withTenant` transactions + FORCE RLS | Medium-Large | Neon role permissions; every handler touched |
| D | Object-key tenant prefixes + real second tenant | Medium | Storage route is the only guard |
| E | Enterprise hardening | Open-ended | Mostly platform/process, not code |

This is genuinely a multi-week effort even at MVP scope (A–D), because Phase B
and C touch essentially every route and query in `artifacts/api-server`.

---

## 5. Replit-specific risks to validate early (spikes)

1. **Can we create a non-owner Postgres role on this Neon instance and use it as
   the app connection?** If not, RLS relies on `FORCE ROW LEVEL SECURITY` only —
   confirm that works for our access patterns.
2. **Clerk Organizations on the Replit-managed Clerk tenant** — confirm orgs,
   roles, and invitations are available (see `clerk-auth` skill) before building
   the catalog around them.
3. **Public `/apply` tenant routing** — decide per-tenant slug vs single
   marketing tenant before Phase A, since it changes the public API shape.
4. **App Storage signed-URL flow** already mints URLs server-side; confirm we
   can scope/validate the key prefix there (no IAM fallback).

---

## 6. Anti-patterns we must avoid (from the roadmap, that this repo is prone to)

- **Letting the client pick the tenant** (header/query param). `tenant_id` must
  come from the Clerk-validated session, never the request body.
- **Relying on app-code `WHERE tenant_id` alone.** With 18 tables and dozens of
  handlers, someone will forget one. RLS is the net — that's why Phase C is not
  optional.
- **Session-mode pooling with `SET app.current_tenant`.** Always `SET LOCAL`
  inside a transaction.
- **Skipping the second-tenant milestone (Phase D).** That milestone is the
  definition of done for "multi-tenant."

---

## 7. Recommended first concrete step

If/when you want to start building: **Phase A, step 1 — stand up Clerk auth with
Organizations and the `tenants` catalog table**, behind the existing UI. Nothing
else in the roadmap is safe to build until identity and tenant context exist.

I have not made any code changes — this is a plan only. Tell me which phase you'd
like to start, or if you'd like me to adjust scope (e.g. drop RLS for an
app-code-only MVP, or include the Silo tier).
