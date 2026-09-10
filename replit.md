# Amiga Specialty HR — Project Blueprint

A complete reference for the Amiga Specialty HR app, the supporting API, and the
shared workspace it lives in. Keep this file up to date as the product evolves.

---

## 1. The product, in one paragraph

Amiga Specialty HR is an internal HR system for **Amiga Specialty**, a London-based
MGA (Managing General Agent) in the specialty insurance market. It gives a small
HR team and the leadership group a single place to manage the full employee
lifecycle: hiring (jobs + public applications + interviews + offers), onboarding
(checklists + mandatory training), the working year (leave, sickness, pay,
benefits), and the supporting back office (bulk import, email notifications,
documents). The brand is intentionally polished — navy `#000033`, gold `#C5A059`,
Inter for UI text and Fraunces for headlines — to look credible in front of
prospective hires and as a demo for similar MGA clients.

---

## 2. Personas and what each can do

The app is single-tenant and protected by **real Clerk authentication**
(Replit-managed Clerk). Signed-out visitors see a branded landing page and must
sign in (Google or email) via Clerk's hosted components; the API rejects
unauthenticated requests to protected routes with `401`. Because Replit-managed
Clerk has no Organizations, we authenticate the **user** only and keep the
tenant fixed to `DEFAULT_TENANT_ID` (multi-tenant plumbing stays dormant).

**Roles are now enforced** (3-tier RBAC). Every signed-in Clerk user is resolved
to an `app_users` row (by `clerkUserId`, created on first sight). The user is
linked to a staff record by **case-insensitive email match** against
`employees.email`. The **first user ever to sign in becomes `admin`**; everyone
after defaults to `employee`. A signed-in non-admin with **no matching employee
record** sees a "no access yet" screen and can reach nothing else. Roles live in
our own DB, not in Clerk. Frontend gating is UX only; the real enforcement is the
server-side `resolveAppUser` + `authorize` middleware (admin = everything;
non-admins restricted to an explicit allowlist with per-handler ownership checks).
Admins manage roles + employee links on the **Users & Roles** screen
(`/admin/users`); a last-admin guard prevents demoting/unlinking the only admin.

### HR admin (first sign-in, or assigned via Users & Roles)

Sees every screen in the sidebar and can do everything in the app:

- Manage employees (create, edit, terminate, document upload, salary changes).
- Run the recruitment pipeline (post jobs, review applicants, schedule
  interviews, send offers, convert hires).
- Approve / decline leave, log sickness, run pay reviews, assign benefits.
- Bulk-import employees from Excel / CSV.
- Configure email notifications and send a test message.

### Manager (line manager)

A linked employee whose `app_users.role = manager`. Lands on **Team leave**
(`/team-leave`). Oversees their **direct reports** (employees whose `managerId`
points at the manager's employee record) and the **recruitment roles they own**
(jobs whose `hiringManagerId` points at them). Manager-scoped screens:

- **Team leave** (`/team-leave`) — approve / decline leave for direct reports.
  `GET /leave` + `PATCH /leave-requests/:id` are server-scoped to their team.
- **Team sickness** (`/team-sickness`) — read-only Bradford-sorted absences for
  direct reports. `GET /sickness` + `GET /sickness/employees/:id` are scoped.
- **Team pay** (`/team-pay`) — read-only salary for direct reports. The
  per-employee read routes (`GET /employees/:id`, salary-history, documents,
  benefits, total-reward) authorize on admin | self | direct-report.
- **Team recruitment** (`/team-recruitment`) — candidates on jobs they own.
  `GET /candidates` + `GET /candidates/:id` are scoped to `ownedJobIds`.

All scoping is enforced **server-side** (mirroring the leave pattern) via
`authz.ts` helpers (`directReportIds`, `canViewEmployeeOrReport`, `ownedJobIds`)
plus a per-route allowlist with an optional `roles` filter. Managers also have
the employee self-service screens (own leave + read-only profile). They cannot
see the admin-only operational screens (Employees, Recruitment admin, Pay admin,
Settings, Users & Roles, etc.).

### Employee (self-service portal)

A linked employee whose `app_users.role = employee`. Lands on **My leave**
(`/my-leave`) and can:

- Submit and cancel their **own** leave requests (cancel only while `pending`).
- View the shared leave **calendar** (names only, no deep-link to colleague records).
- View a **read-only** "My profile" page (`/my-profile`) — employment details,
  pay and benefits. No edit access anywhere.

Employees still receive system-generated emails (welcome, leave decision, etc.).
The "first-sign-in temp password" copy in the welcome email is forward-looking.

### Public candidate (`/apply`)

The only un-authenticated screen. Anyone with the link can:

- Browse open jobs (`GET /api/public/jobs`).
- Upload a CV / cover letter / right-to-work doc to public object storage.
- Submit an application (`POST /api/public/applications`), which creates a
  candidate at stage `new` and sends them a confirmation email.

---

## 3. Sidebar map (every page in the app)

All entries below are live in `artifacts/amiga-hr/src/components/layout.tsx`:

| Sidebar label | Route        | Page file                          | Purpose                                                                   |
| ------------- | ------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| Dashboard     | `/dashboard` | `pages/dashboard.tsx`              | KPI tiles, leave/sickness alerts, recent activity, anniversaries.         |
| Employees     | `/employees` | `pages/employees.tsx`              | Searchable employee list with status / department filters.                |
| (detail)      | `/employees/:id` | `pages/employee-detail.tsx`    | Tabs: Personal · Employment · Documents · Salary · Onboarding · Training · Leave · Sickness · Benefits. Deep-linked via `?tab=`. |
| Recruitment   | `/recruitment` | `pages/recruitment.tsx`            | Jobs list + candidate pipeline (kanban by stage); "Post a role" + share `/apply` link. |
| (detail)      | `/candidates/:id` | `pages/candidate-detail.tsx`    | Move stage, schedule interview, create / accept / decline offer, **Convert to employee**. |
| Onboarding    | `/onboarding` | `pages/onboarding.tsx`             | Onboarding hub — tasks across all new starters.                           |
| Training      | `/training` | `pages/training.tsx`               | Training register, expiring certifications, mandatory training overview.  |
| Leave         | `/leave`    | `pages/leave.tsx`                  | All / Calendar / Pending tabs, off-today banner.                          |
| Sickness      | `/sickness` | `pages/sickness.tsx`               | Bradford-sorted absences with risk-band filters, off-sick-today banner.   |
| Pay           | `/pay`      | `pages/pay.tsx`                    | Pay & compensation dashboard, salary bands, due-for-review, bulk reviews. |
| Benefits      | `/benefits` | `pages/benefits.tsx`               | Benefits catalogue + per-employee assignment.                             |
| Import        | `/import`   | `pages/import.tsx`                 | 3-step bulk-import wizard (template → preview → commit).                  |
| Settings      | `/settings` | `pages/settings.tsx`               | SMTP status, instructions, test-send, list of triggered emails.           |
| —             | `/`         | `pages/landing.tsx`                | Branded landing for signed-out users (Sign in → Clerk); redirects signed-in users to `/dashboard`. |
| —             | `/sign-in/*`, `/sign-up/*` | (Clerk components)      | Clerk hosted sign-in / sign-up, branded via shadcn appearance.            |
| —             | `/apply`    | `pages/apply.tsx`                  | Public job-application form (no auth).                                    |

---

## 4. End-to-end flows

### 4.1 Recruitment → Onboarding (the conversion happy path)

1. Admin clicks **Post a role** on `/recruitment` → job is created with
   `status: open` (`POST /api/jobs`). The dialog includes an optional **hiring
   manager** select (`hiringManagerId`); the assigned manager can then see that
   job's candidates on their **Team recruitment** screen.
2. Admin shares the public `/apply` link (or candidates find it independently).
3. Candidate submits `/apply` → `POST /api/public/applications` creates a
   candidate at stage `new`, attaches uploaded docs, fires
   **`sendApplicationConfirmation`** email.
4. Admin opens the candidate page, walks them through pipeline stages
   (`new → cv_review → shortlisted → phone_screen → interview_1/2/3 →
   assessment → offer_pending → offered → hired` or `→ rejected`). Each move
   calls `POST /api/candidates/:id/stage` and fires
   **`sendCandidateStageChange`** (skipped for `rejected`).
5. Schedule an interview → `POST /api/candidates/:id/interviews` →
   **`sendInterviewInvitation`**.
6. Create an offer (`POST /api/candidates/:id/offers`); when its status is
   `sent`, fire **`sendOfferLetterNotification`**.
7. Mark the offer **Accepted** in the Offers tab. The gold
   **"Convert to employee"** button appears in the candidate header.
8. Click **Convert to employee** → `POST /api/candidates/:id/convert-to-employee`
   atomically:
   - Locks the candidate row (`SELECT ... FOR UPDATE` via Drizzle `.for("update")`).
   - Allocates the next `AMG####` employee number under
     `LOCK TABLE employees IN SHARE ROW EXCLUSIVE` (with retry on unique
     violation).
   - Inserts the employee, an initial `salary_changes` row, copies candidate
     documents into `employee_documents`, sets `candidate.hiredEmployeeId`,
     writes a stage-history entry, and seeds the onboarding checklist +
     mandatory training.
9. The new hire shows up in `/employees` with their AMG#### number; the
   candidate page now shows "Hired" + a **View employee record** button.

> **Important:** the conversion is manual on purpose (so HR can correct salary,
> start date, department before the record is created). Never replace the typed
> `.for("update")` Drizzle select with raw `tx.execute(sql\`SELECT * ...\`)` — raw
> SQL returns snake_case columns and breaks both the insert and the
> idempotency check.

### 4.2 Bulk employee import (Stage 5)

A 3-step wizard at `/import`:

1. **Template** — Click **Download template** (`GET /api/import/template`) to
   get a styled `.xlsx` with the canonical header row.
2. **Upload & preview** — Drop or pick an `.xlsx` / `.xls` / `.csv` (5 MB cap).
   `POST /api/import/preview` (multipart) parses the file with `xlsx`,
   normalises headers, strictly validates calendar dates (rejects
   `2026-02-31`), flags both occurrences of any in-file duplicate email, and
   de-duplicates against existing employees. Each row comes back tagged
   `ok` or `error` with human-readable error chips.
3. **Commit** — Toggle "Send welcome emails" (requires a temporary password) and
   click **Import**. `POST /api/import/commit` re-validates, allocates
   `AMG####` numbers inside a transaction, inserts employees + initial
   `salary_changes`, then sends welcome emails in parallel via
   `Promise.allSettled` with a 20s per-message hard timeout. The success
   screen lists the new employees with their AMG numbers.

### 4.3 Leave request lifecycle

1. Employee leave is created via `POST /api/leave/employees/:id/requests`
   (today this is initiated by HR on behalf of the employee).
2. **`sendLeaveRequestNotification`** is sent to `HR_NOTIFICATION_EMAIL`
   (skipped silently if that env var is unset).
3. HR reviews on `/leave` (Pending tab) and approves or declines via
   `PATCH /api/leave-requests/:requestId`. **`sendLeaveDecisionNotification`**
   goes to the employee.
4. Approved leave is allocated to the calendar-year buckets it actually
   overlaps (cross-year requests are split correctly when computing usage).
5. Approved leave appears in the calendar view and the off-today banner.

### 4.4 Sickness logging

1. Log an absence under `POST /api/sickness/employees/:id`.
2. On `/sickness`, absences are listed sorted by **Bradford Factor** —
   `(spells in last 12 months)² × total days lost in last 12 months`. Bands:
   `low <50`, `medium 50–99`, `high 100–199`, `critical ≥200`.
3. Off-sick-today banner shows current open absences. Risk-band pills filter
   the list.

### 4.5 Email notifications (Stage 5)

Email is **lazy and best-effort everywhere**: if SMTP is not configured,
`sendMail()` no-ops and returns `{sent:false}`. No business flow ever fails
because of email.

| Trigger                                             | Helper                          | Recipient                  |
| --------------------------------------------------- | ------------------------------- | -------------------------- |
| Bulk import commit (per new employee)               | `sendWelcomeEmail`              | Employee                   |
| Public application submitted                        | `sendApplicationConfirmation`   | Candidate                  |
| Candidate moved to a new stage (skips `rejected`)   | `sendCandidateStageChange`      | Candidate                  |
| Interview scheduled                                 | `sendInterviewInvitation`       | Candidate                  |
| Offer status set to `sent`                          | `sendOfferLetterNotification`   | Candidate                  |
| Leave request created                               | `sendLeaveRequestNotification`  | `HR_NOTIFICATION_EMAIL`    |
| Leave request decision (approve / decline)          | `sendLeaveDecisionNotification` | Employee                   |
| Settings → Send test email                          | `sendTestEmail`                 | Address you typed          |

All helpers HTML-escape user-controlled values, strip CR/LF from subjects, and
share the navy + gold branded shell. The transporter has a 10s connect / 10s
greeting / 15s socket timeout.

---

## 5. API reference (everything mounted under `/api`)

All routers are wired in `artifacts/api-server/src/routes/index.ts`. Inputs and
outputs are validated with Zod (`zod/v4` + `drizzle-zod`); typed React hooks are
generated by Orval from `lib/api-spec/openapi.yaml`.

### Health & storage

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`  | `/healthz` | Liveness probe. |
| `POST` | `/storage/uploads/request-url` | Signed upload URL for authenticated docs. |
| `GET`  | `/storage/public-objects/*filePath` | Serve a public stored object. |
| `GET`  | `/storage/objects/*path` | Serve a private stored object. |

### Employees

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`  | `/employees` | List (search, filter). |
| `POST` | `/employees` | Create. |
| `GET`  | `/employees/:id` | Get one. |
| `PATCH`| `/employees/:id` | Update. |
| `DELETE` | `/employees/:id` | Delete. |
| `GET`  | `/employees/:id/salary-history` | Salary changes. |
| `POST` | `/employees/:id/salary-history` | Add salary change. |
| `GET`  | `/employees/:id/documents` | List employee documents. |
| `POST` | `/employees/:id/documents` | Attach uploaded doc metadata. |
| `DELETE` | `/documents/:docId` | Delete a document record. |

### Dashboard

`GET /dashboard/stats`, `/dashboard/activity`,
`/dashboard/department-breakdown`, `/dashboard/upcoming-anniversaries`.

### Recruitment

Jobs: `GET/POST /jobs`, `GET/PATCH/DELETE /jobs/:id`.

Candidates: `GET/POST /candidates`, `GET/PATCH/DELETE /candidates/:id`,
`POST /candidates/:id/stage`, `GET/POST /candidates/:id/documents`,
`DELETE /candidate-documents/:docId`.

Interviews: `GET/POST /candidates/:id/interviews`,
`PATCH/DELETE /interviews/:id`.

Offers: `GET/POST /candidates/:id/offers`, `PATCH/DELETE /offers/:id`.

Conversion: `POST /candidates/:id/convert-to-employee` (atomic — see flow 4.1).

Recruitment dashboard: `GET /recruitment/stats`.

### Public (no auth)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`  | `/public/jobs` | Open roles for the apply form. |
| `POST` | `/public/storage/uploads/request-url` | Signed upload URL (rate-limited). |
| `POST` | `/public/applications` | Submit application + send confirmation email (rate-limited). |

### Onboarding

`GET /onboarding/overview`, `GET/POST /onboarding/employees/:id/tasks`,
`PATCH/DELETE /onboarding-tasks/:taskId`.

### Training

`GET /training`, `GET /training/stats`, `GET/POST /training/employees/:id`,
`PATCH/DELETE /training-records/:recordId`.

### Leave

`GET /leave` (filters), `GET /leave/calendar`, `GET /leave/stats`,
`GET /leave/employees/:id/entitlements`, `PUT /leave/employees/:id/seed-defaults`,
`POST /leave/employees/:id/requests`, `GET /leave/employees/:id/requests`,
`POST /leave/employees/:id/entitlements`,
`PATCH/DELETE /leave-requests/:requestId`.

Standard entitlements (days/year): annual=25, maternity=183, paternity=14,
compassionate=5, study=5. Working-day counter is Mon–Fri inclusive (no holiday
calendar yet).

### Sickness

`GET /sickness` (Bradford-sorted), `GET /sickness/employees/:id`,
`POST /sickness/employees/:id`, `PATCH/DELETE /sickness-absences/:absenceId`.

### Pay

`GET /pay/stats`, `/pay/by-department`, `/pay/salary-bands`,
`/pay/recent-changes`, `/pay/due-for-review`, `POST /pay/bulk-review`.

### Benefits

Catalogue: `GET/POST /benefits`, `PATCH/DELETE /benefits/:benefitId`.

Employee: `GET/POST /employees/:id/benefits`,
`PATCH/DELETE /employee-benefits/:employeeBenefitId`,
`GET /employees/:id/total-reward`.

### Import

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`  | `/import/template` | Download styled `.xlsx` template. |
| `POST` | `/import/preview` | Multipart upload → row-by-row validation. |
| `POST` | `/import/commit` | Transactional insert + parallel welcome emails. |

### Settings

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`  | `/settings/email` | `{configured, host?, from?, missing[]}`. |
| `POST` | `/settings/email/test` | Send a test message (`{to}`). |

---

## 6. Database schema

PostgreSQL via `lib/db` (Drizzle ORM). Schemas live in `lib/db/src/schema/*.ts`.
Currency defaults to GBP. Seed data: 12 sample employees AMG0001–AMG0012 across
8 departments + dev test employee AMG0013.

| Table | Purpose | Key columns |
| ----- | ------- | ----------- |
| `app_users` | Signed-in Clerk users + their role. | `clerk_user_id` (UNIQUE), `email`, `role` (admin/manager/employee), `employee_id` (nullable link to staff), `tenant_id` |
| `employees` | The roster. | `id`, `employee_number` (UNIQUE), `first_name`, `last_name`, `email` (UNIQUE), `job_title`, `department`, `status`, `employment_type`, `start_date`, `end_date`, `salary`, `currency`, `manager_id` (self-FK) |
| `salary_changes` | Time-series of pay decisions. | `employee_id`, `previous_salary`, `new_salary`, `percent_change`, `effective_date`, `reason` |
| `employee_documents` | Files attached to an employee. | `employee_id`, `name`, `category`, `object_path`, `mime_type` |
| `activity_log` | Audit trail surfaced in the dashboard. | `action`, `entity_type`, `entity_id`, `summary`, `actor` |
| `jobs` | Open / closed roles. | `title`, `department`, `location`, `salary_min/max`, `status`, `closing_date`, `hiring_manager_id` (nullable FK → employees, ON DELETE SET NULL — owning line manager) |
| `candidates` | Applications. | `first_name`, `last_name`, `email`, `job_id`, `current_stage`, `source`, `right_to_work_status`, `expected_salary`, `applied_at`, `hired_employee_id`, `rejected_reason` |
| `candidate_documents` | CVs, cover letters, RTW. | `candidate_id`, `name`, `category`, `object_path` |
| `candidate_stage_history` | Pipeline movement audit. | `candidate_id`, `from_stage`, `to_stage`, `note`, `changed_by`, `changed_at` |
| `interviews` | Scheduled & completed. | `candidate_id`, `type`, `scheduled_for`, `interviewer_name`, `status`, `outcome`, `score`, `feedback` |
| `offers` | Offer letters. | `candidate_id`, `salary`, `start_date`, `employment_type`, `contract_type`, `status`, `sent_at`, `responded_at`, `declined_reason` |
| `onboarding_tasks` | Per-employee checklist. | `employee_id`, `title`, `category`, `due_date`, `status`, `is_custom`, `sort_order` |
| `training_records` | Certifications & expiry. | `employee_id`, `name`, `category`, `provider`, `completed_date`, `expiry_date`, `status`, `is_mandatory`, `certificate_object_path` |
| `leave_entitlements` | Per-year annual/maternity/etc. allowance. | `employee_id`, `year`, `leave_type`, `entitled_days`, `carried_over_days`, `used_days` |
| `leave_requests` | Requests + decisions. | `employee_id`, `leave_type`, `start_date`, `end_date`, `working_days`, `status`, `reviewed_by`, `reviewed_at`, `reviewer_note` |
| `sickness_absences` | Spells of sickness. | `employee_id`, `start_date`, `end_date`, `days_lost`, `self_certified`, `fit_note_received`, `return_to_work_completed` |
| `benefits_catalog` | Available benefits. | `name`, `category`, `provider`, `default_annual_value`, `is_active` |
| `employee_benefits` | Assignments. | `employee_id`, `benefit_id`, `employer_contribution`, `employee_contribution`, `annual_value`, `start_date`, `end_date` |

---

## 7. Environment variables

| Variable | Required? | Used for |
| -------- | --------- | -------- |
| `PORT` | yes (set by Replit) | API server bind port. |
| `DATABASE_URL` | yes | PostgreSQL connection (set by Replit). |
| `SESSION_SECRET` | yes | Session signing (set by Replit). |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | yes | App Storage bucket (set by Replit). |
| `PUBLIC_OBJECT_SEARCH_PATHS` | yes for object storage | Public file roots. |
| `PRIVATE_OBJECT_DIR` | yes for object storage | Private upload root. |
| `SMTP_HOST` | optional | SMTP server (e.g. `smtp.gmail.com`). |
| `SMTP_PORT` | optional (default 587) | SMTP port. |
| `SMTP_USER` | optional | SMTP username. |
| `SMTP_PASS` | optional | SMTP password / app password. |
| `SMTP_FROM` | optional | `From:` address (e.g. `HR <hr@amigaspecialty.com>`). |
| `APP_URL` | optional | Base URL used in branded emails; falls back to first entry of `REPLIT_DOMAINS`. |
| `HR_NOTIFICATION_EMAIL` | optional | Recipient for leave-request HR notifications. If unset, those emails are skipped. |
| `NODE_ENV` | optional | Switches logger transport. |
| `LOG_LEVEL` | optional (default `info`) | Pino log level. |
| `CLERK_SECRET_KEY` | yes | Clerk backend key (used by `@clerk/express` and the Clerk proxy). |
| `CLERK_PUBLISHABLE_KEY` | yes | Clerk frontend key (server-side, used by `publishableKeyFromHost`). |
| `VITE_CLERK_PUBLISHABLE_KEY` | yes | Clerk frontend key exposed to the Vite client for `ClerkProvider`. |
| `DATABASE_URL_APP` | optional (Phase C) | Reserved for a future least-privilege, RLS-enforced application role. Not used yet. |

Email is configured iff **all four of** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM` are set. The `/settings` page surfaces exactly which ones are
missing.

---

## 8. Architecture & conventions

### Workspace layout (pnpm monorepo)

- `artifacts/api-server` — Express 5 + Drizzle. Builds to a single CJS bundle
  via esbuild. Logging via `req.log` (request-scoped) and the singleton
  `logger`; never `console.log`.
- `artifacts/amiga-hr` — Vite 7 + React 19 + Wouter + Tailwind + shadcn UI +
  framer-motion. Sidebar in `components/layout.tsx`. Uses
  `@workspace/object-storage-web` (Uppy) for direct-to-object-storage uploads.
- `artifacts/mockup-sandbox` — Vite preview server for component variants on
  the Canvas (not part of the user-facing product).
- `lib/db` — Drizzle schemas + migrations.
- `lib/api-spec` — OpenAPI source of truth (`openapi.yaml`).
- `lib/api-zod`, `lib/api-client-react` — generated Zod schemas and React Query
  hooks. Regenerate with `pnpm --filter @workspace/api-spec run codegen`.

### Contract-first API workflow

1. Edit `lib/api-spec/openapi.yaml`.
2. Run `pnpm --filter @workspace/api-spec run codegen`.
3. Use the generated Zod schemas in route handlers for input/output validation.
4. Use the generated React Query hooks in the frontend (no hand-written
   `fetch`).

### Service routing (proxy)

A global reverse proxy routes by path using each artifact's
`.replit-artifact/artifact.toml`. Use `localhost:80/api/...` for ad-hoc calls;
never call individual ports directly.

### Branding tokens

- Navy `#000033` — primary surfaces, headers.
- Gold `#C5A059` — accents, primary CTAs.
- Background `#F8F7F4` — page canvas.
- Fonts: **Inter** for body / UI, **Fraunces** (Georgia fallback) for
  serif headlines.

---

## 9. Common commands

```bash
# Type-check everything
pnpm run typecheck

# Type-check a single artifact
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/amiga-hr run typecheck

# Regenerate API hooks + Zod schemas after editing openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push
```

Workflows are the only way to run the apps — never `pnpm dev` from the root.

---

## 10. Known gaps / future work

- **Auth** uses real Clerk (Replit-managed) and gates all protected API routes,
  with **3-tier RBAC** (admin / manager / employee) enforced server-side. What is
  *not* yet built: org/multi-tenant separation (Replit-managed Clerk has no
  Organizations, so tenant is fixed to `DEFAULT_TENANT_ID`); manager scoping
  now covers **leave, sickness, pay (read-only), and candidates on owned jobs**
  (managers still cannot *edit* employees, run pay reviews, or move candidate
  stages — their team views are read-only except for leave approvals); and there
  is no self-service flow for an employee to *edit* their own profile (read-only
  today).
- **Manager hierarchy** is a single-level self-FK (`employees.managerId`). There
  is no multi-level org chart / skip-level reporting.
- **Welcome-email temp password** is set per-import via a single field. There
  is no first-sign-in password-rotation flow yet.
- **Training expiry reminders** are documented as a trigger but there is no
  cron — they would need to be scheduled (Replit Scheduled Deployments).
- **Convert-to-employee** is single-tenant safe (row lock + table lock on
  `AMG####` allocation, with retry on unique violation), but at higher
  concurrency consider a dedicated sequence.
