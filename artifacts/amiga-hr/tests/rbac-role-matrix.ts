/**
 * RBAC role-matrix smoke test for Amiga Specialty HR.
 *
 * WHAT THIS GUARDS
 * ----------------
 * Verifies that each role can only reach its allowed screens (frontend route
 * gating + home redirects), that a signed-out visitor can still reach the
 * public application journey, and that non-admins are blocked (403) from
 * admin-only API endpoints. It catches regressions where a future change
 * accidentally exposes an admin screen to a manager/employee, breaks a role's
 * home redirect, redirects applicants to sign-in, or loosens server-side
 * authorization.
 *
 * HOW TO RUN
 * ----------
 * This repo has no standalone test runner; UI/auth tests run through Replit's
 * Playwright-based testing skill, which supports programmatic Clerk sign-in
 * (`testClerkAuth: true`) and `[DB]` setup steps. Replay the matrix from the
 * code_execution sandbox:
 *
 *   import { buildRoleMatrixPlans, buildSignedOutVisitorPlan, RBAC_TECH_DOC, SIGNED_OUT_TECH_DOC } from
 *     "../../artifacts/amiga-hr/tests/rbac-role-matrix";
 *
 *   for (const { role, plan } of buildRoleMatrixPlans()) {
 *     const res = await runTest({
 *       testPlan: plan,
 *       relevantTechnicalDocumentation: RBAC_TECH_DOC,
 *       testClerkAuth: true,
 *     });
 *     console.log(role, res.status); // expect "success" for every role
 *   }
 *
 *   const visitor = buildSignedOutVisitorPlan();
 *   const visitorResult = await runTest({
 *     testPlan: visitor.plan,
 *     relevantTechnicalDocumentation: SIGNED_OUT_TECH_DOC,
 *     testClerkAuth: true,
 *   });
 *   console.log("signed-out visitor", visitorResult.status); // expect "success"
 *
 *   const application = buildSignedOutApplicationPlan();
 *   const applicationResult = await runTest({
 *     testPlan: application.plan,
 *     relevantTechnicalDocumentation: SIGNED_OUT_APPLICATION_TECH_DOC,
 *     testClerkAuth: true,
 *   });
 *   console.log("signed-out application", applicationResult.status); // expect "success"
 *
 * Run the `admin` scenario first (or on its own) — at bootstrap the very first
 * Clerk user to sign in becomes the tenant admin; every scenario then forces
 * its own role via a `[DB]` UPDATE, so the others are order-independent.
 *
 * MECHANISM (per scenario)
 * ------------------------
 *  1. Programmatic Clerk sign-in with a unique email.
 *  2. Navigate to "/" so the app calls GET /api/me and bootstraps the
 *     app_users row (keyed by clerk_user_id).
 *  3. [DB] UPDATE app_users (matched by lower(email)) to force the role +
 *     employee link under test.
 *  4. Reload so the frontend re-fetches /api/me and applies the role.
 *  5. Assert home redirect, allowed/forbidden route access, role-filtered
 *     sidebar links, and API status.
 *
 * The web app uses cookie-based Clerk sessions, so a same-origin
 * `fetch('/api/...')` from the page automatically carries the session — that is
 * how the 403 checks are made.
 */

export type RoleName = "admin" | "manager" | "employee" | "unlinked";

export interface RoleMatrixScenario {
  role: RoleName;
  /** A unique email is generated per build so reruns never collide. */
  email: string;
  /** Full step-by-step plan string passed to `runTest({ testPlan })`. */
  plan: string;
}

export interface MobileRoleMenuScenario {
  /** Unique Clerk login email used for the manager replay. */
  managerEmail: string;
  /** Unique Clerk login email used for the employee replay. */
  employeeEmail: string;
  /** Full mobile role-menu plan string passed to `runTest({ testPlan })`. */
  plan: string;
}

export const PUBLIC_APPLICATION_TEST_TENANT_ID =
  "a0000000-0000-4000-8000-000000000001";

export const RBAC_TECH_DOC = `
APP: "Amiga Specialty HR" (web, served at base path "/"). API server routed at "/api" via the shared proxy (same origin, cookie-based Clerk session — a same-origin fetch from the page automatically carries the session cookie).

ROLE MODEL:
- A signed-in Clerk user is resolved to an app_users row (created on first GET /api/me request, keyed by clerk_user_id). Roles live in the DB: app_users.role in ('admin','manager','employee'); app_users.employee_id is a nullable link to employees.id; app_users.email stores the Clerk primary email.
- Frontend route gating (RoleGate) depends ONLY on role + linked status:
  - admin: may reach EVERY route; home = /dashboard
  - manager: may reach /team-leave, /my-leave, /my-profile; home = /team-leave; any other gated route redirects to /team-leave
  - employee: may reach /my-leave, /my-profile; home = /my-leave; any other gated route redirects to /my-leave
  - unlinked (role employee but employee_id NULL, and not admin): EVERY gated route redirects to /no-access; home = /no-access
- Server authorize() middleware: admin = full access; non-admin (manager/employee) only an allowlist; handlers scope the allowed reads to the caller. A manager's GET /api/employees returns 200 with a direct-reports-scoped list, while admin-only routes such as GET /api/dashboard/stats return 403. GET /api/me is always allowed for any signed-in user => 200.

DB: table app_users(id, clerk_user_id, email, role, employee_id, tenant_id). Seeded employees: id=1 AMG0001, id=2 AMG0002, id=3 AMG0003.

TEST SETUP: After Clerk sign-in, navigate to "/" so the app calls GET /api/me and bootstraps the app_users row. Then use a [DB] UPDATE on app_users (match by lower(email)) to force the role + employee link for this test. Then reload so the frontend re-fetches /api/me and applies the role.
`.trim();

function randomEmail(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}@amigatest.com`;
}

function adminPlan(email: string): string {
  return `
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Ada", lastName: "Admin", email: "${email}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row, then redirects).
4. [DB] Force this user to be a linked ADMIN: UPDATE app_users SET role='admin', employee_id=1 WHERE lower(email)=lower('${email}');
5. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
6. [Verify] Assert the user is redirected to the admin home (URL path becomes /dashboard) and the Dashboard renders.
7. [Browser] Navigate to the Employees page (path: /employees).
8. [Verify] Assert the Employees page renders and the URL stays at /employees (NOT redirected away).
9. [Browser] Navigate to the Users & Roles page (path: /admin/users).
10. [Verify] Assert the page renders and the URL stays at /admin/users.
11. [Browser] Navigate to the admin home (path: /dashboard).
12. [Verify] Assert the sidebar shows links for Dashboard (data-testid="sidebar-link-dashboard"), Employees (data-testid="sidebar-link-employees"), and Users & roles (data-testid="sidebar-link-admin-users").
13. [Browser] In the page context, run this fetch and report the numeric HTTP status: await fetch('/api/employees', { headers: { accept: 'application/json' } }).then(r => r.status)
14. [Verify] Assert the reported status for GET /api/employees is 200 (admin has API access).
`.trim();
}

function managerPlan(email: string): string {
  return `
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Marcus", lastName: "Manager", email: "${email}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
4. [DB] Force this user to be a linked MANAGER: UPDATE app_users SET role='manager', employee_id=2 WHERE lower(email)=lower('${email}');
5. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
6. [Verify] Assert redirected to the manager home (URL path becomes /team-leave) and the Team leave page renders.
7. [Verify] Assert the sidebar shows Team leave (data-testid="sidebar-link-team-leave"), My leave (data-testid="sidebar-link-my-leave"), and My profile (data-testid="sidebar-link-my-profile"), and does NOT show Dashboard (data-testid="sidebar-link-dashboard"), Employees (data-testid="sidebar-link-employees"), or Users & roles (data-testid="sidebar-link-admin-users").
8. [Browser] Navigate to My leave (path: /my-leave).
9. [Verify] Assert the My leave page renders and URL stays at /my-leave (allowed for managers).
10. [Browser] Navigate to the admin-only Dashboard (path: /dashboard).
11. [Verify] Assert the manager is redirected AWAY to /team-leave (NOT allowed to see /dashboard).
12. [Browser] Navigate to the admin-only Users & Roles (path: /admin/users).
13. [Verify] Assert the manager is redirected AWAY to /team-leave (NOT allowed).
14. [Browser] In the page context run and report the numeric HTTP status: await fetch('/api/employees', { headers: { accept: 'application/json' } }).then(r => r.status)
15. [Verify] Assert the status for GET /api/employees is 200 (the manager receives a list scoped to their direct reports).
16. [Browser] In the page context run and report the numeric HTTP status: await fetch('/api/dashboard/stats', { headers: { accept: 'application/json' } }).then(r => r.status)
17. [Verify] Assert the status for GET /api/dashboard/stats is 403 (admin-only endpoint blocked for a manager).
`.trim();
}

function employeePlan(email: string): string {
  return `
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Ella", lastName: "Employee", email: "${email}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
4. [DB] Force this user to be a linked EMPLOYEE: UPDATE app_users SET role='employee', employee_id=3 WHERE lower(email)=lower('${email}');
5. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
6. [Verify] Assert redirected to the employee home (URL path becomes /my-leave) and the My leave page renders.
7. [Verify] Assert the sidebar shows My leave (data-testid="sidebar-link-my-leave") and My profile (data-testid="sidebar-link-my-profile"), and does NOT show Team leave (data-testid="sidebar-link-team-leave"), Dashboard (data-testid="sidebar-link-dashboard"), Employees (data-testid="sidebar-link-employees"), or Users & roles (data-testid="sidebar-link-admin-users").
8. [Browser] Navigate to My profile (path: /my-profile).
9. [Verify] Assert the My profile page renders and URL stays at /my-profile (allowed for employees).
10. [Browser] Navigate to the manager-only Team leave (path: /team-leave).
11. [Verify] Assert the employee is redirected AWAY to /my-leave (NOT allowed to see /team-leave).
12. [Browser] Navigate to the admin-only Dashboard (path: /dashboard).
13. [Verify] Assert the employee is redirected AWAY to /my-leave (NOT allowed).
14. [Browser] In the page context run and report the numeric HTTP status: await fetch('/api/employees', { headers: { accept: 'application/json' } }).then(r => r.status)
15. [Verify] Assert the status for GET /api/employees is 403 (admin-only endpoint blocked for an employee).
`.trim();
}

function unlinkedPlan(email: string): string {
  return `
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Nora", lastName: "NoLink", email: "${email}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
4. [DB] Force this user to be an UNLINKED non-admin: UPDATE app_users SET role='employee', employee_id=NULL WHERE lower(email)=lower('${email}');
5. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
6. [Verify] Assert redirected to /no-access and the "no access" screen renders.
7. [Browser] Navigate to the self-service My leave (path: /my-leave).
8. [Verify] Assert the unlinked user is redirected to /no-access (cannot reach any gated screen).
9. [Browser] Navigate to the admin-only Dashboard (path: /dashboard).
10. [Verify] Assert the unlinked user is redirected to /no-access.
11. [Browser] In the page context run and report the numeric HTTP status: await fetch('/api/me', { headers: { accept: 'application/json' } }).then(r => r.status)
12. [Verify] Assert the status for GET /api/me is 200 (an unlinked user can still load /me to render the no-access screen).
13. [Browser] In the page context run and report the numeric HTTP status: await fetch('/api/employees', { headers: { accept: 'application/json' } }).then(r => r.status)
14. [Verify] Assert the status for GET /api/employees is 403 (unlinked non-admin has no API access).
`.trim();
}

function mobileRoleMenuPlan(managerEmail: string, employeeEmail: string): string {
  return `
This is a mobile-only replay of the role-filtered navigation checks. Both
browser contexts must use a 390 x 844 mobile viewport so the responsive Sheet
menu is rendered instead of the desktop sidebar.

--- MANAGER MOBILE MENU ---
1. [New Context] Create a new browser context with viewport width 390 and height 844.
2. [Clerk Auth] Sign in as {firstName: "Marcus", lastName: "Mobile Manager", email: "${managerEmail}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
4. [DB] Force this user to be a linked MANAGER: UPDATE app_users SET role='manager', employee_id=2 WHERE lower(email)=lower('${managerEmail}');
5. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
6. [Verify] Assert redirected to the manager home (URL path becomes /team-leave) and the Team leave page renders.
7. [Browser] Open the mobile navigation menu by clicking the button data-testid="mobile-menu-trigger".
8. [Verify] Within the open mobile navigation menu, assert the same role-filtered links as the desktop matrix:
   - Team leave (data-testid="sidebar-link-team-leave"), My leave (data-testid="sidebar-link-my-leave"), and My profile (data-testid="sidebar-link-my-profile") are visible.
   - Dashboard (data-testid="sidebar-link-dashboard"), Employees (data-testid="sidebar-link-employees"), and Users & roles (data-testid="sidebar-link-admin-users") are NOT visible.

--- EMPLOYEE MOBILE MENU ---
9. [New Context] Create a second browser context with viewport width 390 and height 844.
10. [Clerk Auth] Sign in as {firstName: "Ella", lastName: "Mobile Employee", email: "${employeeEmail}"}.
11. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
12. [DB] Force this user to be a linked EMPLOYEE: UPDATE app_users SET role='employee', employee_id=3 WHERE lower(email)=lower('${employeeEmail}');
13. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
14. [Verify] Assert redirected to the employee home (URL path becomes /my-leave) and the My leave page renders.
15. [Browser] Open the mobile navigation menu by clicking the button data-testid="mobile-menu-trigger".
16. [Verify] Within the open mobile navigation menu, assert the same role-filtered links as the desktop matrix:
   - My leave (data-testid="sidebar-link-my-leave") and My profile (data-testid="sidebar-link-my-profile") are visible.
   - Team leave (data-testid="sidebar-link-team-leave"), Dashboard (data-testid="sidebar-link-dashboard"), Employees (data-testid="sidebar-link-employees"), and Users & roles (data-testid="sidebar-link-admin-users") are NOT visible.
`.trim();
}

/**
 * DATA-SCOPING test (separate from the screen/route matrix above).
 *
 * WHAT THIS GUARDS
 * ----------------
 * The role matrix proves *which screens* a manager can reach. This proves the
 * *data scoping underneath* the manager's leave screens:
 *   - GET /api/leave returns ONLY the manager's own + direct-reports' requests
 *     (a non-report's request must be absent), and
 *   - PATCH /api/leave-requests/:id lets the manager decide a direct report's
 *     request (200) but is forbidden (403) on a non-report's request —
 *     i.e. a manager cannot view or approve leave for staff outside their team.
 *
 * Seed data has no manager relationships, so the plan builds its own little org
 * via [DB] inserts: a manager employee, one direct report (managerId → manager)
 * and one non-report (managerId NULL), each with a pending leave request. All
 * rows use a per-run token so reruns never collide. Scoping is enforced
 * server-side in routes/leave.ts (GET /leave + PATCH /leave-requests/:id), so
 * the checks are made with same-origin fetches that carry the Clerk session.
 */
export const LEAVE_SCOPE_TENANT_ID = "a0000000-0000-4000-8000-000000000001";

export interface ManagerLeaveScopeScenario {
  /** Clerk login email for the manager under test. */
  email: string;
  /** Per-run token embedded in all seeded rows so reruns never collide. */
  run: string;
  /** Full step-by-step plan string passed to `runTest({ testPlan })`. */
  plan: string;
}

function managerLeaveScopePlan(email: string, run: string): string {
  const t = LEAVE_SCOPE_TENANT_ID;
  return `
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Mona", lastName: "Manager", email: "${email}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
4. [DB] Insert the MANAGER employee and capture the returned id as \${managerEmpId}:
   INSERT INTO employees (tenant_id, employee_number, first_name, last_name, email, job_title, department, status, employment_type, start_date, salary) VALUES ('${t}', 'MGR-${run}', 'Mona', 'Manager', 'mona-${run}@amigatest.com', 'Engineering Manager', 'Engineering', 'active', 'full_time', '2020-01-01', '90000') RETURNING id;
5. [DB] Insert a DIRECT REPORT (manager_id points at the manager) and capture the returned id as \${reportEmpId}:
   INSERT INTO employees (tenant_id, employee_number, first_name, last_name, email, job_title, department, status, employment_type, start_date, salary, manager_id) VALUES ('${t}', 'RPT-${run}', 'Rita', 'Report', 'rita-${run}@amigatest.com', 'Engineer', 'Engineering', 'active', 'full_time', '2021-01-01', '60000', \${managerEmpId}) RETURNING id;
6. [DB] Insert a NON-REPORT (manager_id NULL — NOT on this manager's team) and capture the returned id as \${otherEmpId}:
   INSERT INTO employees (tenant_id, employee_number, first_name, last_name, email, job_title, department, status, employment_type, start_date, salary, manager_id) VALUES ('${t}', 'OTH-${run}', 'Otto', 'Other', 'otto-${run}@amigatest.com', 'Engineer', 'Operations', 'active', 'full_time', '2021-01-01', '60000', NULL) RETURNING id;
7. [DB] Create a PENDING leave request for the direct report and capture the returned id as \${reportReqId}:
   INSERT INTO leave_requests (tenant_id, employee_id, leave_type, start_date, end_date, working_days, status) VALUES ('${t}', \${reportEmpId}, 'annual', '2026-07-01', '2026-07-03', '3', 'pending') RETURNING id;
8. [DB] Create a PENDING leave request for the non-report and capture the returned id as \${otherReqId}:
   INSERT INTO leave_requests (tenant_id, employee_id, leave_type, start_date, end_date, working_days, status) VALUES ('${t}', \${otherEmpId}, 'annual', '2026-07-01', '2026-07-03', '3', 'pending') RETURNING id;
9. [DB] Link the signed-in user to the manager employee as a MANAGER:
   UPDATE app_users SET role='manager', employee_id=\${managerEmpId} WHERE lower(email)=lower('${email}');
10. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
11. [Verify] Assert the user is redirected to the manager home (URL path becomes /team-leave) and the Team leave page renders.
12. [Browser] In the page context run this fetch and report the raw JSON result:
    await fetch('/api/leave', { headers: { accept: 'application/json' } }).then(r => r.json())
13. [Verify] On the GET /api/leave result (an array of leave requests, each with numeric employeeId and id):
    - Assert it CONTAINS an item whose id === \${reportReqId} (employeeId === \${reportEmpId}) — the manager sees their direct report's request.
    - Assert it does NOT contain any item whose id === \${otherReqId} or whose employeeId === \${otherEmpId} — the non-report's request is hidden from the manager.
14. [Browser] In the page context run this fetch and report the numeric HTTP status (deciding the DIRECT REPORT's request):
    await fetch('/api/leave-requests/' + \${reportReqId}, { method: 'PATCH', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ status: 'approved' }) }).then(r => r.status)
15. [Verify] Assert the status for PATCH on the direct report's request is 200 (a manager may approve their own team's leave).
16. [Browser] In the page context run this fetch and report the numeric HTTP status (attempting to decide the NON-REPORT's request):
    await fetch('/api/leave-requests/' + \${otherReqId}, { method: 'PATCH', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ status: 'approved' }) }).then(r => r.status)
17. [Verify] Assert the status for PATCH on the non-report's request is 403 (a manager may NOT approve leave for staff outside their team).
`.trim();
}

/**
 * Technical context for the leave-request OWNERSHIP scenario. This guards the
 * per-row rules that live inside the handlers (separate from coarse route
 * gating): an employee may create + cancel only their OWN leave, cancel only
 * while it is still pending, and must never read or mutate a colleague's
 * request.
 */
export const LEAVE_OWNERSHIP_TECH_DOC = `
APP: "Amiga Specialty HR" (web, base path "/"). API server routed at "/api" via the shared proxy (same origin, cookie-based Clerk session — a same-origin fetch from the page automatically carries the session cookie).

OWNERSHIP RULES UNDER TEST (enforced server-side in artifacts/api-server/src/routes/leave.ts, independent of frontend route gating):
- POST /api/leave/employees/:id/requests — a non-admin may create a request ONLY for their own linked employee id (else 403).
- GET  /api/leave/employees/:id/requests — a non-admin may read ONLY their own requests (else 403).
- PATCH /api/leave-requests/:requestId —
    * On their OWN request: an employee may ONLY cancel it (set status='cancelled', no edits, no reviewer fields), and ONLY while it is still 'pending'. Cancelling a non-pending (e.g. already-approved) request => 403.
    * On ANY OTHER employee's request: an employee is forbidden => 403.

DB: seeded employees id=1 AMG0001, id=2 AMG0002, id=3 AMG0003. Tenant is fixed: tenant_id='a0000000-0000-4000-8000-000000000001'. leave_requests columns include: tenant_id, employee_id, leave_type, start_date, end_date, working_days, status ('pending'|'approved'|'declined'|'cancelled'). app_users(clerk_user_id, email, role, employee_id).

TEST SETUP: After Clerk sign-in, navigate to "/" so the app calls GET /api/me and bootstraps the app_users row. Then a [DB] UPDATE on app_users (match by lower(email)) forces role='employee', employee_id=3. Reload so the frontend re-fetches /api/me and applies the role. All API status checks are made with a same-origin fetch() run in the page context (the Clerk session cookie rides along automatically).
`.trim();

function employeeLeaveOwnershipPlan(email: string): string {
  return `
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Leo", lastName: "Leave", email: "${email}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
4. [DB] Force this user to be a linked EMPLOYEE on employee id=3: UPDATE app_users SET role='employee', employee_id=3 WHERE lower(email)=lower('${email}');
5. [Browser] Navigate to My leave (path: /my-leave) to force a fresh /api/me fetch.

--- OWN REQUEST: create + cancel a still-pending request (happy path) ---
6. [Browser] In the page context, create the employee's OWN leave request and report BOTH the numeric HTTP status and the returned id:
   await fetch('/api/leave/employees/3/requests', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ leaveType: 'annual', startDate: '2031-03-03', endDate: '2031-03-05', reason: 'own' }) }).then(async r => ({ status: r.status, id: (await r.json()).id }))
7. [Verify] Assert the reported status is 201 (an employee may create their OWN leave request). Remember the returned id as OWN_ID.
8. [Browser] In the page context, cancel that OWN still-pending request and report the numeric HTTP status:
   await fetch('/api/leave-requests/' + OWN_ID, { method: 'PATCH', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) }).then(r => r.status)
9. [Verify] Assert the reported status is 200 (an employee may cancel their OWN pending request).

--- OWN REQUEST: cancelling a NON-pending request is rejected ---
10. [Browser] In the page context, create a second OWN leave request and report the status and id:
    await fetch('/api/leave/employees/3/requests', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ leaveType: 'annual', startDate: '2031-04-07', endDate: '2031-04-09', reason: 'appr' }) }).then(async r => ({ status: r.status, id: (await r.json()).id }))
11. [Verify] Assert the status is 201. Remember the returned id as APPROVED_ID.
12. [DB] Move that request out of 'pending' so it can no longer be self-cancelled: UPDATE leave_requests SET status='approved' WHERE id = APPROVED_ID;
13. [Browser] In the page context, attempt to cancel the now-approved OWN request and report the numeric HTTP status:
    await fetch('/api/leave-requests/' + APPROVED_ID, { method: 'PATCH', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) }).then(r => r.status)
14. [Verify] Assert the reported status is 403 (an employee may cancel only a STILL-PENDING request, never an already-decided one).

--- ANOTHER EMPLOYEE'S REQUEST: fully blocked (403) ---
15. [DB] Create a PENDING leave request that belongs to a DIFFERENT employee (id=1) and return its id: INSERT INTO leave_requests (tenant_id, employee_id, leave_type, start_date, end_date, working_days, status) VALUES ('a0000000-0000-4000-8000-000000000001', 1, 'annual', '2031-05-05', '2031-05-07', '3', 'pending') RETURNING id; -- remember this id as OTHER_ID
16. [Browser] In the page context, attempt to cancel ANOTHER employee's request and report the numeric HTTP status:
    await fetch('/api/leave-requests/' + OTHER_ID, { method: 'PATCH', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) }).then(r => r.status)
17. [Verify] Assert the reported status is 403 (an employee must NOT act on a colleague's leave request).
18. [Browser] In the page context, attempt to READ another employee's requests and report the numeric HTTP status:
    await fetch('/api/leave/employees/1/requests', { headers: { accept: 'application/json' } }).then(r => r.status)
19. [Verify] Assert the reported status is 403 (an employee must NOT read a colleague's leave requests).
20. [Browser] In the page context, attempt to CREATE a request for another employee and report the numeric HTTP status:
    await fetch('/api/leave/employees/1/requests', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ leaveType: 'annual', startDate: '2031-06-06', endDate: '2031-06-08', reason: 'should-fail' }) }).then(r => r.status)
21. [Verify] Assert the reported status is 403 (an employee must NOT create leave for a colleague).

--- Cleanup ---
22. [DB] Remove the rows created by this test: DELETE FROM leave_requests WHERE id IN (OWN_ID, APPROVED_ID, OTHER_ID);
`.trim();
}

/**
 * Build a fresh manager-leave-scoping scenario with a unique login email and a
 * per-run token for all seeded rows.
 */
export function buildManagerLeaveScopePlan(): ManagerLeaveScopeScenario {
  const run = Math.random().toString(36).slice(2, 8);
  const email = `mgrscope-${run}@amigatest.com`;
  return { email, run, plan: managerLeaveScopePlan(email, run) };
}

/**
 * DATA-SCOPING test for a manager's SICKNESS + PAY (read-only employee) views.
 *
 * WHAT THIS GUARDS
 * ----------------
 * Mirrors the leave-scope proof for the *other* manager-readable surfaces. It
 * proves that a manager can only ever see staff on their own team:
 *   - GET /api/sickness returns ONLY the manager's own + direct-reports'
 *     absences (a non-report's absence must be absent).
 *   - GET /api/sickness/employees/:id is 200 for a direct report but 403 for a
 *     non-report.
 *   - GET /api/employees/:id and its per-employee read routes
 *     (salary-history, total-reward, benefits, documents) authorize on
 *     admin | self | direct-report: 200 for a direct report, 403 for a
 *     non-report.
 *
 * As with the leave scope plan, seed data has no manager relationships, so the
 * plan builds its own org via [DB] inserts (manager + direct report + a
 * non-report) with a per-run token so reruns never collide, then asserts via
 * same-origin fetches that carry the Clerk session. The plan cleans up every
 * row it seeds at the end (sickness first, then employees, then the app_users
 * login — all matched by the per-run token / @amigatest.com marker).
 */
export interface ManagerSickPayScopeScenario {
  /** Clerk login email for the manager under test. */
  email: string;
  /** Per-run token embedded in all seeded rows so reruns never collide. */
  run: string;
  /** Full step-by-step plan string passed to `runTest({ testPlan })`. */
  plan: string;
}

function managerSickPayScopePlan(email: string, run: string): string {
  const t = LEAVE_SCOPE_TENANT_ID;
  return `
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Sara", lastName: "Manager", email: "${email}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
4. [DB] Insert the MANAGER employee and capture the returned id as \${managerEmpId}:
   INSERT INTO employees (tenant_id, employee_number, first_name, last_name, email, job_title, department, status, employment_type, start_date, salary) VALUES ('${t}', 'SMGR-${run}', 'Sara', 'Manager', 'sara-${run}@amigatest.com', 'Engineering Manager', 'Engineering', 'active', 'full_time', '2020-01-01', '90000') RETURNING id;
5. [DB] Insert a DIRECT REPORT (manager_id points at the manager) and capture the returned id as \${reportEmpId}:
   INSERT INTO employees (tenant_id, employee_number, first_name, last_name, email, job_title, department, status, employment_type, start_date, salary, manager_id) VALUES ('${t}', 'SRPT-${run}', 'Rhys', 'Report', 'rhys-${run}@amigatest.com', 'Engineer', 'Engineering', 'active', 'full_time', '2021-01-01', '60000', \${managerEmpId}) RETURNING id;
6. [DB] Insert a NON-REPORT (manager_id NULL — NOT on this manager's team) and capture the returned id as \${otherEmpId}:
   INSERT INTO employees (tenant_id, employee_number, first_name, last_name, email, job_title, department, status, employment_type, start_date, salary, manager_id) VALUES ('${t}', 'SOTH-${run}', 'Olga', 'Other', 'olga-${run}@amigatest.com', 'Engineer', 'Operations', 'active', 'full_time', '2021-01-01', '60000', NULL) RETURNING id;
7. [DB] Log a SICKNESS absence for the direct report and capture the returned id as \${reportAbsId}:
   INSERT INTO sickness_absences (tenant_id, employee_id, start_date, end_date, days_lost, self_certified) VALUES ('${t}', \${reportEmpId}, '2026-05-01', '2026-05-02', '2', true) RETURNING id;
8. [DB] Log a SICKNESS absence for the non-report and capture the returned id as \${otherAbsId}:
   INSERT INTO sickness_absences (tenant_id, employee_id, start_date, end_date, days_lost, self_certified) VALUES ('${t}', \${otherEmpId}, '2026-05-01', '2026-05-02', '2', true) RETURNING id;
9. [DB] Link the signed-in user to the manager employee as a MANAGER:
   UPDATE app_users SET role='manager', employee_id=\${managerEmpId} WHERE lower(email)=lower('${email}');
10. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
11. [Verify] Assert the user is redirected to the manager home (URL path becomes /team-leave) and the Team leave page renders.
12. [Browser] In the page context run this fetch and report the raw JSON result:
    await fetch('/api/sickness', { headers: { accept: 'application/json' } }).then(r => r.json())
13. [Verify] On the GET /api/sickness result (an array of absences, each with numeric id and employeeId):
    - Assert it CONTAINS an item whose id === \${reportAbsId} (employeeId === \${reportEmpId}) — the manager sees their direct report's absence.
    - Assert it does NOT contain any item whose id === \${otherAbsId} or whose employeeId === \${otherEmpId} — the non-report's absence is hidden from the manager.
14. [Browser] In the page context run this SINGLE-EXPRESSION fetch (so it runs in the page and carries the session cookie) and report the raw JSON result (a map of endpoint -> numeric HTTP status):
    await Promise.all([fetch('/api/sickness/employees/' + \${reportEmpId}, { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/sickness/employees/' + \${otherEmpId}, { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees/' + \${reportEmpId}, { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees/' + \${otherEmpId}, { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees/' + \${reportEmpId} + '/salary-history', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees/' + \${otherEmpId} + '/salary-history', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees/' + \${reportEmpId} + '/total-reward', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees/' + \${otherEmpId} + '/total-reward', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees/' + \${reportEmpId} + '/benefits', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees/' + \${otherEmpId} + '/benefits', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees/' + \${reportEmpId} + '/documents', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees/' + \${otherEmpId} + '/documents', { headers: { accept: 'application/json' } }).then(r => r.status)]).then(([reportSickness, otherSickness, reportEmployee, otherEmployee, reportSalary, otherSalary, reportTotalReward, otherTotalReward, reportBenefits, otherBenefits, reportDocuments, otherDocuments]) => ({ reportSickness, otherSickness, reportEmployee, otherEmployee, reportSalary, otherSalary, reportTotalReward, otherTotalReward, reportBenefits, otherBenefits, reportDocuments, otherDocuments }))
15. [Verify] On that status map:
    - Assert EVERY "report*" status (reportSickness, reportEmployee, reportSalary, reportTotalReward, reportBenefits, reportDocuments) is 200 — a manager may read all of their direct report's sickness + pay data.
    - Assert EVERY "other*" status (otherSickness, otherEmployee, otherSalary, otherTotalReward, otherBenefits, otherDocuments) is 403 — a manager may NOT read any sickness or pay data for staff outside their team.
16. [DB] CLEAN UP every row this scenario seeded (run in order):
    DELETE FROM sickness_absences WHERE employee_id IN (SELECT id FROM employees WHERE employee_number LIKE 'S%-${run}');
    DELETE FROM app_users WHERE lower(email)=lower('${email}');
    DELETE FROM employees WHERE employee_number LIKE 'S%-${run}';
`.trim();
}

/**
 * Build a fresh manager sickness + pay scoping scenario with a unique login
 * email and a per-run token for all seeded rows.
 */
export function buildManagerSickPayScopePlan(): ManagerSickPayScopeScenario {
  const run = Math.random().toString(36).slice(2, 8);
  const email = `sickpayscope-${run}@amigatest.com`;
  return { email, run, plan: managerSickPayScopePlan(email, run) };
}

/**
 * DATA-SCOPING test for a manager's RECRUITMENT (candidates) view.
 *
 * WHAT THIS GUARDS
 * ----------------
 * Proves that a manager only ever sees candidates applying for the jobs they
 * own (jobs whose `hiringManagerId` points at the manager's employee record):
 *   - GET /api/candidates returns ONLY candidates on the manager's owned jobs
 *     (a candidate on a job the manager does not own must be absent).
 *   - GET /api/candidates/:id is 200 for a candidate on an owned job but 403
 *     for a candidate on a non-owned job.
 *
 * The plan seeds its own org via [DB] inserts (a manager, one job the manager
 * owns + one job they do not, and one candidate on each) with a per-run token,
 * then asserts via same-origin fetches that carry the Clerk session. It cleans
 * up every seeded row at the end (candidates first, then jobs, then the
 * app_users login, then the employee — all matched by the per-run token).
 */
export interface ManagerCandidateScopeScenario {
  /** Clerk login email for the manager under test. */
  email: string;
  /** Per-run token embedded in all seeded rows so reruns never collide. */
  run: string;
  /** Full step-by-step plan string passed to `runTest({ testPlan })`. */
  plan: string;
}

function managerCandidateScopePlan(email: string, run: string): string {
  const t = LEAVE_SCOPE_TENANT_ID;
  return `
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Cara", lastName: "Manager", email: "${email}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
4. [DB] Insert the MANAGER employee and capture the returned id as \${managerEmpId}:
   INSERT INTO employees (tenant_id, employee_number, first_name, last_name, email, job_title, department, status, employment_type, start_date, salary) VALUES ('${t}', 'CMGR-${run}', 'Cara', 'Manager', 'cara-${run}@amigatest.com', 'Engineering Manager', 'Engineering', 'active', 'full_time', '2020-01-01', '90000') RETURNING id;
5. [DB] Insert a job the manager OWNS (hiring_manager_id points at the manager) and capture the returned id as \${ownedJobId}:
   INSERT INTO jobs (tenant_id, title, department, hiring_manager_id) VALUES ('${t}', 'Owned Role ${run}', 'Engineering', \${managerEmpId}) RETURNING id;
6. [DB] Insert a job the manager does NOT own (hiring_manager_id NULL) and capture the returned id as \${otherJobId}:
   INSERT INTO jobs (tenant_id, title, department, hiring_manager_id) VALUES ('${t}', 'Other Role ${run}', 'Operations', NULL) RETURNING id;
7. [DB] Insert a candidate on the OWNED job and capture the returned id as \${ownedCandId}:
   INSERT INTO candidates (tenant_id, first_name, last_name, email, job_id, current_stage) VALUES ('${t}', 'Owen', 'Owned', 'owen-${run}@amigatest.com', \${ownedJobId}, 'new') RETURNING id;
8. [DB] Insert a candidate on the NON-OWNED job and capture the returned id as \${otherCandId}:
   INSERT INTO candidates (tenant_id, first_name, last_name, email, job_id, current_stage) VALUES ('${t}', 'Nina', 'NotMine', 'nina-${run}@amigatest.com', \${otherJobId}, 'new') RETURNING id;
9. [DB] Link the signed-in user to the manager employee as a MANAGER:
   UPDATE app_users SET role='manager', employee_id=\${managerEmpId} WHERE lower(email)=lower('${email}');
10. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
11. [Verify] Assert the user is redirected to the manager home (URL path becomes /team-leave) and the Team leave page renders.
12. [Browser] In the page context run this fetch and report the raw JSON result:
    await fetch('/api/candidates', { headers: { accept: 'application/json' } }).then(r => r.json())
13. [Verify] On the GET /api/candidates result (an array of candidates, each with numeric id and jobId):
    - Assert it CONTAINS an item whose id === \${ownedCandId} (jobId === \${ownedJobId}) — the manager sees candidates on the job they own.
    - Assert it does NOT contain any item whose id === \${otherCandId} or whose jobId === \${otherJobId} — candidates on jobs the manager does not own are hidden.
14. [Browser] In the page context run this SINGLE-EXPRESSION fetch (so it runs in the page and carries the session cookie) and report the raw JSON result (a map of endpoint -> numeric HTTP status):
    await Promise.all([fetch('/api/candidates/' + \${ownedCandId}, { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/candidates/' + \${otherCandId}, { headers: { accept: 'application/json' } }).then(r => r.status)]).then(([ownedCandidate, otherCandidate]) => ({ ownedCandidate, otherCandidate }))
15. [Verify] On that status map:
    - Assert ownedCandidate is 200 — a manager may read a candidate on a job they own.
    - Assert otherCandidate is 403 — a manager may NOT read a candidate on a job they do not own.
16. [DB] CLEAN UP every row this scenario seeded (run in order):
    DELETE FROM candidates WHERE email LIKE '%-${run}@amigatest.com';
    DELETE FROM jobs WHERE title LIKE '%${run}';
    DELETE FROM app_users WHERE lower(email)=lower('${email}');
    DELETE FROM employees WHERE employee_number LIKE 'CMGR-${run}';
`.trim();
}

/**
 * Build a fresh manager candidate (recruitment) scoping scenario with a unique
 * login email and a per-run token for all seeded rows.
 */
export function buildManagerCandidateScopePlan(): ManagerCandidateScopeScenario {
  const run = Math.random().toString(36).slice(2, 8);
  const email = `candscope-${run}@amigatest.com`;
  return { email, run, plan: managerCandidateScopePlan(email, run) };
}

/**
 * Build the employee leave-request OWNERSHIP scenario with a unique email.
 * Pair the returned `plan` with {@link LEAVE_OWNERSHIP_TECH_DOC} and run via
 * `runTest({ testPlan, relevantTechnicalDocumentation, testClerkAuth: true })`.
 */
export function buildLeaveOwnershipPlan(): { email: string; plan: string } {
  const email = randomEmail("leaveowner");
  return { email, plan: employeeLeaveOwnershipPlan(email) };
}

/**
 * AUTHORIZATION test: a plain EMPLOYEE is blocked from the manager-only
 * surfaces entirely.
 *
 * WHAT THIS GUARDS
 * ----------------
 * The manager scope plans prove a *manager* only sees their own team's
 * sickness, pay, and owned-job candidates. This proves the *other half*: a
 * linked *employee*-role user (NOT a manager) is rejected with 403 from every
 * manager-only endpoint, because the server allowlist tags sickness, team-pay
 * reads, and candidate reads as `roles: ["manager"]`. Specifically:
 *   - GET /api/sickness                 => 403
 *   - GET /api/sickness/employees/:id   => 403
 *   - GET /api/candidates               => 403
 *   - GET /api/candidates/:id           => 403
 *
 * The user is a *linked* employee (employee_id set) so the rejection is the
 * manager-only allowlist path (403 "forbidden"), NOT the unlinked-user path
 * (403 "no_access"). The plan seeds a real sickness absence and a real
 * candidate so the per-id endpoints reference existing rows — proving the
 * block is by role, not because the row is missing. All seeded rows use a
 * per-run token / @amigatest.com marker and are cleaned up at the end.
 */
export interface EmployeeManagerOnlyBlockedScenario {
  /** Clerk login email for the employee under test. */
  email: string;
  /** Per-run token embedded in all seeded rows so reruns never collide. */
  run: string;
  /** Full step-by-step plan string passed to `runTest({ testPlan })`. */
  plan: string;
}

function employeeManagerOnlyBlockedPlan(email: string, run: string): string {
  const t = LEAVE_SCOPE_TENANT_ID;
  return `
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Eli", lastName: "Employee", email: "${email}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
4. [DB] Insert the EMPLOYEE record this login links to and capture the returned id as \${empId}:
   INSERT INTO employees (tenant_id, employee_number, first_name, last_name, email, job_title, department, status, employment_type, start_date, salary) VALUES ('${t}', 'EMP-${run}', 'Eli', 'Employee', 'eli-${run}@amigatest.com', 'Engineer', 'Engineering', 'active', 'full_time', '2021-01-01', '60000') RETURNING id;
5. [DB] Log a SICKNESS absence for that employee and capture the returned id as \${absId} (so GET /api/sickness/employees/:id references a real row):
   INSERT INTO sickness_absences (tenant_id, employee_id, start_date, end_date, days_lost, self_certified) VALUES ('${t}', \${empId}, '2026-05-01', '2026-05-02', '2', true) RETURNING id;
6. [DB] Insert a job and capture the returned id as \${jobId}:
   INSERT INTO jobs (tenant_id, title, department) VALUES ('${t}', 'Some Role ${run}', 'Engineering') RETURNING id;
7. [DB] Insert a CANDIDATE on that job and capture the returned id as \${candId} (so GET /api/candidates/:id references a real row):
   INSERT INTO candidates (tenant_id, first_name, last_name, email, job_id, current_stage) VALUES ('${t}', 'Cody', 'Candidate', 'cody-${run}@amigatest.com', \${jobId}, 'new') RETURNING id;
8. [DB] Link the signed-in user to that employee as a plain EMPLOYEE (NOT a manager):
   UPDATE app_users SET role='employee', employee_id=\${empId} WHERE lower(email)=lower('${email}');
9. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
10. [Verify] Assert the user is redirected to the employee home (URL path becomes /my-leave) and the My leave page renders.
11. [Browser] In the page context run this SINGLE-EXPRESSION fetch (so it runs in the page and carries the session cookie) and report the raw JSON result (a map of endpoint -> numeric HTTP status):
    await Promise.all([fetch('/api/sickness', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/sickness/employees/' + \${empId}, { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/candidates', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/candidates/' + \${candId}, { headers: { accept: 'application/json' } }).then(r => r.status)]).then(([sicknessList, sicknessById, candidatesList, candidateById]) => ({ sicknessList, sicknessById, candidatesList, candidateById }))
12. [Verify] On that status map, assert EVERY value (sicknessList, sicknessById, candidatesList, candidateById) is 403 — a plain employee is blocked from all manager-only sickness and candidate endpoints.
13. [DB] CLEAN UP every row this scenario seeded (run in order):
    DELETE FROM sickness_absences WHERE employee_id IN (SELECT id FROM employees WHERE employee_number LIKE 'EMP-${run}');
    DELETE FROM candidates WHERE email LIKE '%-${run}@amigatest.com';
    DELETE FROM jobs WHERE title LIKE '%${run}';
    DELETE FROM app_users WHERE lower(email)=lower('${email}');
    DELETE FROM employees WHERE employee_number LIKE 'EMP-${run}';
`.trim();
}

/**
 * ADMIN leave-DECISION test (the HR approve / decline happy path).
 *
 * WHAT THIS GUARDS
 * ----------------
 * Proves that an HR admin can approve and decline leave requests without the
 * runtime crash that previously affected EVERY decision: the entitlement
 * upsert inside recalcUsedDays once had an ON CONFLICT target missing
 * `tenant_id`, throwing Postgres 42P10 → HTTP 500 on approve/decline/cancel/
 * seed. This test exercises that path end-to-end:
 *   - admin approves a pending request (PATCH status='approved') => 200, and
 *     the employee's annual entitlement `usedDays` increases by exactly the
 *     request's working days (entitlement recalculation works end-to-end), and
 *   - admin declines a separate pending request => 200 with NO change to
 *     `usedDays` (only approved leave consumes entitlement).
 *
 * The plan seeds a dedicated employee (per-run token, no other leave) so the
 * `usedDays` baseline is clean and the delta is unambiguous. Both requests use
 * 'annual' leave inside a single calendar year (2032) so the recalc lands in
 * one entitlement bucket. All API calls are same-origin page fetches that carry
 * the admin Clerk session. Every seeded row is cleaned up at the end.
 */
export const ADMIN_LEAVE_DECISION_TECH_DOC = `
APP: "Amiga Specialty HR" (web, base path "/"). API server routed at "/api" via the shared proxy (same origin, cookie-based Clerk session — a same-origin fetch from the page automatically carries the session cookie).

ADMIN DECISION PATH UNDER TEST (artifacts/api-server/src/routes/leave.ts):
- POST /api/leave/employees/:id/requests — admin may create a pending request for ANY employee; response is 201 with the created request as JSON (numeric id, numeric workingDays, status 'pending').
- PATCH /api/leave-requests/:requestId with { status: 'approved' } or { status: 'declined' } — admin may decide any request; response is 200 with the updated request.
- GET /api/leave/employees/:id/entitlements?year=YYYY — returns an array of entitlement rows, each with a string leaveType and a NUMERIC usedDays. There may be no 'annual' row until the first approval creates/updates it (treat a missing 'annual' row as usedDays = 0).
- ENTITLEMENT RECALC: approving a request recalculates the employee's usedDays for the (leaveType, year) bucket from the actual approved-day overlap with that calendar year; for a single-year request usedDays increases by exactly the request's workingDays. Declining a request consumes NO entitlement (only 'approved' leave counts), so usedDays is unchanged by a decline.

DB: table app_users(id, clerk_user_id, email, role, employee_id, tenant_id). Tenant is fixed: tenant_id='a0000000-0000-4000-8000-000000000001'. employees(id, employee_number UNIQUE, ...). leave_requests(id, employee_id, leave_type, start_date, end_date, working_days, status). leave_entitlements(employee_id, year, leave_type, used_days, ...).

TEST SETUP: After Clerk sign-in, navigate to "/" so the app calls GET /api/me and bootstraps the app_users row. Then a [DB] UPDATE on app_users (match by lower(email)) forces role='admin'. Reload so the frontend re-fetches /api/me and applies the role. All API status / JSON checks are made with a same-origin fetch() run in the page context (the Clerk session cookie rides along automatically).
`.trim();

function adminLeaveDecisionPlan(email: string, run: string): string {
  const t = LEAVE_SCOPE_TENANT_ID;
  return `
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Hilda", lastName: "Hradmin", email: "${email}"}.
3. [Browser] Navigate to "/" (path: /). Wait for the app to settle (it calls GET /api/me and creates the app_users row).
4. [DB] Insert a dedicated EMPLOYEE (per-run token, no other leave) and capture the returned id as \${empId}:
   INSERT INTO employees (tenant_id, employee_number, first_name, last_name, email, job_title, department, status, employment_type, start_date, salary) VALUES ('${t}', 'ALD-${run}', 'Della', 'Decide', 'della-${run}@amigatest.com', 'Underwriter', 'Underwriting', 'active', 'full_time', '2022-01-01', '60000') RETURNING id;
5. [DB] Force the signed-in user to be an ADMIN: UPDATE app_users SET role='admin', employee_id=1 WHERE lower(email)=lower('${email}');
6. [Browser] Navigate to "/" again (path: /) to force a fresh /api/me fetch.
7. [Verify] Assert the user is redirected to the admin home (URL path becomes /dashboard) and the Dashboard renders.

--- APPROVE: usedDays increases by the request's working days ---
8. [Browser] In the page context, create a PENDING annual request for the seeded employee and report BOTH the numeric HTTP status, the returned id, and the returned workingDays (SINGLE expression):
   await fetch('/api/leave/employees/' + \${empId} + '/requests', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ leaveType: 'annual', startDate: '2032-03-01', endDate: '2032-03-05', reason: 'approve-path' }) }).then(async r => { const b = await r.json(); return { status: r.status, id: b.id, workingDays: b.workingDays }; })
9. [Verify] Assert the reported status is 201 (admin may create a request for any employee). Remember the returned id as REQ1_ID and the returned workingDays as REQ1_DAYS (a positive number).
10. [Browser] In the page context, read the seeded employee's 2032 annual usedDays BEFORE approval and report it as a number (SINGLE expression; a missing 'annual' row means 0):
    await fetch('/api/leave/employees/' + \${empId} + '/entitlements?year=2032', { headers: { accept: 'application/json' } }).then(async r => { const rows = await r.json(); const a = Array.isArray(rows) ? rows.find(x => x.leaveType === 'annual') : null; return a ? a.usedDays : 0; })
11. [Verify] Remember the reported number as USED_BEFORE (expected 0 — the seeded employee has no other approved leave).
12. [Browser] In the page context, APPROVE the pending request and report the numeric HTTP status (SINGLE expression):
    await fetch('/api/leave-requests/' + REQ1_ID, { method: 'PATCH', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ status: 'approved' }) }).then(r => r.status)
13. [Verify] Assert the reported status is 200 (HR admin approves leave with NO server error — this is the path that used to 500 with Postgres 42P10).
14. [Browser] In the page context, read the seeded employee's 2032 annual usedDays AFTER approval and report it as a number (SINGLE expression):
    await fetch('/api/leave/employees/' + \${empId} + '/entitlements?year=2032', { headers: { accept: 'application/json' } }).then(async r => { const rows = await r.json(); const a = Array.isArray(rows) ? rows.find(x => x.leaveType === 'annual') : null; return a ? a.usedDays : 0; })
15. [Verify] Remember the reported number as USED_AFTER. Assert USED_AFTER === USED_BEFORE + REQ1_DAYS (approving the request increased the employee's annual usedDays by exactly the request's working days — entitlement recalculation works end-to-end).

--- DECLINE: a separate request returns 200 with NO usage change ---
16. [Browser] In the page context, create a SECOND pending annual request (different dates, same year) and report the status and id (SINGLE expression):
    await fetch('/api/leave/employees/' + \${empId} + '/requests', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ leaveType: 'annual', startDate: '2032-03-15', endDate: '2032-03-19', reason: 'decline-path' }) }).then(async r => { const b = await r.json(); return { status: r.status, id: b.id }; })
17. [Verify] Assert the status is 201. Remember the returned id as REQ2_ID.
18. [Browser] In the page context, DECLINE the second request and report the numeric HTTP status (SINGLE expression):
    await fetch('/api/leave-requests/' + REQ2_ID, { method: 'PATCH', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ status: 'declined' }) }).then(r => r.status)
19. [Verify] Assert the reported status is 200 (HR admin declines leave with NO server error).
20. [Browser] In the page context, read the seeded employee's 2032 annual usedDays AFTER the decline and report it as a number (SINGLE expression):
    await fetch('/api/leave/employees/' + \${empId} + '/entitlements?year=2032', { headers: { accept: 'application/json' } }).then(async r => { const rows = await r.json(); const a = Array.isArray(rows) ? rows.find(x => x.leaveType === 'annual') : null; return a ? a.usedDays : 0; })
21. [Verify] Assert the reported number equals USED_AFTER (declining a request consumes NO entitlement — usedDays is unchanged from the post-approval value).

--- Cleanup ---
22. [DB] CLEAN UP every row this scenario seeded (run in order):
    DELETE FROM leave_requests WHERE employee_id IN (SELECT id FROM employees WHERE employee_number = 'ALD-${run}');
    DELETE FROM leave_entitlements WHERE employee_id IN (SELECT id FROM employees WHERE employee_number = 'ALD-${run}');
    DELETE FROM app_users WHERE lower(email)=lower('${email}');
    DELETE FROM employees WHERE employee_number = 'ALD-${run}';
`.trim();
}

/**
 * Build a fresh employee-manager-only-blocked scenario with a unique login
 * email and a per-run token for all seeded rows.
 */
export function buildEmployeeManagerOnlyBlockedPlan(): EmployeeManagerOnlyBlockedScenario {
  const run = Math.random().toString(36).slice(2, 8);
  const email = `empblock-${run}@amigatest.com`;
  return { email, run, plan: employeeManagerOnlyBlockedPlan(email, run) };
}

/**
 * Build a fresh admin leave-decision scenario with a unique login email and a
 * per-run token for the seeded employee. Pair the returned `plan` with
 * {@link ADMIN_LEAVE_DECISION_TECH_DOC} and run via
 * `runTest({ testPlan, relevantTechnicalDocumentation, testClerkAuth: true })`.
 */
export function buildAdminLeaveDecisionPlan(): {
  email: string;
  run: string;
  plan: string;
} {
  const run = Math.random().toString(36).slice(2, 8);
  const email = `adminleave-${run}@amigatest.com`;
  return { email, run, plan: adminLeaveDecisionPlan(email, run) };
}

/**
 * Technical context for the SIGNED-OUT visitor scenario. Guards the most basic
 * gate of all: a visitor with NO Clerk session must see the public landing and
 * application pages without protected navigation, must be rejected (401) from
 * every protected /api route, while the public no-auth routes stay reachable.
 * It also proves that a shared `/apply?job=<id>` link keeps the applicant on
 * the exact isolated open role seeded for this run.
 */
export const SIGNED_OUT_TECH_DOC = `
APP: "Amiga Specialty HR" (web, served at base path "/"). API server routed at "/api" via the shared proxy (same origin). Auth is cookie-based Clerk: a signed-in page's same-origin fetch carries the session cookie automatically. A SIGNED-OUT visitor has NO session cookie, so their fetches reach the API unauthenticated.

AUTH GATE UNDER TEST (server-side, in artifacts/api-server/src/middlewares):
- Every /api route except an explicit public allowlist requires a resolved app user. With no Clerk session there is no app user, so the request is rejected with HTTP 401 ("unauthorized"). This is the UNAUTHENTICATED path (401), distinct from the signed-in-but-forbidden path (403).
- Protected routes that must return 401 when signed out include: GET /api/me, GET /api/employees, GET /api/sickness, GET /api/candidates.
- PUBLIC routes stay reachable with NO auth: GET /api/public/jobs returns 200 (open roles for the public apply form). Public prefixes are "/public/" and "/storage/public-objects/" plus "/healthz".

TEST SETUP: Create a FRESH browser context and DO NOT sign in (no [Clerk Auth] step). The scenario seeds exactly one uniquely named, open job and captures its numeric id as PUBLIC_JOB_ID. The signed-out visitor lands on the branded landing page at "/" and then opens \`/apply?job=PUBLIC_JOB_ID\` directly. All checks are made with browser navigation and same-origin fetch() calls run in the page context; because there is no session cookie, the protected calls are unauthenticated. The scenario does not seed employees, app users, or role fixtures, and deletes its job during cleanup.
`.trim();

function signedOutVisitorPlan(run: string): string {
  const t = LEAVE_SCOPE_TENANT_ID;
  return `
1. [New Context] Create a new browser context. DO NOT sign in (there is deliberately NO [Clerk Auth] step — this scenario proves a fully signed-out visitor is turned away).
2. [DB] Insert one isolated LIVE public job and capture its returned numeric id as \${publicJobId}: INSERT INTO jobs (tenant_id, title, department, description, status) VALUES ('${t}', 'Shared Link Role ${run}', 'Engineering', 'A role created only for the shared-link browser check.', 'open') RETURNING id;
3. [Browser] Navigate to "/" (path: /). A signed-out visitor should see the branded landing page (a "Sign in" call to action), NOT the dashboard.
4. [Verify] Assert the signed-out landing page renders with the "Sign in" control and "Looking for a role? View open positions" link. Assert the URL path is "/" and the page has no protected navigation links or labels, including "Dashboard", "Employees", "My leave", "Recruitment", or "Settings".
5. [Browser] Navigate directly to "/apply?job=\${publicJobId}" (the shared job-specific application link).
6. [Verify] Assert the URL path is "/apply" and the query string contains "job=\${publicJobId}". Assert the public application page renders with the heading "Apply to join Amiga", the first-name field is visible, and the page did NOT redirect to "/sign-in". Assert there are no protected navigation links or labels, including "Dashboard", "Employees", "My leave", "Recruitment", or "Settings".
7. [Browser] Fill the first-name field with "Shared", the last-name field with "Link", and the email field with "shared-link-${run}@example.com", then click "Continue" to open the "Role & experience" step.
8. [Verify] Assert the role selector (data-testid="application-job-select") displays "Shared Link Role ${run}" rather than "General application". Assert the selected-job panel (data-testid="application-selected-job") and its title (data-testid="application-selected-job-title") display exactly "Shared Link Role ${run}", proving the link preselected the seeded job. The seeded job id must be \${publicJobId}; do not accept a different open role.
9. [Browser] In the page context run this SINGLE-EXPRESSION fetch (so it runs in the page, with NO session cookie) and report the raw JSON result (a map of endpoint -> numeric HTTP status):
   await Promise.all([fetch('/api/me', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/employees', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/sickness', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/candidates', { headers: { accept: 'application/json' } }).then(r => r.status), fetch('/api/public/jobs', { headers: { accept: 'application/json' } }).then(r => r.status)]).then(([me, employees, sickness, candidates, publicJobs]) => ({ me, employees, sickness, candidates, publicJobs }))
10. [Verify] On that status map:
   - Assert me === 401, employees === 401, sickness === 401, candidates === 401 — a signed-out visitor is rejected (unauthorized) from every protected route.
   - Assert publicJobs === 200 — the public, no-auth jobs route stays reachable without signing in.
11. [Browser] In the page context run this SINGLE-EXPRESSION fetch and report whether the public jobs response contains the seeded job:
    await fetch('/api/public/jobs', { headers: { accept: 'application/json' } }).then(r => r.json()).then(rows => ({ seededJobPresent: Array.isArray(rows) && rows.some(job => job.id === \${publicJobId} && job.title === 'Shared Link Role ${run}') }))
12. [Verify] Assert seededJobPresent === true — the unauthenticated public jobs response includes the exact isolated job opened by the shared link.
13. [Browser] In the same signed-out browser context, intercept GET "/api/public/jobs" and fulfill it with HTTP 200 and body "[]", then navigate to "/apply" and move to the "Role & experience" step.
14. [Verify] Assert the role selector remains available with "General application" and the page shows data-testid="application-jobs-empty" with a message that applicants can still submit a general application. This proves an empty open-role response is distinct from loading and failure.
15. [Browser] Replace the interception response with HTTP 503 and body {"error":"Open roles are temporarily unavailable. Please try again.","retryable":true}, then reload "/apply?job=\${publicJobId}" and move to the "Role & experience" step.
16. [Verify] Assert data-testid="application-jobs-error" is visible with "We couldn't load the open roles", an explanation to try again or continue with a general application, and data-testid="application-jobs-retry" is enabled. Assert the role selector shows "General application" rather than the unverified shared-link role.
17. [Browser] Remove the jobs interception so the real request is allowed, click data-testid="application-jobs-retry", and wait for the request to complete.
18. [Verify] Assert the error state clears and the seeded "Shared Link Role ${run}" is available again. The entire recovery check must remain signed out; do not add a Clerk sign-in step.
19. [DB] CLEAN UP the recruitment data created by this scenario: DELETE FROM jobs WHERE id = \${publicJobId} AND title = 'Shared Link Role ${run}';
`.trim();
}

/**
 * Technical context for the signed-out APPLICATION submission scenario.
 * Unlike the visitor smoke check above, this journey proves that the public
 * form can complete the write, while the browser remains unauthenticated.
 */
export const SIGNED_OUT_APPLICATION_TECH_DOC = `
APP: "Amiga Specialty HR" (web, served at base path "/"). API server routed at "/api" via the shared proxy (same origin). The public application form is intentionally unauthenticated and submits to POST /api/public/amiga/applications.

AUTH GATE UNDER TEST:
- The application page and POST /api/public/amiga/applications are public routes and must work with no Clerk session.
- GET /api/me is protected and must still return 401 after submission; a successful public application must not create a Clerk session. The application does not depend on a job being available because the role is optional.

APPLICATION CONTRACT:
- The minimum form fields are first name, last name, and email. The role is optional, so the scenario submits a general application and does not need to seed a job.
- A successful POST creates a candidates row with source='online_application' and current_stage='new', plus one candidate_stage_history row with changed_by='Public'. A retry of the exact same application returns the existing candidate instead of creating another row or stage-history entry. The scenario uses a unique email, verifies those rows, and removes them during cleanup.

TEST SETUP: Create a FRESH browser context and DO NOT sign in. There is deliberately NO [Clerk Auth] step. The unique applicant email is only test data; it is not a Clerk identity.
`.trim();

function signedOutApplicationPlan(email: string): string {
  return `
1. [New Context] Create a new browser context. DO NOT sign in (there is deliberately NO [Clerk Auth] step — the applicant must remain fully signed out).
2. [Browser] Navigate to "/" (path: /), then click the "Looking for a role? View open positions" link.
3. [Verify] Assert the URL path is "/apply", the "Apply to join Amiga" heading renders, and the page did NOT redirect to "/sign-in".
4. [Browser] Fill the minimum public application fields: First name "Ava", Last name "Applicant", and Email "${email}".
5. [Browser] Click "Continue" to move to "Role & experience", leave the role as "General application", then click "Continue" again to move to "Documents".
6. [Verify] Assert the "Documents" step and "Submit application" button are visible, with no sign-in prompt or protected staff navigation.
7. [Browser] Click "Submit application" and wait for the submission to finish. The submit control must be disabled while the request is in flight and must not allow a second click.
8. [Verify] Assert the success state renders with the heading "Thank you" and the message "Your application has been received." Assert the URL remains "/apply".
9. [Browser] In the page context retry the exact same application payload with this SINGLE-EXPRESSION fetch (so it runs in the same signed-out page context), and report the raw JSON result:
   await fetch('/api/public/amiga/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: 'Ava', lastName: 'Applicant', email: '${email}', phone: null, jobId: null, linkedinUrl: null, currentCompany: null, currentRole: null, yearsExperience: null, expectedSalary: null, rightToWorkStatus: 'uk_citizen', coverLetter: null }) }).then(async r => ({ status: r.status, body: await r.json() }))
10. [Verify] Assert the retry status is 200 and its response message says "already been received." The retry must not create a new signed-out session.
11. [Browser] In the page context run this SINGLE-EXPRESSION fetch (so it runs in the same signed-out page context) and report the numeric HTTP status:
   await fetch('/api/me', { headers: { accept: 'application/json' } }).then(r => r.status)
12. [Verify] Assert the status is 401. The successful application and retry must not create a Clerk session.
13. [DB] Verify the submitted application and its initial stage history for this unique email:
    SELECT json_build_object('candidateCount', COUNT(*)::int, 'validCount', COUNT(*) FILTER (WHERE c.source='online_application' AND c.current_stage='new')::int, 'historyCount', (SELECT COUNT(*)::int FROM candidate_stage_history h JOIN candidates hc ON hc.id=h.candidate_id WHERE lower(hc.email)=lower('${email}') AND hc.tenant_id='${PUBLIC_APPLICATION_TEST_TENANT_ID}' AND h.changed_by='Public' AND h.to_stage='new')) AS result FROM candidates c WHERE lower(c.email)=lower('${email}') AND c.tenant_id='${PUBLIC_APPLICATION_TEST_TENANT_ID}';
14. [Verify] Assert the database result has candidateCount === 1, validCount === 1, and historyCount === 1.
15. [DB] CLEAN UP the rows created by this scenario (run in order):
    DELETE FROM candidate_stage_history WHERE candidate_id IN (SELECT id FROM candidates WHERE lower(email)=lower('${email}'));
    DELETE FROM candidates WHERE lower(email)=lower('${email}');
`.trim();
}

/**
 * Build the SIGNED-OUT visitor scenario. This scenario seeds one isolated open
 * job, signs in nobody, and cleans that job up. Pair the returned `plan` with
 * {@link SIGNED_OUT_TECH_DOC} and run via
 * `runTest({ testPlan, relevantTechnicalDocumentation, testClerkAuth: true })`
 * (testClerkAuth enables the harness; the plan itself has no sign-in step).
 */
export function buildSignedOutVisitorPlan(): { run: string; plan: string } {
  const run = Math.random().toString(36).slice(2, 8);
  return { run, plan: signedOutVisitorPlan(run) };
}

/**
 * Build the signed-out public application scenario. It creates no Clerk user
 * and seeds no job; only the submitted candidate and stage history are
 * verified and cleaned up.
 */
export function buildSignedOutApplicationPlan(): { email: string; plan: string } {
  const email = randomEmail("public-applicant");
  return { email, plan: signedOutApplicationPlan(email) };
}

/**
 * Build a fresh set of role-matrix scenarios with unique emails. Returned in
 * recommended run order (admin first — see file header).
 */
export function buildRoleMatrixPlans(): RoleMatrixScenario[] {
  const admin = randomEmail("admin");
  const manager = randomEmail("mgr");
  const employee = randomEmail("emp");
  const unlinked = randomEmail("nolink");
  return [
    { role: "admin", email: admin, plan: adminPlan(admin) },
    { role: "manager", email: manager, plan: managerPlan(manager) },
    { role: "employee", email: employee, plan: employeePlan(employee) },
    { role: "unlinked", email: unlinked, plan: unlinkedPlan(unlinked) },
  ];
}

/**
 * Build the mobile role-menu replay. It uses separate mobile browser
 * contexts so the manager and employee sessions can be checked independently.
 */
export function buildMobileRoleMenuPlan(): MobileRoleMenuScenario {
  const managerEmail = randomEmail("mobile-mgr");
  const employeeEmail = randomEmail("mobile-emp");
  return {
    managerEmail,
    employeeEmail,
    plan: mobileRoleMenuPlan(managerEmail, employeeEmail),
  };
}
