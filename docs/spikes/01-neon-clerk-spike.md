# Spike — Neon role permissions & Clerk Organizations availability

**Purpose:** de-risk Phases A and C of `docs/multitenant-migration-plan.md` before any
code changes. Two questions to answer in ~2 hours.

This document is split into:

- **Part 1 — What I could verify statically** (from docs + the repo).
- **Part 2 — What you need to run in Replit/Neon** (concrete commands, 15 minutes total).
- **Part 3 — Decision matrix** for each possible outcome.

---

## Part 1 — Statically verified

### 1.1 Clerk Organizations on Replit-managed Clerk

**Verdict: available and free.** The Replit-managed Clerk integration is
currently free with **no MAU cap and no organization cap**
([Replit docs — Clerk Auth](https://docs.replit.com/references/auth-and-identity/clerk-auth)).
Public Clerk pricing for reference: the Hobby plan gives 50k MRUs and 100
organizations free ([Clerk pricing](https://clerk.com/pricing)); the Replit
integration removes those caps for now.

What this means for the plan: **adopt Clerk Organizations as the tenant
boundary**. One Clerk org = one tenant. Clerk owns user↔tenant memberships,
roles (`admin` / `basic_member` / custom), and invitations — we don't build a
`memberships` table ourselves.

There is one feature-availability question we can only check inside the
dashboard:

- Is **Organizations** enabled on this specific Replit-managed Clerk instance,
  or do we need to toggle it on?

That's a single click — Part 2 covers it.

### 1.2 Neon role permissions for RLS

**Verdict: standard Postgres role/RLS features are available on Neon**, including
`CREATE ROLE`, `GRANT`, `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, and
`ALTER TABLE … FORCE ROW LEVEL SECURITY`
([Neon — PostgreSQL Row-Level Security](https://neon.com/postgresql/administration/row-level-security)).
The Neon-provisioned role attached to `DATABASE_URL` is the database owner
and therefore bypasses non-FORCEd RLS — exactly the situation the migration
plan flags.

Two strategies, both viable:

| Strategy | What you do | Guarantee | Notes |
| --- | --- | --- | --- |
| **A. Two roles (preferred)** | Create a new role `app_user` without `BYPASSRLS`; point the runtime `DATABASE_URL` at it; keep the owner role for migrations only. | Strongest — RLS enforced for the connection that handles user requests. | Requires the owner role to be able to `CREATE ROLE` and `GRANT` on existing tables. On Neon this normally works because the provisioned role has `CREATEROLE`. Confirm in Part 2. |
| **B. Single role + `FORCE RLS`** | Keep `DATABASE_URL` as-is; rely on `FORCE ROW LEVEL SECURITY` which applies policies even to table owners. | Strong, but the migration role is the same as the runtime role — a buggy migration that forgets to `SET LOCAL app.current_tenant` won't be caught. | Acceptable fallback if Strategy A is blocked. |

The right plan is to **try Strategy A first**; fall back to B only if Neon
rejects the role creation. The differences are small from the application's
point of view — the `withTenant(tenantId, ...)` wrapper is the same either way.

### 1.3 Replit App Storage — what we can and can't lean on

**Verdict: confirms the plan's call.** App Storage is GCS-backed and exposes
**signed URLs minted by the SDK** for both uploads and downloads, but there is
**no IAM prefix-condition mechanism** exposed to Replit apps
([Replit — App Storage](https://docs.replit.com/references/data-and-storage/object-storage),
[Replit blog — Introducing App Storage](https://replit.com/blog/app-storage)).
So the tenant boundary on object storage lives **entirely in
`routes/storage.ts`**:

1. Compute the key as `<tenant_id>/<entity_type>/<entity_id>/<filename>`
   server-side from `req.tenantId`, never from the client.
2. On download / signed-URL minting, verify the requested key's prefix matches
   `req.tenantId` before generating the URL.
3. Reject anything else with 404.

There is no second line of defence here, which is worth a callout in the
DPIA when you do one.

---

## Part 2 — What you need to run

### 2.1 Clerk dashboard check (3 minutes)

1. Open the Replit-managed Clerk dashboard from the Repl's Auth integration pane.
2. Look for an **Organizations** section in the left nav (under "Configure" →
   "Organizations" on current Clerk UI).
3. If it's disabled, toggle it on. Confirm you can see:
   - Organization creation
   - Roles (`admin`, `basic_member`) — both built-in
   - Invitations
4. Note down your Clerk **Publishable Key** and **Secret Key** — Phase A
   middleware needs them. Add them to Replit Secrets as `CLERK_PUBLISHABLE_KEY`
   and `CLERK_SECRET_KEY`.

**Expected outcome:** Organizations is available. If it isn't, file a Replit
support ticket — Replit-managed Clerk should expose it.

### 2.2 Neon role permissions check (10 minutes)

Run these SQL statements against the current `DATABASE_URL`, either through
Neon's SQL Editor or `psql "$DATABASE_URL"`:

```sql
-- 0. Confirm current role and its attributes.
SELECT current_user;
SELECT rolname, rolsuper, rolcreaterole, rolbypassrls
FROM pg_roles
WHERE rolname = current_user;
```

If `rolcreaterole = true` (almost certainly yes on Neon), Strategy A is available.

```sql
-- 1. Create the unprivileged app role (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD :'app_pwd' NOBYPASSRLS;
  END IF;
END$$;

-- 2. Grant the minimum needed.
GRANT CONNECT ON DATABASE neondb TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_user;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Make this apply to tables that don't exist yet (future migrations).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- 3. Smoke-test RLS works for app_user.
-- (Run this against a small scratch table — do NOT do it on employees yet.)
CREATE TABLE IF NOT EXISTS _rls_smoke (
  id serial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  payload text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON _rls_smoke TO app_user;

INSERT INTO _rls_smoke (tenant_id, payload) VALUES
  ('11111111-1111-1111-1111-111111111111', 'tenant1 row'),
  ('22222222-2222-2222-2222-222222222222', 'tenant2 row');

ALTER TABLE _rls_smoke ENABLE ROW LEVEL SECURITY;
ALTER TABLE _rls_smoke FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON _rls_smoke
  USING      (tenant_id = current_setting('app.current_tenant')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- 4. Now reconnect as app_user (in a separate psql session with the new
--    password) and confirm:
--    SET LOCAL app.current_tenant = '11111111-1111-1111-1111-111111111111';
--    SELECT * FROM _rls_smoke;  -- expect 1 row
--    SET LOCAL app.current_tenant = '22222222-2222-2222-2222-222222222222';
--    SELECT * FROM _rls_smoke;  -- expect 1 (the other) row
--    RESET app.current_tenant;
--    SELECT * FROM _rls_smoke;  -- expect ERROR: unrecognized configuration parameter, OR 0 rows

-- 5. Clean up the smoke table.
DROP TABLE _rls_smoke;
```

Capture:

- the value of `rolcreaterole` for the owner role,
- whether step 4 returned 1 row per tenant as expected,
- the password you set for `app_user` — store in Replit Secrets as
  `DATABASE_URL_APP` (full DSN, not just the password).

### 2.3 Replit App Storage prefix sanity check (5 minutes)

Open `artifacts/api-server/src/lib/objectStorage.ts` and confirm:

- the SDK call that generates the upload URL accepts an **object name** /
  **key** parameter (not just a bucket name) — i.e. that we can prescribe the
  key.
- the same is true for the download / signed-read helper.

If both are true, the plan's "enforce in our route" is straightforward. If
either path can only mint URLs against an *arbitrary* random key, we need a
small wrapper that records the mapping in the DB instead — flag back and I'll
adjust.

---

## Part 3 — Decision matrix

| Spike outcome | What changes in the plan |
| --- | --- |
| **2.1 Clerk Orgs available** *(expected)* | Proceed with the plan as written. |
| 2.1 Clerk Orgs missing | File a Replit ticket; in the meantime, build the tenant catalog with our own `memberships` table and revisit when Orgs ships. |
| **2.2 Strategy A works** *(expected on Neon)* | Best case — Phase C uses the two-role pattern. `DATABASE_URL` becomes the owner role used by Drizzle migrations; `DATABASE_URL_APP` is the app's runtime connection. |
| 2.2 Only Strategy B works | Phase C still ships with `FORCE ROW LEVEL SECURITY`, single role, but the plan explicitly notes "no migration/runtime split — careful with `SET LOCAL` discipline." |
| **2.3 App Storage allows server-prescribed keys** *(expected)* | Phase D enforces `<tenant_id>/...` prefixes in `routes/storage.ts`. |
| 2.3 App Storage only allows random keys | Plan changes: store `(tenant_id, object_path)` mapping in DB; every download endpoint joins on it. More plumbing, same security guarantee. |

---

## Reporting back

When you've run Parts 2.1 / 2.2 / 2.3, the answers I need are short:

1. Clerk Organizations on / off, and Publishable/Secret keys saved as secrets.
2. `rolcreaterole` value for the Neon owner role + smoke-test result + new
   `DATABASE_URL_APP` saved as a secret.
3. App Storage SDK accepts a server-supplied key for both upload and signed-read
   minting (yes / no).

With those three, Phases A, B, and C can proceed without surprise.
