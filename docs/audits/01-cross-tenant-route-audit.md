# Cross-Tenant Route Audit — API Server

A read-only checklist of every place in `artifacts/api-server/` that needs a change
when `tenant_id` multi-tenancy lands (Phase B/C/D of
[`docs/multitenant-migration-plan.md`](../multitenant-migration-plan.md)).

This is a checklist for the Phase B implementation, **not** the implementation
itself. No source files were modified.

## Summary

**76 findings across 24 files.**

| Category | Findings | Headline risk |
| --- | ---: | --- |
| 0. No auth/tenant middleware (root cause) | 1 | Nothing today supplies `req.tenantId`; every finding below assumes it exists |
| 1. Globally-unique lookups | 6 | `email` / `employee_number` uniqueness must become per-tenant |
| 2. Sequence / ID allocators | 3 | `AMG####` allocator locks the whole table; must allocate per-tenant |
| 3. Cross-table joins on a single FK | 18 | Joins must add `tenant_id` once composite FKs land |
| 4. Trusts an ID from URL/body | 30 | Pre-RLS leak vector — any tenant can read/write another's rows by ID |
| 5. Public / un-authed routes | 3 | `/public/*` has no tenant; needs explicit resolver (`/apply/:tenantSlug`) |
| 6. Object storage paths | 6 | Keys lack a tenant prefix; reads/writes not prefix-checked |
| 7. Background / seed / template logic | 6 | Seeds + in-memory state run with no tenant context |
| 8. Activity-log insertion sites | 17 | `activity_log` has no `tenant_id`; every insert site must set it |
| 9. Anything else risky | 8 | Raw SQL, global aggregates, shared in-memory state |

> **Category 0 is the precondition.** `routes/index.ts` mounts every router with
> no auth or tenant middleware, so no handler can read a `tenant_id` yet. Every
> "add `eq(tenantId)`" fix below presupposes Phase A has attached `req.tenantId`
> from the Clerk-validated session.

### Status after Phase B (`phase-b-tenant-id`, SCHEMA-ONLY)

Phase B ships the **database layer** for these findings; it does **not** touch
route-handler logic (handlers default to `DEFAULT_TENANT_ID` with `// TODO
Phase B.5` markers). Category status:

| Category | Phase B status |
| --- | --- |
| 0. No auth/tenant middleware | **Phase A** scaffolding present (`req.tenantId` resolver, off by default); enforcement is Phase B.5 / Phase C |
| 1. Globally-unique lookups | **SCHEMA-COVERED** — `UNIQUE(tenant_id, email)` / `(tenant_id, employee_number)` and the tenant-scoped leave-entitlement unique landed (migration `0005`) |
| 2. Sequence / ID allocators | **SCHEMA-COVERED** — `nextEmployeeNumberForTenant` allocates per-tenant under a per-tenant advisory lock; call sites delegate via `DEFAULT_TENANT_ID` until B.5 |
| 3. Cross-table joins on a single FK | **SCHEMA-COVERED at the DB** — tenant-carrying composite FKs block cross-tenant orphans (migration `0006`); adding `eq(tenantId)` to the *queries* is Phase B.5 |
| 4. Trusts an ID from URL/body | **DEFERRED — Phase B.5** (handler logic) / hard-stopped by RLS in Phase C |
| 5. Public / un-authed routes | **Phase A** added `/public/:tenantSlug/*`; remaining resolver hardening is Phase B.5 |
| 6. Object storage paths | **DEFERRED — Phase D** (tenant key prefixes) |
| 7. Background / seed / template logic | **PARTIAL** — onboarding/training row builders now stamp `tenant_id`; seed/in-memory context is Phase B.5 |
| 8. Activity-log insertion sites | **SCHEMA-COVERED** — `activity_log.tenant_id` exists and `logActivity` stamps it (defaults to `DEFAULT_TENANT_ID` pending B.5) |
| 9. Anything else risky | **DEFERRED — Phase B.5 / C** |

---

## Category 0 — No tenant context exists yet (root cause)

| File | Line | Problem | Suggested fix |
| --- | ---: | --- | --- |
| `src/routes/index.ts` | 23–40 | All 18 routers mounted with bare `router.use(...)`; no auth/tenant middleware, and `publicRouter` shares the same base path as authed routers | Add Phase-A middleware that validates the Clerk session, resolves the org → `tenants` row, attaches `req.tenantId`, and mount `publicRouter` on a separate un-authed path |

---

## Category 1 — Globally-unique lookups that break once email/employeeNumber become tenant-scoped

After Phase B, `UNIQUE(email)` → `UNIQUE(tenant_id, email)` and
`UNIQUE(employee_number)` → `UNIQUE(tenant_id, employee_number)`. Every lookup
that assumes global uniqueness must add `and(eq(tenantId), …)`.

| File | Line | Problem | Suggested fix |
| --- | ---: | --- | --- |
| `src/routes/import.ts` | 49–50 | `select({email}).from(employeesTable)` builds a global existing-email set for dup detection | Scope the existing-email query to the tenant |
| `src/routes/import.ts` | 100–103 | Re-validation pulls all `email`/`employeeNumber` globally on commit | Scope to tenant before building dedup sets |
| `src/lib/importEmployees.ts` | 262 | `existingEmails.has(email)` rejects cross-tenant duplicates as "already exists" | Caller must pass a tenant-scoped email set (no change to helper signature beyond the data it receives) |
| `src/routes/employees.ts` | 124–132 | `ilike` search over `email`/`employeeNumber` returns all tenants' rows | Add `eq(employeesTable.tenantId, req.tenantId)` to the `where` |
| `src/routes/candidates.ts` | ~132 | `ilike(candidatesTable.email, term)` list search spans all tenants | Add tenant filter (candidate email is not `.unique()` but is still tenant-scoped data) |
| `src/lib/db schema (`lib/db/src/schema/leave.ts`) | 38–44 | `uniqueIndex(employeeId, year, leaveType)` becomes ambiguous once employees are per-tenant | Promote to `unique(tenant_id, employeeId, year, leaveType)`; mirror in the `onConflict` target (see Cat 7) |

---

## Category 2 — Sequence / ID allocators that need to become per-tenant

The `AMG####` allocator must hand out the next number **within a tenant**, and
the table-wide `LOCK TABLE` must narrow to a per-tenant lock (advisory lock keyed
by tenant, or a `WHERE tenant_id` predicate plus a tenant-scoped sequence).

| File | Line | Allocator | Current locking strategy |
| --- | ---: | --- | --- |
| `src/routes/employees.ts` | 81–88, 159–161 | `nextEmployeeNumber()` — `MAX(CAST(SUBSTRING(employee_number …)))` then insert | `LOCK TABLE employees IN SHARE ROW EXCLUSIVE MODE` (whole table) + 5× retry on 23505 |
| `src/routes/import.ts` | 184–190 | `highestEmployeeSequence()` over all `employee_number`, incremented per row in a tx | In-transaction full-table `select` of all numbers (no row lock; relies on tx + unique constraint) |
| `src/routes/recruitment.ts` | 137–143 | `convert-to-employee` allocator — same `MAX(...)` raw SQL | `LOCK TABLE employees IN SHARE ROW EXCLUSIVE MODE` (whole table) + 5× retry |

---

## Category 3 — Cross-table joins that rely on a single FK column

Once composite FKs include `tenant_id`, each join condition should also match on
`tenant_id` (e.g. `and(eq(a.fk, b.id), eq(a.tenantId, b.tenantId))`). Phase B touch.

| File | Line | Join |
| --- | ---: | --- |
| `src/routes/candidates.ts` | ~143, ~158 | `candidates LEFT JOIN jobs ON candidates.job_id = jobs.id` |
| `src/routes/jobs.ts` | ~42, ~62 | `jobs LEFT JOIN candidates ON candidates.job_id = jobs.id` |
| `src/routes/pay.ts` | 126–131 | `salary_changes INNER JOIN employees ON salary_changes.employee_id = employees.id` |
| `src/routes/leave.ts` | ~159, ~188, ~221 | `leave_requests INNER JOIN employees ON employee_id = employees.id` |
| `src/routes/leave.ts` | ~233 | `sickness_absences INNER JOIN employees …` (in a leave/sickness stats query) |
| `src/routes/sickness.ts` | ~56 | `sickness_absences INNER JOIN employees ON employee_id = employees.id` |
| `src/routes/training.ts` | ~80 | `training_records INNER JOIN employees ON employee_id = employees.id` |
| `src/routes/onboarding.ts` | ~53 | `employees LEFT JOIN onboarding_tasks ON onboarding_tasks.employee_id = employees.id` |
| `src/routes/benefits.ts` | ~150, ~152, ~274 | `employee_benefits INNER JOIN benefits_catalog ON benefit_id = benefits_catalog.id` |
| `src/routes/recruitment.ts` | 122–124 | `candidate.job_id → jobs.id` lookup inside the conversion tx |

---

## Category 4 — Routes that take an ID from the URL/body and trust it

Pre-RLS these are the leak vectors: a handler fetches/mutates a row by `:id` (or
by a child's `employeeId`/`candidateId`) without confirming it belongs to the
caller's tenant. Each needs an explicit `and(eq(tenantId))` until Phase C RLS
makes the omission safe. Listed by route; "via parent" = the row is reached
through an employee/candidate id that itself is unverified.

| File | Line | Route (trusted id) |
| --- | ---: | --- |
| `src/routes/employees.ts` | 239–242 | `GET /employees/:id` |
| `src/routes/employees.ts` | 269–273 | `PATCH /employees/:id` |
| `src/routes/employees.ts` | 294–297 | `DELETE /employees/:id` |
| `src/routes/employees.ts` | 318–322 | `GET /employees/:id/salary-history` (by employeeId) |
| `src/routes/employees.ts` | 336–363 | `POST /employees/:id/salary-history` (by employeeId) |
| `src/routes/employees.ts` | 381–417 | `GET`/`POST /employees/:id/documents` (by employeeId) |
| `src/routes/employees.ts` | 434–437 | `DELETE /documents/:docId` (by doc id) |
| `src/routes/candidates.ts` | 149–178 | `GET /candidates/:id` (+ joined docs/history/interviews/offers) |
| `src/routes/candidates.ts` | 228–262 | `PATCH /candidates/:id` |
| `src/routes/candidates.ts` | 264–277 | `DELETE /candidates/:id` |
| `src/routes/candidates.ts` | 279–338 | `POST /candidates/:id/stage` |
| `src/routes/candidates.ts` | 340–374 | `GET`/`POST /candidates/:id/documents` |
| `src/routes/candidates.ts` | 376–388 | `DELETE /candidate-documents/:docId` |
| `src/routes/jobs.ts` | 49–70 | `GET /jobs/:id` |
| `src/routes/jobs.ts` | 98–132 | `PATCH /jobs/:id` |
| `src/routes/jobs.ts` | 134–147 | `DELETE /jobs/:id` |
| `src/routes/interviews.ts` | 11–72 | `GET`/`POST /candidates/:id/interviews` (via parent) |
| `src/routes/interviews.ts` | 74–135 | `PATCH`/`DELETE /interviews/:id` |
| `src/routes/offers.ts` | 11–83 | `GET`/`POST /candidates/:id/offers` (via parent) |
| `src/routes/offers.ts` | 85–170 | `PATCH`/`DELETE /offers/:id` |
| `src/routes/recruitment.ts` | 85–116 | `POST /candidates/:id/convert-to-employee` (locks candidate row, no tenant check) |
| `src/routes/leave.ts` | 254–346 | `GET`/`PUT /leave/employees/:id/entitlements[/:leaveType]` (via parent) |
| `src/routes/leave.ts` | 405–481 | `GET`/`POST /leave/employees/:id/requests` (via parent) |
| `src/routes/leave.ts` | 483–631 | `PATCH`/`DELETE /leave-requests/:requestId` |
| `src/routes/sickness.ts` | 86–173 | `GET`/`POST /sickness/employees/:id` (via parent) |
| `src/routes/sickness.ts` | 175–255 | `PATCH`/`DELETE /sickness-absences/:absenceId` |
| `src/routes/training.ts` | 148–197 | `GET`/`POST /training/employees/:id` (via parent) |
| `src/routes/training.ts` | 199–282 | `PATCH`/`DELETE /training-records/:recordId` |
| `src/routes/onboarding.ts` | 83–132 | `GET`/`POST /onboarding/employees/:id/tasks` (via parent) |
| `src/routes/onboarding.ts` | 134–197 | `PATCH`/`DELETE /onboarding-tasks/:taskId` |
| `src/routes/benefits.ts` | 141–209, 260–325 | `GET`/`POST /employees/:id/benefits`, `GET /employees/:id/total-reward` (via parent) |
| `src/routes/benefits.ts` | 211–258 | `PATCH`/`DELETE /employee-benefits/:employeeBenefitId` |
| `src/routes/pay.ts` | 207–221 | `POST /pay/bulk-review` trusts `employeeId`s from the request body |

---

## Category 5 — Public / un-authed routes that need explicit tenant resolution

These run before any session exists, so they cannot read `req.tenantId`. The plan
recommends `/apply/:tenantSlug` to resolve the tenant from the URL.

| File | Line | Route | Where it must get `tenant_id` |
| --- | ---: | --- | --- |
| `src/routes/public.ts` | 33–58 | `GET /public/jobs` (lists all open jobs) | Resolve tenant from slug; filter jobs to that tenant only |
| `src/routes/public.ts` | 85–170 | `POST /public/applications` (the `/apply` flow) | Resolve tenant from slug; stamp candidate/docs/stage-history with it |
| `src/routes/public.ts` | 60–83 | `POST /public/storage/uploads/request-url` | Mint upload key under the resolved tenant's prefix (see Cat 6) |

---

## Category 6 — Object storage paths

Keys are minted as `<PRIVATE_OBJECT_DIR>/uploads/<uuid>` with **no tenant
segment**, and `objectPath` is accepted from clients. Phase D needs a
`<tenant_id>/…` prefix and a prefix-match check on read (the route is the only
enforcement point — Replit App Storage has no IAM fallback).

| File | Line | Problem | Suggested fix |
| --- | ---: | --- | --- |
| `src/lib/objectStorage.ts` | 109–129 | `getObjectEntityUploadURL()` mints `…/uploads/<uuid>` with no tenant prefix | Prefix the key with `<tenant_id>/` |
| `src/lib/objectStorage.ts` | 131–155 | `getObjectEntityFile()` resolves any `/objects/*` path with no tenant prefix check | Require + verify the `<tenant_id>/` prefix against the caller |
| `src/routes/storage.ts` | 53–129 | `GET /storage/public-objects/*` and `/storage/objects/*` serve by path with no tenant prefix check (ACL block is commented out) | Enforce the tenant prefix before `downloadObject` |
| `src/routes/public.ts` | 96–103 | Accepts `objectPath` from the apply body; only regex-checks `^/objects/uploads/<id>$` | Also require the path to sit under the resolved tenant's prefix |
| `src/routes/employees.ts` | 407–417 | `POST /employees/:id/documents` stores client-supplied `objectPath` verbatim | Validate the path's tenant prefix matches `req.tenantId` |
| `src/routes/recruitment.ts` | 174–186 | `convert-to-employee` copies candidate-doc `objectPath`s into employee docs | Re-prefix/validate on copy so the key stays within the tenant |

> Also note: `training.certificate_object_path` and
> `candidate_documents.object_path` are stored object keys — anywhere they are set
> from client input needs the same prefix check.

---

## Category 7 — Background / seed / template logic (no HTTP tenant context)

Each must establish a tenant context before touching DB tables.

| File | Line | Problem | Suggested fix |
| --- | ---: | --- | --- |
| `scripts/post-merge.sh` | 1–4 | Runs `pnpm --filter db push` (schema migration) outside any request | Migrations run as the elevated role; ensure backfills are tenant-aware (`WHERE tenant_id IS NULL` guards per plan §B) |
| `src/lib/leaveDefaults.ts` | 21–27 | Hardcoded UK leave entitlement defaults applied to every tenant | Source defaults per-tenant (DB-backed) once tenants can differ |
| `src/lib/onboardingTemplates.ts` | 9–44 | `buildOnboardingTaskRows(employeeId, …)` builds rows from a global template with no tenant | Pass/stamp `tenant_id`; source template per-tenant |
| `src/lib/trainingTemplates.ts` | 8–19 | `buildMandatoryTrainingRows(employeeId)` builds from a global Lloyd's template | Pass/stamp `tenant_id`; source template per-tenant |
| `src/routes/leave.ts` | 349–403 | `POST /leave/employees/:id/seed-defaults` seeds entitlements for an employee with no tenant check | Verify the employee's tenant; stamp seeded rows with it |
| `src/routes/leave.ts` | 93–143 | `recalcUsedDays()` upserts on `(employeeId, year, leaveType)` conflict target | Add `tenant_id` to the conflict target once the unique index is composite (Cat 1) |

---

## Category 8 — Activity log / audit trail

`activityLogTable` has **no `tenant_id` column** (`lib/db/src/schema/employees.ts`
74–84). Phase B must add it and stamp it at every insertion site. All sites flow
through `logActivity()` (`src/lib/activity.ts` 3–17) or the inline copy in
`employees.ts`.

| File | Line | Insertion site (action) |
| --- | ---: | --- |
| `src/lib/activity.ts` | 10–16 | `logActivity()` — shared helper; needs a `tenant_id` param threaded through |
| `src/routes/employees.ts` | 105–111 | inline `logActivity()` copy (employee create/update/delete/salary/doc) |
| `src/routes/candidates.ts` | ~219, ~275, ~321 | `create` / `delete` / `stage_change` candidate |
| `src/routes/jobs.ts` | ~94, ~130, ~145 | `create` / `update` / `delete` job |
| `src/routes/interviews.ts` | ~52, ~112 | `interview_scheduled` / `interview_completed` |
| `src/routes/offers.ts` | ~70, ~147 | `offer_sent` / `offer_<status>` |
| `src/routes/recruitment.ts` | 237–242 | `hire` |
| `src/routes/import.ts` | 235–241 | `import` (bulk) |
| `src/routes/leave.ts` | ~464, ~578 | `leave_requested` / `leave_approved`\|`leave_declined` |
| `src/routes/sickness.ts` | ~166 | `sickness_logged` |
| `src/routes/training.ts` | ~252 | `training_completed` |
| `src/routes/onboarding.ts` | ~172 | `onboarding_task_completed` |
| `src/routes/benefits.ts` | ~84, ~207 | `benefit_created` / `benefit_assigned` |
| `src/routes/pay.ts` | 252–257 | `bulk_pay_review` |

---

## Category 9 — Anything else that looks risky

| File | Line | Problem | Suggested fix |
| --- | ---: | --- | --- |
| `src/routes/pay.ts` | 40–51 | Raw `db.execute(sql\`SELECT … FROM employees … MAX(salary_changes…)\`)` — no tenant filter in outer query or subquery | Add `e.tenant_id = $1` and a matching predicate in the subquery |
| `src/routes/pay.ts` | 61–74 | `/pay/stats` loads all employees (`db.select().from(employeesTable)`) and aggregates in memory across tenants | Filter by `tenant_id` before aggregating |
| `src/routes/pay.ts` | 76–94 | `/pay/by-department` `COUNT/SUM/AVG/MIN/MAX` grouped with no tenant predicate | Add `eq(employeesTable.tenantId, …)` to the `where` |
| `src/routes/dashboard.ts` | 7–47 | `/dashboard/stats` global `count(*)` over employees + documents, payroll sums — all tenants | Add tenant filter to every query |
| `src/routes/dashboard.ts` | 51–66 | `/dashboard/activity` returns latest 15 `activity_log` rows across all tenants | Add `eq(activityLogTable.tenantId, …)` |
| `src/routes/dashboard.ts` | 70–119 | `/dashboard/department-breakdown` and `/upcoming-anniversaries` aggregate all tenants | Add tenant filter |
| `src/lib/rateLimit.ts` | 4, 16 | Global in-memory bucket `Map` keyed only by `keyPrefix:clientKey` (IP); two tenants behind one IP share limits | Include `tenant_id` in the bucket key |
| `src/lib/email.ts` | transporter cache + send fns | Transporter cached globally by `host\|port\|user`; send fns don't tie sender/recipient to a tenant | If SMTP config or branding becomes per-tenant, key the cache by tenant and pass tenant context |

---

## Notes for the Phase B/C implementer

- **Order matters.** Category 0 (Phase A middleware) and Category 1 schema
  changes (tenant-scoped uniques) gate everything else. Category 4 fixes are only
  *belt* — Phase C RLS (`FORCE ROW LEVEL SECURITY` + `SET LOCAL app.current_tenant`)
  is the *braces*, and the plan treats it as non-optional precisely because there
  are 30 trust-the-id sites here that someone will inevitably miss.
- **Helpers are mostly pure.** `salaryBands.ts`, `bradford.ts`, `workingDays.ts`,
  `logger.ts`, and `health.ts` touch no DB and need no change; they're listed here
  only to record that they were checked.
- This audit is a checklist, not a design — no fix above has been implemented.
