/**
 * Deterministic, browserless runner for the Amiga Specialty HR RBAC suite.
 *
 * WHY THIS EXISTS
 * ---------------
 * `rbac-role-matrix.ts` describes every access-control scenario as a
 * natural-language `runTest` plan. Those plans are interpreted by Replit's
 * Playwright/LLM testing harness, which is only reachable from the agent's
 * code-execution sandbox — a shell "validation step" (the kind the validation
 * skill registers) cannot call `runTest`. This script reproduces the SAME
 * server-side access-control assertions deterministically so they can run as a
 * named CI-style validation on every change:
 *
 *   - mints real short-lived Clerk session JWTs (via the Clerk Backend API)
 *     for throwaway synthetic users,
 *   - performs the `[DB]` setup/teardown the plans describe directly via `pg`,
 *   - drives the protected `/api` routes with a `Bearer` token (the server
 *     authenticates the JWT exactly as it would a cookie session), and
 *   - asserts the 200 / 403 / 401 matrix + data-scoping each scenario encodes.
 *
 * SCOPE / DELIBERATE DEVIATION
 * ----------------------------
 * This covers the SERVER-SIDE enforcement (the real safety net). It does NOT
 * drive a browser, so the frontend route-gating / home-redirect assertions in
 * the role-matrix plans (which replit.md documents as UX-only) are not checked
 * here. The role-matrix plans and this runner assert the live authorization
 * rules (the server is the source of truth): a manager's
 * `GET /api/employees` is an allowed, direct-reports-scoped list (200), while
 * admin-only routes remain blocked.
 *
 * REQUIREMENTS
 * ------------
 *   - CLERK_SECRET_KEY   (mint test users + session tokens)
 *   - DATABASE_URL       (seed/teardown rows; force roles)
 *   - The API server must be running and reachable at RBAC_API_BASE
 *     (default http://localhost:80 via the shared proxy).
 *
 * EXIT CODE: 0 only if EVERY scenario passes; 1 if any scenario fails (or the
 * environment is not configured). Each scenario reports status "success" /
 * "failure", mirroring the runTest result the plans expect.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const SK = process.env.CLERK_SECRET_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const BASE = process.env.RBAC_API_BASE || "http://localhost:80";
const TENANT = "a0000000-0000-4000-8000-000000000001";
const CLERK_API = "https://api.clerk.com/v1";
const API_SERVER_ENTRY = fileURLToPath(
  new URL("../../api-server/dist/index.mjs", import.meta.url),
);

function preflight() {
  const missing = [];
  if (!SK) missing.push("CLERK_SECRET_KEY");
  if (!DATABASE_URL) missing.push("DATABASE_URL");
  if (missing.length) {
    console.error(
      `[rbac] Cannot run: missing required env var(s): ${missing.join(", ")}`,
    );
    process.exit(1);
  }
}

const pool = new Pool({ connectionString: DATABASE_URL });
const createdClerkUserIds = new Set();

// ---------------------------------------------------------------------------
// Clerk Backend API helpers
// ---------------------------------------------------------------------------
async function clerk(path, opts = {}) {
  const r = await fetch(CLERK_API + path, {
    ...opts,
    headers: {
      authorization: `Bearer ${SK}`,
      "content-type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!r.ok) {
    throw new Error(
      `Clerk ${opts.method || "GET"} ${path} -> ${r.status}: ${text.slice(0, 300)}`,
    );
  }
  return json;
}

function rand() {
  return Math.random().toString(36).slice(2, 8);
}

function email(prefix) {
  // `+clerk_test` keeps these in Clerk's dev test space; @amigatest.com never
  // matches a real employees.email so the bootstrap link stays null until we
  // force it.
  return `${prefix}-${rand()}+clerk_test@amigatest.com`;
}

async function makeUser(prefix) {
  const addr = email(prefix);
  const user = await clerk("/users", {
    method: "POST",
    body: JSON.stringify({
      email_address: [addr],
      password: `Rbac!${rand()}${rand()}Z9`,
    }),
  });
  createdClerkUserIds.add(user.id);
  const session = await clerk("/sessions", {
    method: "POST",
    body: JSON.stringify({ user_id: user.id }),
  });
  return {
    email: addr,
    userId: user.id,
    sessionId: session.id,
    // Session JWTs expire in ~60s — always mint a fresh one per request.
    async token() {
      const t = await clerk(`/sessions/${this.sessionId}/tokens`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      return t.jwt;
    },
  };
}

async function destroyUser(user) {
  await pool
    .query("DELETE FROM app_users WHERE clerk_user_id=$1", [user.userId])
    .catch(() => {});
  try {
    await clerk(`/users/${user.userId}`, { method: "DELETE" });
    createdClerkUserIds.delete(user.userId);
  } catch {
    /* leave for global sweep */
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function api(method, path, { token, body, headers: extraHeaders } = {}) {
  return apiAt(BASE, method, path, {
    token,
    body,
    headers: extraHeaders,
  });
}

async function apiAt(base, method, path, { token, body, headers: extraHeaders } = {}) {
  const headers = { accept: "application/json", ...(extraHeaders || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  return { status: r.status, json };
}

async function startStorageFailureServer() {
  const port = 18081;
  const child = spawn(process.execPath, [API_SERVER_ENTRY], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      PRIVATE_OBJECT_DIR: "",
    },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/healthz`);
      if (response.ok) {
        return {
          base,
          async stop() {
            if (child.exitCode !== null || child.signalCode !== null) return;
            await new Promise((resolve) => {
              const timeout = setTimeout(() => {
                child.kill("SIGKILL");
                resolve();
              }, 1_000);
              child.once("exit", () => {
                clearTimeout(timeout);
                resolve();
              });
              child.kill("SIGTERM");
            });
          },
        };
      }
    } catch {
      // The child may still be loading its bundled dependencies.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGKILL");
  throw new Error("storage failure API server did not start");
}

async function uploadObject(
  uploadURL,
  label,
  contentType = "application/pdf",
  content = label,
) {
  expect(
    typeof uploadURL === "string" && uploadURL.length > 0,
    `${label}: upload URL was missing`,
  );
  const response = await fetch(uploadURL, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: Buffer.from(content),
  });
  expect(response.ok, `${label}: object upload failed with ${response.status}`);
}

async function authed(user, method, path, opts = {}) {
  const token = await user.token();
  return api(method, path, { ...opts, token });
}

async function bootstrap(user) {
  // First authenticated /api/me inserts the app_users row (role employee,
  // unlinked — an admin already exists in this tenant).
  const r = await authed(user, "GET", "/api/me");
  expect(
    r.status === 200,
    `bootstrap GET /api/me expected 200, got ${r.status}`,
  );
}

async function forceRole(user, role, employeeId) {
  await pool.query(
    "UPDATE app_users SET role=$1, employee_id=$2 WHERE clerk_user_id=$3",
    [role, employeeId, user.userId],
  );
}

// ---------------------------------------------------------------------------
// DB seed helpers (mirror the [DB] steps in rbac-role-matrix.ts)
// ---------------------------------------------------------------------------
async function seedEmployee({
  number,
  first,
  last,
  mail,
  jobTitle = "Engineer",
  department = "Engineering",
  managerId = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO employees (tenant_id, employee_number, first_name, last_name, email, job_title, department, status, employment_type, start_date, salary, manager_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active','full_time','2020-01-01','60000',$8) RETURNING id`,
    [TENANT, number, first, last, mail, jobTitle, department, managerId],
  );
  return rows[0].id;
}

async function seedLeaveRequest(employeeId, status = "pending") {
  const { rows } = await pool.query(
    `INSERT INTO leave_requests (tenant_id, employee_id, leave_type, start_date, end_date, working_days, status)
     VALUES ($1,$2,'annual','2026-07-01','2026-07-03','3',$3) RETURNING id`,
    [TENANT, employeeId, status],
  );
  return rows[0].id;
}

async function seedSickness(employeeId) {
  const { rows } = await pool.query(
    `INSERT INTO sickness_absences (tenant_id, employee_id, start_date, end_date, days_lost, self_certified)
     VALUES ($1,$2,'2026-05-01','2026-05-02','2',true) RETURNING id`,
    [TENANT, employeeId],
  );
  return rows[0].id;
}

async function seedJob(title, hiringManagerId = null) {
  const { rows } = await pool.query(
    `INSERT INTO jobs (tenant_id, title, department, hiring_manager_id)
     VALUES ($1,$2,'Engineering',$3) RETURNING id`,
    [TENANT, title, hiringManagerId],
  );
  return rows[0].id;
}

async function seedPublicTenant({ slug, name, status = "active" }) {
  const { rows } = await pool.query(
    `INSERT INTO tenants (slug, name, status)
     VALUES ($1,$2,$3) RETURNING id, slug`,
    [slug, name, status],
  );
  return rows[0];
}

async function seedPublicJob(tenantId, title, status = "open") {
  const { rows } = await pool.query(
    `INSERT INTO jobs (tenant_id, title, department, status)
     VALUES ($1,$2,'Engineering',$3) RETURNING id`,
    [tenantId, title, status],
  );
  return rows[0].id;
}

async function seedCandidate(jobId, mail) {
  const { rows } = await pool.query(
    `INSERT INTO candidates (tenant_id, first_name, last_name, email, job_id, current_stage)
     VALUES ($1,'Test','Candidate',$2,$3,'new') RETURNING id`,
    [TENANT, mail, jobId],
  );
  return rows[0].id;
}

async function seedCandidateForTenant(tenantId, mail, jobId = null) {
  const { rows } = await pool.query(
    `INSERT INTO candidates (tenant_id, first_name, last_name, email, job_id, current_stage)
     VALUES ($1,'Test','Candidate',$2,$3,'new') RETURNING id`,
    [tenantId, mail, jobId],
  );
  return rows[0].id;
}

async function seedCandidateDocument(tenantId, candidateId, objectPath) {
  const { rows } = await pool.query(
    `INSERT INTO candidate_documents
       (tenant_id, candidate_id, name, category, object_path, file_size, mime_type)
     VALUES ($1,$2,'Sentinel CV','cv',$3,1234,'application/pdf')
     RETURNING id`,
    [tenantId, candidateId, objectPath],
  );
  return rows[0].id;
}

async function seedCandidateHistory(tenantId, candidateId, note) {
  const { rows } = await pool.query(
    `INSERT INTO candidate_stage_history
       (tenant_id, candidate_id, from_stage, to_stage, note, changed_by)
     VALUES ($1, $2, NULL, 'new', $3, 'Test')
     RETURNING id`,
    [tenantId, candidateId, note],
  );
  return rows[0].id;
}

async function seedOfferForTenant(tenantId, candidateId) {
  const { rows } = await pool.query(
    `INSERT INTO offers
       (tenant_id, candidate_id, salary, currency, start_date, employment_type, contract_type, status, sent_at)
     VALUES ($1,$2,'60000','GBP','2030-01-01','full_time','permanent','sent',NOW())
     RETURNING id`,
    [tenantId, candidateId],
  );
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

function expectStatus(actual, want, label) {
  expect(actual === want, `${label}: expected ${want}, got ${actual}`);
}

// ---------------------------------------------------------------------------
// Scenarios — each returns nothing and throws on the first failed assertion.
// ---------------------------------------------------------------------------
async function scenarioRoleMatrixAdmin() {
  const u = await makeUser("admin");
  try {
    await bootstrap(u);
    await forceRole(u, "admin", null);
    expectStatus(
      (await authed(u, "GET", "/api/employees")).status,
      200,
      "admin GET /api/employees",
    );
    const me = await authed(u, "GET", "/api/me");
    expectStatus(me.status, 200, "admin GET /api/me");
    expect(me.json?.role === "admin", `admin /api/me role expected admin, got ${me.json?.role}`);
  } finally {
    await destroyUser(u);
  }
}

async function scenarioRoleMatrixManager() {
  const u = await makeUser("mgr");
  try {
    await bootstrap(u);
    await forceRole(u, "manager", 2);
    // Allowed: the live allowlist grants managers a direct-reports-scoped
    // employees list.
    expectStatus(
      (await authed(u, "GET", "/api/employees")).status,
      200,
      "manager GET /api/employees (scoped list)",
    );
    expectStatus((await authed(u, "GET", "/api/me")).status, 200, "manager GET /api/me");
    expectStatus((await authed(u, "GET", "/api/leave")).status, 200, "manager GET /api/leave");
    // Blocked: an admin-only endpoint not on the non-admin allowlist.
    expectStatus(
      (await authed(u, "GET", "/api/dashboard/stats")).status,
      403,
      "manager GET /api/dashboard/stats (admin-only)",
    );
  } finally {
    await destroyUser(u);
  }
}

async function scenarioRoleMatrixEmployee() {
  const u = await makeUser("emp");
  try {
    await bootstrap(u);
    await forceRole(u, "employee", 3);
    expectStatus((await authed(u, "GET", "/api/me")).status, 200, "employee GET /api/me");
    expectStatus((await authed(u, "GET", "/api/leave")).status, 200, "employee GET /api/leave");
    expectStatus(
      (await authed(u, "GET", "/api/employees")).status,
      403,
      "employee GET /api/employees (admin-only)",
    );
    expectStatus(
      (await authed(u, "GET", "/api/sickness")).status,
      403,
      "employee GET /api/sickness (manager-only)",
    );
  } finally {
    await destroyUser(u);
  }
}

async function scenarioRoleMatrixUnlinked() {
  const u = await makeUser("nolink");
  try {
    await bootstrap(u);
    await forceRole(u, "employee", null);
    expectStatus(
      (await authed(u, "GET", "/api/me")).status,
      200,
      "unlinked GET /api/me (renders no-access)",
    );
    expectStatus(
      (await authed(u, "GET", "/api/employees")).status,
      403,
      "unlinked GET /api/employees",
    );
    expectStatus(
      (await authed(u, "GET", "/api/leave")).status,
      403,
      "unlinked GET /api/leave",
    );
  } finally {
    await destroyUser(u);
  }
}

async function scenarioSignedOut() {
  expectStatus((await api("GET", "/api/me")).status, 401, "signed-out GET /api/me");
  expectStatus(
    (await api("GET", "/api/employees")).status,
    401,
    "signed-out GET /api/employees",
  );
  expectStatus(
    (await api("GET", "/api/sickness")).status,
    401,
    "signed-out GET /api/sickness",
  );
  expectStatus(
    (await api("GET", "/api/candidates")).status,
    401,
    "signed-out GET /api/candidates",
  );
  expectStatus(
    (await api("GET", "/api/public/jobs")).status,
    200,
    "signed-out GET /api/public/jobs (public)",
  );
}

async function scenarioPublicJobsTenantScope() {
  const run = rand();
  const tenantBSlug = `public-b-${run}`;
  const inactiveSlug = `public-inactive-${run}`;
  let tenantB, inactiveTenant, tenantAJob, tenantBJob, inactiveJob;
  try {
    tenantB = await seedPublicTenant({
      slug: tenantBSlug,
      name: `Public Tenant B ${run}`,
    });
    inactiveTenant = await seedPublicTenant({
      slug: inactiveSlug,
      name: `Inactive Public Tenant ${run}`,
      status: "inactive",
    });
    tenantAJob = await seedJob(`Public Tenant A Role ${run}`);
    tenantBJob = await seedPublicJob(tenantB.id, `Public Tenant B Role ${run}`);
    inactiveJob = await seedPublicJob(
      inactiveTenant.id,
      `Inactive Public Tenant Role ${run}`,
    );

    const tenantAResponse = await api("GET", "/api/public/amiga/jobs");
    expectStatus(
      tenantAResponse.status,
      200,
      "public-jobs-tenant-scope GET tenant A jobs",
    );
    const tenantAJobs = Array.isArray(tenantAResponse.json)
      ? tenantAResponse.json
      : [];
    expect(
      tenantAJobs.some((job) => job.id === tenantAJob),
      "public-jobs-tenant-scope: tenant A response must contain its seeded role",
    );
    expect(
      !tenantAJobs.some((job) => job.id === tenantBJob),
      "public-jobs-tenant-scope: tenant A response must not contain tenant B's role",
    );
    const tenantARoleIds = tenantAJobs.map((job) => job.id);
    const tenantARoles = tenantARoleIds.length
      ? (
          await pool.query(
            "SELECT id, tenant_id FROM jobs WHERE id = ANY($1)",
            [tenantARoleIds],
          )
        ).rows
      : [];
    expect(
      tenantARoles.every((job) => job.tenant_id === TENANT),
      "public-jobs-tenant-scope: tenant A response contained a role owned by another tenant",
    );

    const tenantBResponse = await api(
      "GET",
      `/api/public/${tenantB.slug}/jobs`,
    );
    expectStatus(
      tenantBResponse.status,
      200,
      "public-jobs-tenant-scope GET tenant B jobs",
    );
    const tenantBJobs = Array.isArray(tenantBResponse.json)
      ? tenantBResponse.json
      : [];
    expect(
      tenantBJobs.some((job) => job.id === tenantBJob),
      "public-jobs-tenant-scope: tenant B response must contain its seeded role",
    );
    expect(
      !tenantBJobs.some((job) => job.id === tenantAJob),
      "public-jobs-tenant-scope: tenant B response must not contain tenant A's role",
    );
    const tenantBRoleIds = tenantBJobs.map((job) => job.id);
    const tenantBRoles = tenantBRoleIds.length
      ? (
          await pool.query(
            "SELECT id, tenant_id FROM jobs WHERE id = ANY($1)",
            [tenantBRoleIds],
          )
        ).rows
      : [];
    expect(
      tenantBRoles.every((job) => job.tenant_id === tenantB.id),
      "public-jobs-tenant-scope: tenant B response contained a role owned by another tenant",
    );

    const tenantBJobIds = tenantBJobs.map((job) => job.id).sort((a, b) => a - b);
    const mixedCaseTenantBSlug = tenantB.slug
      .split("")
      .map((character, index) =>
        index % 2 === 0 ? character.toLowerCase() : character.toUpperCase(),
      )
      .join("");
    for (const [alias, label] of [
      [tenantB.slug.toUpperCase(), "uppercase"],
      [mixedCaseTenantBSlug, "mixed-case"],
    ]) {
      const response = await api("GET", `/api/public/${alias}/jobs`);
      expectStatus(
        response.status,
        200,
        `public-jobs-tenant-scope GET tenant B ${label} slug`,
      );
      const aliasJobIds = Array.isArray(response.json)
        ? response.json.map((job) => job.id).sort((a, b) => a - b)
        : [];
      expect(
        JSON.stringify(aliasJobIds) === JSON.stringify(tenantBJobIds),
        `public-jobs-tenant-scope: ${label} slug did not resolve the same tenant-owned roles`,
      );
    }

    const missingSlug = `missing-${run}`;
    const missingSlugMixedCase = missingSlug
      .split("")
      .map((character, index) =>
        index % 2 === 0 ? character.toLowerCase() : character.toUpperCase(),
      )
      .join("");
    const inactiveSlugUpperCase = inactiveTenant.slug.toUpperCase();
    for (const [slug, label] of [
      [missingSlugMixedCase, "mixed-case missing"],
      [inactiveSlugUpperCase, "uppercase inactive"],
    ]) {
      const response = await api("GET", `/api/public/${slug}/jobs`);
      expectStatus(
        response.status,
        404,
        `public-jobs-tenant-scope GET ${label} tenant`,
      );
      expect(
        JSON.stringify(response.json) === JSON.stringify({ error: "not found" }),
        `public-jobs-tenant-scope: ${label} tenant returned role data`,
      );
    }
    expect(
      !tenantAJobs.some((job) => job.id === inactiveJob) &&
        !tenantBJobs.some((job) => job.id === inactiveJob),
      "public-jobs-tenant-scope: inactive tenant role leaked into an active response",
    );
  } finally {
    const jobIds = [tenantAJob, tenantBJob, inactiveJob].filter(Boolean);
    if (jobIds.length) {
      await pool
        .query("DELETE FROM jobs WHERE id = ANY($1)", [jobIds])
        .catch(() => {});
    }
    const tenantIds = [tenantB?.id, inactiveTenant?.id].filter(Boolean);
    if (tenantIds.length) {
      await pool
        .query("DELETE FROM tenants WHERE id = ANY($1)", [tenantIds])
        .catch(() => {});
    }
  }
}

async function scenarioPublicApplicationsTenantScope() {
  const run = rand();
  const tenantBSlug = `apply-b-${run}`;
  const inactiveSlug = `apply-inactive-${run}`;
  const applicationEmails = {
    tenantA: `public-a-${run}@amigatest.com`,
    tenantB: `public-b-${run}@amigatest.com`,
    general: `public-general-${run}@amigatest.com`,
    spacedFilename: `public-spaced-filename-${run}@amigatest.com`,
    unicodeFilename: `public-unicode-filename-${run}@amigatest.com`,
    boundaryFilename: `public-boundary-filename-${run}@amigatest.com`,
    alteredFilename: `public-altered-filename-${run}@amigatest.com`,
    metadataMismatch: `public-metadata-mismatch-${run}@amigatest.com`,
    mismatch: `public-mismatch-${run}@amigatest.com`,
    missing: `public-missing-${run}@amigatest.com`,
    storageFailure: `public-storage-failure-${run}@amigatest.com`,
    missingTenant: `public-missing-tenant-${run}@amigatest.com`,
    closed: `public-closed-${run}@amigatest.com`,
    inactive: `public-inactive-${run}@amigatest.com`,
  };
  const documentPaths = {
    sentinel: `/objects/uploads/public-general-sentinel-${run}`,
  };
  const unusualFilenameCases = [
    {
      key: "spacedFilename",
      name: "candidate CV final version.pdf",
      content: "spaced filename document",
    },
    {
      key: "unicodeFilename",
      name: "résumé final – 版本 2.pdf",
      content: "unicode filename document",
    },
    {
      key: "boundaryFilename",
      name: `${"x".repeat(251)}.pdf`,
      content: "boundary filename document",
    },
  ];
  const alteredFilename = "résumé final – 版本 2 renamed.pdf";
  let tenantB, inactiveTenant, tenantAJob, tenantBJob, closedJob, inactiveJob;
  let cleanupSentinelCandidate, cleanupSentinelDocument;
  let storageFailureServer;
  const payload = (email, jobId = null, documents) => ({
    firstName: "Public",
    lastName: "Applicant",
    email,
    jobId,
    rightToWorkStatus: "uk_citizen",
    ...(documents ? { documents } : {}),
  });
  const document = (objectPath, name, fileSize = 41, mimeType = "application/pdf") => ({
    name,
    category: "cv",
    objectPath,
    fileSize,
    mimeType,
  });
  let publicClient = 0;
  const publicApiAt = (base, method, path, options = {}) =>
    apiAt(base, method, path, {
      ...options,
      headers: {
        "x-forwarded-for": `198.51.100.${++publicClient}`,
        ...(options.headers || {}),
      },
    });
  const publicApi = (method, path, options = {}) =>
    publicApiAt(BASE, method, path, options);
  const expectNotFound = (response, label) => {
    expectStatus(response.status, 404, `${label} status`);
    expect(
      JSON.stringify(response.json) === JSON.stringify({ error: "not found" }),
      `${label}: expected documented not found error`,
    );
  };
  try {
    tenantB = await seedPublicTenant({
      slug: tenantBSlug,
      name: `Application Tenant B ${run}`,
    });
    inactiveTenant = await seedPublicTenant({
      slug: inactiveSlug,
      name: `Inactive Application Tenant ${run}`,
      status: "inactive",
    });
    tenantAJob = await seedJob(`Application Tenant A Role ${run}`);
    tenantBJob = await seedPublicJob(tenantB.id, `Application Tenant B Role ${run}`);
    closedJob = await seedPublicJob(
      TENANT,
      `Closed Application Role ${run}`,
      "closed",
    );
    inactiveJob = await seedPublicJob(
      inactiveTenant.id,
      `Inactive Application Role ${run}`,
    );
    cleanupSentinelCandidate = await seedCandidateForTenant(
      inactiveTenant.id,
      applicationEmails.general,
    );
    await pool.query(
      `INSERT INTO candidate_stage_history
         (tenant_id, candidate_id, from_stage, to_stage, note, changed_by)
       VALUES ($1, $2, NULL, 'new', 'Cleanup sentinel', 'Test')`,
      [inactiveTenant.id, cleanupSentinelCandidate],
    );
    cleanupSentinelDocument = await seedCandidateDocument(
      inactiveTenant.id,
      cleanupSentinelCandidate,
      documentPaths.sentinel,
    );

    const tenantAUpload = await publicApi(
      "POST",
      "/api/public/amiga/upload-url",
      {
        body: {
          name: "tenant-a-cv.pdf",
          size: 1234,
          contentType: "application/pdf",
        },
      },
    );
    expectStatus(
      tenantAUpload.status,
      200,
      "public-applications-tenant-scope tenant A upload URL",
    );
    const tenantBUpload = await publicApi(
      "POST",
      `/api/public/${tenantB.slug}/upload-url`,
      {
        body: {
          name: "tenant-b-cv.pdf",
          size: 1234,
          contentType: "application/pdf",
        },
      },
    );
    expectStatus(
      tenantBUpload.status,
      200,
      "public-applications-tenant-scope tenant B upload URL",
    );
    documentPaths.tenantA = tenantAUpload.json?.objectPath;
    documentPaths.tenantB = tenantBUpload.json?.objectPath;
    expect(
      typeof documentPaths.tenantA === "string" &&
        documentPaths.tenantA.startsWith(`/objects/uploads/${TENANT}/`),
      "public-applications-tenant-scope: tenant A upload path was not tenant-namespaced",
    );
    expect(
      typeof documentPaths.tenantB === "string" &&
        documentPaths.tenantB.startsWith(`/objects/uploads/${tenantB.id}/`),
      "public-applications-tenant-scope: tenant B upload path was not tenant-namespaced",
    );

    await uploadObject(
      tenantAUpload.json?.uploadURL,
      "public-applications-tenant-scope tenant A",
    );
    await uploadObject(
      tenantBUpload.json?.uploadURL,
      "public-applications-tenant-scope tenant B",
    );

    const tenantAGeneralUpload = await publicApi(
      "POST",
      "/api/public/amiga/upload-url",
      {
        body: {
          name: "tenant-a-cv.pdf",
          size: 1234,
          contentType: "application/pdf",
        },
      },
    );
    expectStatus(
      tenantAGeneralUpload.status,
      200,
      "public-applications-tenant-scope general tenant A upload URL",
    );
    documentPaths.generalTenantA = tenantAGeneralUpload.json?.objectPath;
    await uploadObject(
      tenantAGeneralUpload.json?.uploadURL,
      "public-applications-tenant-scope tenant A",
    );

    const tenantAMatchingDocument = document(
      documentPaths.tenantA,
      "tenant-a-cv.pdf",
      41,
      "application/pdf",
    );
    const matchingDocument = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      {
        body: payload(applicationEmails.metadataMismatch, null, [
          tenantAMatchingDocument,
        ]),
      },
    );
    expectStatus(
      matchingDocument.status,
      201,
      "public-applications-tenant-scope accepts matching document metadata",
    );

    for (const filenameCase of unusualFilenameCases) {
      const contentSize = Buffer.byteLength(filenameCase.content);
      const upload = await publicApi(
        "POST",
        "/api/public/amiga/upload-url",
        {
          body: {
            name: filenameCase.name,
            size: contentSize,
            contentType: "application/pdf",
          },
        },
      );
      expectStatus(
        upload.status,
        200,
        `public-applications-tenant-scope ${filenameCase.key} upload URL`,
      );
      documentPaths[filenameCase.key] = upload.json?.objectPath;
      expect(
        typeof documentPaths[filenameCase.key] === "string" &&
          documentPaths[filenameCase.key].endsWith(
            `_${Buffer.from(filenameCase.name, "utf8").toString("hex")}`,
          ),
        `public-applications-tenant-scope: ${filenameCase.key} name was not bound into object identity`,
      );
      await uploadObject(
        upload.json?.uploadURL,
        `public-applications-tenant-scope ${filenameCase.key}`,
        "application/pdf",
        filenameCase.content,
      );

      const submission = await publicApi(
        "POST",
        "/api/public/amiga/applications",
        {
          body: payload(
            applicationEmails[filenameCase.key],
            null,
            [
              document(
                documentPaths[filenameCase.key],
                filenameCase.name,
                contentSize,
              ),
            ],
          ),
        },
      );
      expectStatus(
        submission.status,
        201,
        `public-applications-tenant-scope accepts ${filenameCase.key} metadata`,
      );
    }

    const alteredNameUpload = await publicApi(
      "POST",
      "/api/public/amiga/upload-url",
      {
        body: {
          name: unusualFilenameCases[1].name,
          size: Buffer.byteLength(unusualFilenameCases[1].content),
          contentType: "application/pdf",
        },
      },
    );
    expectStatus(
      alteredNameUpload.status,
      200,
      "public-applications-tenant-scope altered filename upload URL",
    );
    documentPaths.alteredFilename = alteredNameUpload.json?.objectPath;
    await uploadObject(
      alteredNameUpload.json?.uploadURL,
      "public-applications-tenant-scope altered filename",
      "application/pdf",
      unusualFilenameCases[1].content,
    );
    const alteredFilenameSubmission = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      {
        body: payload(applicationEmails.alteredFilename, null, [
          document(
            documentPaths.alteredFilename,
            alteredFilename,
            Buffer.byteLength(unusualFilenameCases[1].content),
          ),
        ]),
      },
    );
    expectStatus(
      alteredFilenameSubmission.status,
      400,
      "public-applications-tenant-scope rejects altered filename",
    );
    expect(
      JSON.stringify(alteredFilenameSubmission.json) ===
        JSON.stringify({ error: "Invalid document reference." }),
      "public-applications-tenant-scope: altered filename returned the wrong error",
    );
    const alteredFilenameRows = (
      await pool.query(
        `SELECT
           (SELECT COUNT(*)::int
            FROM candidates
            WHERE tenant_id = $1 AND email = $2) AS candidate_count,
           (SELECT COUNT(*)::int
            FROM candidate_documents d
            JOIN candidates c ON c.id = d.candidate_id
            WHERE d.tenant_id = $1 AND c.email = $2) AS document_count`,
        [TENANT, applicationEmails.alteredFilename],
      )
    ).rows[0];
    expect(
      alteredFilenameRows.candidate_count === 0 &&
        alteredFilenameRows.document_count === 0,
      "public-applications-tenant-scope: altered filename created candidate data",
    );

    const metadataMismatch = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      {
        body: payload(applicationEmails.mismatch, null, [
          document(documentPaths.tenantB, "wrong-name.pdf", 41, "text/plain"),
        ]),
      },
    );
    expectStatus(
      metadataMismatch.status,
      400,
      "public-applications-tenant-scope rejects mismatched document metadata",
    );
    expect(
      JSON.stringify(metadataMismatch.json) ===
        JSON.stringify({ error: "Invalid document reference." }),
      "public-applications-tenant-scope: mismatched document returned the wrong error",
    );
    const metadataMismatchRows = (
      await pool.query(
        `SELECT
           (SELECT COUNT(*)::int
            FROM candidates
            WHERE tenant_id = $1 AND email = $2) AS candidate_count,
           (SELECT COUNT(*)::int
            FROM candidate_documents d
            JOIN candidates c ON c.id = d.candidate_id
            WHERE d.tenant_id = $1 AND c.email = $2) AS document_count`,
        [TENANT, applicationEmails.mismatch],
      )
    ).rows[0];
    expect(
      metadataMismatchRows.candidate_count === 0 &&
        metadataMismatchRows.document_count === 0,
      "public-applications-tenant-scope: mismatched document created candidate data",
    );

    const crossTenantDocument = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      {
        body: payload(
          `public-cross-tenant-document-${run}@amigatest.com`,
          tenantAJob,
          [document(documentPaths.tenantB, "Tenant B CV")],
        ),
      },
    );
    expectStatus(
      crossTenantDocument.status,
      400,
      "public-applications-tenant-scope rejects tenant B document on tenant A",
    );

    const missingDocument = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      {
        body: payload(applicationEmails.missing, tenantAJob, [
          document(documentPaths.tenantA, "Missing CV"),
        ]),
      },
    );
    expectStatus(
      missingDocument.status,
      400,
      "public-applications-tenant-scope rejects missing document object",
    );
    expect(
      JSON.stringify(missingDocument.json) ===
        JSON.stringify({ error: "Invalid document reference." }),
      "public-applications-tenant-scope: missing document returned the wrong error",
    );
    const missingDocumentRows = (
      await pool.query(
        `SELECT
           (SELECT COUNT(*)::int
            FROM candidates
            WHERE tenant_id = $1 AND email = $2) AS candidate_count,
           (SELECT COUNT(*)::int
            FROM candidate_documents d
            JOIN candidates c ON c.id = d.candidate_id
            WHERE d.tenant_id = $1 AND c.email = $2) AS document_count`,
        [TENANT, applicationEmails.missing],
      )
    ).rows[0];
    expect(
      missingDocumentRows.candidate_count === 0 &&
        missingDocumentRows.document_count === 0,
      "public-applications-tenant-scope: missing document created candidate data",
    );

    storageFailureServer = await startStorageFailureServer();
    const storageFailureDocument = await publicApiAt(
      storageFailureServer.base,
      "POST",
      "/api/public/amiga/applications",
      {
        body: payload(applicationEmails.storageFailure, tenantAJob, [
          document(`/objects/uploads/${TENANT}/storage-outage`, "Storage failure CV"),
        ]),
      },
    );
    expectStatus(
      storageFailureDocument.status,
      500,
      "public-applications-tenant-scope returns server error for storage failure",
    );
    expect(
      JSON.stringify(storageFailureDocument.json) ===
        JSON.stringify({ error: "Failed to submit application" }),
      "public-applications-tenant-scope: storage failure was mislabeled as invalid document input",
    );
    const storageFailureRows = (
      await pool.query(
        `SELECT
           (SELECT COUNT(*)::int
            FROM candidates
            WHERE tenant_id = $1 AND email = $2) AS candidate_count,
           (SELECT COUNT(*)::int
            FROM candidate_documents d
            JOIN candidates c ON c.id = d.candidate_id
            WHERE d.tenant_id = $1 AND c.email = $2) AS document_count`,
        [TENANT, applicationEmails.storageFailure],
      )
    ).rows[0];
    expect(
      storageFailureRows.candidate_count === 0 &&
        storageFailureRows.document_count === 0,
      "public-applications-tenant-scope: storage failure created candidate data",
    );

    await uploadObject(
      tenantAUpload.json?.uploadURL,
      "public-applications-tenant-scope tenant A",
    );
    await uploadObject(
      tenantBUpload.json?.uploadURL,
      "public-applications-tenant-scope tenant B",
    );

    const tenantAResponse = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      { body: payload(applicationEmails.tenantA, tenantAJob) },
    );
    expectStatus(tenantAResponse.status, 201, "public-applications-tenant-scope tenant A");

    const tenantBResponse = await publicApi(
      "POST",
      `/api/public/${tenantB.slug}/applications`,
      { body: payload(applicationEmails.tenantB, tenantBJob) },
    );
    expectStatus(tenantBResponse.status, 201, "public-applications-tenant-scope tenant B");

    const generalTenantAResponse = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      {
        body: payload(applicationEmails.general, null, [
          document(documentPaths.generalTenantA, "tenant-a-cv.pdf"),
        ]),
      },
    );
    expectStatus(
      generalTenantAResponse.status,
      201,
      "public-applications-tenant-scope general application tenant A",
    );
    const generalTenantAId = generalTenantAResponse.json?.id;
    expect(
      typeof generalTenantAId === "number",
      "public-applications-tenant-scope: tenant A general application missing id",
    );

    const generalTenantBResponse = await publicApi(
      "POST",
      `/api/public/${tenantB.slug}/applications`,
      {
        body: payload(applicationEmails.general, null, [
          document(documentPaths.tenantB, "tenant-b-cv.pdf"),
        ]),
      },
    );
    expectStatus(
      generalTenantBResponse.status,
      201,
      "public-applications-tenant-scope general application tenant B",
    );
    const generalTenantBId = generalTenantBResponse.json?.id;
    expect(
      typeof generalTenantBId === "number" && generalTenantBId !== generalTenantAId,
      "public-applications-tenant-scope: same general applicant must be stored once per tenant",
    );

    const generalTenantARetry = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      { body: payload(applicationEmails.general) },
    );
    expectStatus(
      generalTenantARetry.status,
      200,
      "public-applications-tenant-scope duplicate general application tenant A",
    );
    expect(
      generalTenantARetry.json?.id === generalTenantAId &&
        generalTenantARetry.json?.message?.includes("already been received"),
      "public-applications-tenant-scope: tenant A general retry was not detected as a duplicate",
    );

    const generalTenantBRetry = await publicApi(
      "POST",
      `/api/public/${tenantB.slug}/applications`,
      { body: payload(applicationEmails.general) },
    );
    expectStatus(
      generalTenantBRetry.status,
      200,
      "public-applications-tenant-scope duplicate general application tenant B",
    );
    expect(
      generalTenantBRetry.json?.id === generalTenantBId &&
        generalTenantBRetry.json?.message?.includes("already been received"),
      "public-applications-tenant-scope: tenant B general retry was not detected as a duplicate",
    );

    const mismatched = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      { body: payload(applicationEmails.mismatch, tenantBJob) },
    );
    expectNotFound(
      mismatched,
      "public-applications-tenant-scope mismatched tenant/job",
    );

    const missingJob = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      { body: payload(applicationEmails.missing, 2147483647) },
    );
    expectNotFound(
      missingJob,
      "public-applications-tenant-scope missing job",
    );

    const missingTenant = await publicApi(
      "POST",
      `/api/public/missing-${run}/applications`,
      { body: payload(applicationEmails.missingTenant, tenantAJob) },
    );
    expectNotFound(
      missingTenant,
      "public-applications-tenant-scope missing tenant",
    );

    const closed = await publicApi(
      "POST",
      "/api/public/amiga/applications",
      { body: payload(applicationEmails.closed, closedJob) },
    );
    expectNotFound(
      closed,
      "public-applications-tenant-scope inactive job",
    );

    const inactive = await publicApi(
      "POST",
      `/api/public/${inactiveTenant.slug}/applications`,
      { body: payload(applicationEmails.inactive, inactiveJob) },
    );
    expectNotFound(
      inactive,
      "public-applications-tenant-scope inactive tenant",
    );

    const created = (
      await pool.query(
        `SELECT tenant_id, job_id, email
         FROM candidates
         WHERE tenant_id = ANY($2) AND email = ANY($1)
         ORDER BY email`,
        [Object.values(applicationEmails), [TENANT, tenantB.id]],
      )
    ).rows;
    expect(
      created.length === 8,
      `public-applications-tenant-scope: expected 8 candidates including three unusual-filename, one metadata-match, and one general application per tenant, found ${created.length}`,
    );
    expect(
      created.some(
        (candidate) =>
          candidate.tenant_id === TENANT &&
          candidate.job_id === tenantAJob &&
          candidate.email === applicationEmails.tenantA,
      ),
      "public-applications-tenant-scope: tenant A application was not scoped to its job",
    );
    expect(
      created.some(
        (candidate) =>
          candidate.tenant_id === tenantB.id &&
          candidate.job_id === tenantBJob &&
          candidate.email === applicationEmails.tenantB,
      ),
      "public-applications-tenant-scope: tenant B application was not scoped to its job",
    );
    const generalCandidates = created.filter(
      (candidate) => candidate.email === applicationEmails.general,
    );
    expect(
      generalCandidates.length === 2 &&
        generalCandidates.every((candidate) => candidate.job_id === null) &&
        generalCandidates.some(
          (candidate) => candidate.tenant_id === TENANT,
        ) &&
        generalCandidates.some(
          (candidate) => candidate.tenant_id === tenantB.id,
        ),
      "public-applications-tenant-scope: general applications must have null jobs and stay with their requesting tenant",
    );
    const generalHistory = (
      await pool.query(
        `SELECT h.tenant_id, h.candidate_id, h.from_stage, h.to_stage, h.changed_by
         FROM candidate_stage_history h
         JOIN candidates c
           ON c.id = h.candidate_id AND c.tenant_id = h.tenant_id
         WHERE h.candidate_id = ANY($1)
         ORDER BY h.tenant_id`,
        [[generalTenantAId, generalTenantBId]],
      )
    ).rows;
    expect(
      generalHistory.length === 2 &&
        generalHistory.every(
          (history) =>
            history.from_stage === null &&
            history.to_stage === "new" &&
            history.changed_by === "Public",
        ) &&
        generalHistory.some(
          (history) =>
            history.candidate_id === generalTenantAId &&
            history.tenant_id === TENANT,
        ) &&
        generalHistory.some(
          (history) =>
            history.candidate_id === generalTenantBId &&
            history.tenant_id === tenantB.id,
        ),
      "public-applications-tenant-scope: each general candidate must have exactly one initial Public history row under its own tenant",
    );
    const createdDocuments = (
      await pool.query(
        `SELECT d.tenant_id, d.candidate_id, d.object_path, c.email
         FROM candidate_documents d
         JOIN candidates c ON c.id = d.candidate_id
         WHERE d.object_path = ANY($1) AND c.email = $2
         ORDER BY d.object_path`,
        [
          [documentPaths.generalTenantA, documentPaths.tenantB],
          applicationEmails.general,
        ],
      )
    ).rows;
    expect(
      createdDocuments.length === 2 &&
        createdDocuments.some(
          (doc) =>
            doc.tenant_id === TENANT &&
            doc.candidate_id === generalTenantAId &&
            doc.object_path === documentPaths.generalTenantA &&
            doc.email === applicationEmails.general,
        ) &&
        createdDocuments.some(
          (doc) =>
            doc.tenant_id === tenantB.id &&
            doc.candidate_id === generalTenantBId &&
            doc.object_path === documentPaths.tenantB &&
            doc.email === applicationEmails.general,
        ),
      "public-applications-tenant-scope: general application documents must reference their candidate and requesting tenant",
    );
    const unusualDocuments = (
      await pool.query(
        `SELECT d.name, d.object_path, c.email
         FROM candidate_documents d
         JOIN candidates c ON c.id = d.candidate_id
         WHERE c.email = ANY($1)
         ORDER BY c.email`,
        [[
          applicationEmails.spacedFilename,
          applicationEmails.unicodeFilename,
          applicationEmails.boundaryFilename,
        ]],
      )
    ).rows;
    expect(
      unusualDocuments.length === unusualFilenameCases.length &&
        unusualFilenameCases.every((filenameCase) =>
          unusualDocuments.some(
            (doc) =>
              doc.email === applicationEmails[filenameCase.key] &&
              doc.name === filenameCase.name &&
              doc.object_path === documentPaths[filenameCase.key],
          ),
        ),
      "public-applications-tenant-scope: unusual filenames were not preserved on candidate documents",
    );
  } finally {
    await storageFailureServer?.stop();
    const emails = Object.values(applicationEmails);
    const cleanupTenantIds = [TENANT, tenantB?.id].filter(Boolean);
    let cleanupSentinelPreserved = true;
    let cleanupHistoryRemoved = true;
    const candidateRows = cleanupTenantIds.length
      ? await pool
          .query(
            `SELECT id
             FROM candidates
             WHERE tenant_id = ANY($1) AND email = ANY($2) AND source = 'online_application'`,
            [cleanupTenantIds, emails],
          )
          .catch(() => ({ rows: [] }))
      : { rows: [] };
    const candidateIds = candidateRows.rows.map((candidate) => candidate.id);
    if (candidateIds.length) {
      await pool
        .query(
          "DELETE FROM candidate_stage_history WHERE candidate_id = ANY($1)",
          [candidateIds],
        )
        .catch(() => {});
      const remainingHistory = await pool
        .query(
          "SELECT COUNT(*)::int AS count FROM candidate_stage_history WHERE candidate_id = ANY($1)",
          [candidateIds],
        )
        .catch(() => ({ rows: [{ count: 1 }] }));
      cleanupHistoryRemoved =
        Number(remainingHistory.rows[0]?.count ?? 1) === 0;
      await pool
        .query("DELETE FROM candidates WHERE id = ANY($1)", [candidateIds])
        .catch(() => {});
    }
    const testDocuments = await pool
      .query(
        "SELECT id FROM candidate_documents WHERE object_path = ANY($1)",
        [[
          documentPaths.tenantA,
          documentPaths.generalTenantA,
          documentPaths.tenantB,
          ...unusualFilenameCases.map((filenameCase) => documentPaths[filenameCase.key]),
          documentPaths.alteredFilename,
        ]],
      )
      .catch(() => ({ rows: [] }));
    const sentinelDocument = cleanupSentinelDocument
      ? await pool
          .query(
            `SELECT tenant_id, candidate_id
             FROM candidate_documents
             WHERE id = $1 AND object_path = $2`,
            [cleanupSentinelDocument, documentPaths.sentinel],
          )
          .catch(() => ({ rows: [] }))
      : { rows: [] };
    expect(
      testDocuments.rows.length === 0,
      "public-applications-tenant-scope: cleanup left a test tenant document behind",
    );
    await pool
      .query(
        "DELETE FROM public_application_uploads WHERE object_path = ANY($1)",
        [[
          documentPaths.tenantA,
          documentPaths.generalTenantA,
          documentPaths.tenantB,
          ...unusualFilenameCases.map((filenameCase) => documentPaths[filenameCase.key]),
          documentPaths.alteredFilename,
        ].filter(Boolean)],
      )
      .catch(() => {});
    if (cleanupSentinelDocument) {
      expect(
        sentinelDocument.rows.length === 1 &&
          sentinelDocument.rows[0].tenant_id === inactiveTenant?.id &&
          sentinelDocument.rows[0].candidate_id === cleanupSentinelCandidate,
        "public-applications-tenant-scope: cleanup removed a same-email document from another tenant",
      );
    }
    if (cleanupSentinelCandidate) {
      const sentinel = await pool
        .query(
          `SELECT c.id, COUNT(h.id)::int AS history_count
           FROM candidates c
           LEFT JOIN candidate_stage_history h
             ON h.candidate_id = c.id AND h.tenant_id = c.tenant_id
           WHERE c.id=$1 AND c.tenant_id=$2
           GROUP BY c.id`,
          [cleanupSentinelCandidate, inactiveTenant?.id],
        )
        .catch(() => ({ rowCount: 0 }));
      cleanupSentinelPreserved =
        sentinel.rowCount === 1 &&
        Number(sentinel.rows[0]?.history_count ?? 0) === 1;
      await pool
        .query("DELETE FROM candidates WHERE id=$1", [cleanupSentinelCandidate])
        .catch(() => {});
    }
    const jobIds = [tenantAJob, tenantBJob, closedJob, inactiveJob].filter(Boolean);
    if (jobIds.length) {
      await pool
        .query("DELETE FROM jobs WHERE id = ANY($1)", [jobIds])
        .catch(() => {});
    }
    const tenantResourceIds = [tenantB?.id, inactiveTenant?.id].filter(Boolean);
    if (tenantResourceIds.length) {
      await pool
        .query("DELETE FROM tenants WHERE id = ANY($1)", [tenantResourceIds])
        .catch(() => {});
    }
    expect(
      cleanupHistoryRemoved && cleanupSentinelPreserved,
      "public-applications-tenant-scope: cleanup must remove only the two test tenants' history",
    );
  }
}

async function scenarioPublicApplicationRateLimitTenantScope() {
  const run = rand();
  const tenantBSlug = `apply-limit-b-${run}`;
  const emails = Array.from(
    { length: 6 },
    (_, index) => `public-limit-a-${index}-${run}@amigatest.com`,
  );
  const tenantBEmail = `public-limit-b-${run}@amigatest.com`;
  const sharedClient = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
  let tenantB, tenantAJob, tenantBJob;
  const payload = (email, jobId) => ({
    firstName: "Rate",
    lastName: "Limited",
    email,
    jobId,
    rightToWorkStatus: "uk_citizen",
  });
  const publicApiFromSharedClient = (method, path, options = {}) =>
    api(method, path, {
      ...options,
      headers: {
        "x-forwarded-for": sharedClient,
        ...(options.headers || {}),
      },
    });

  try {
    tenantB = await seedPublicTenant({
      slug: tenantBSlug,
      name: `Application Rate Limit Tenant B ${run}`,
    });
    tenantAJob = await seedJob(`Application Rate Limit Tenant A Role ${run}`);
    tenantBJob = await seedPublicJob(tenantB.id, `Application Rate Limit Tenant B Role ${run}`);

    for (const [index, email] of emails.entries()) {
      const response = await publicApiFromSharedClient(
        "POST",
        "/api/public/amiga/applications",
        { body: payload(email, tenantAJob) },
      );
      expectStatus(
        response.status,
        index < 5 ? 201 : 429,
        `public-application-rate-limit tenant A request ${index + 1}`,
      );
    }

    const tenantBResponse = await publicApiFromSharedClient(
      "POST",
      `/api/public/${tenantB.slug}/applications`,
      { body: payload(tenantBEmail, tenantBJob) },
    );
    expectStatus(
      tenantBResponse.status,
      201,
      "public-application-rate-limit tenant B request after tenant A is exhausted",
    );
  } finally {
    const applicationEmails = [...emails, tenantBEmail];
    await pool
      .query(
        `DELETE FROM candidate_stage_history
         WHERE candidate_id IN (
           SELECT id FROM candidates WHERE email = ANY($1)
         )`,
        [applicationEmails],
      )
      .catch(() => {});
    await pool
      .query("DELETE FROM candidates WHERE email = ANY($1)", [applicationEmails])
      .catch(() => {});
    const jobIds = [tenantAJob, tenantBJob].filter(Boolean);
    if (jobIds.length) {
      await pool
        .query("DELETE FROM jobs WHERE id = ANY($1)", [jobIds])
        .catch(() => {});
    }
    if (tenantB) {
      await pool.query("DELETE FROM tenants WHERE id = $1", [tenantB.id]).catch(() => {});
    }
  }
}

async function scenarioManagerLeaveScope() {
  const run = rand();
  const u = await makeUser("mgrscope");
  let mgr, report, other;
  try {
    await bootstrap(u);
    mgr = await seedEmployee({ number: `MGR-${run}`, first: "Mona", last: "Manager", mail: `mona-${run}@amigatest.com`, jobTitle: "Engineering Manager" });
    report = await seedEmployee({ number: `RPT-${run}`, first: "Rita", last: "Report", mail: `rita-${run}@amigatest.com`, managerId: mgr });
    other = await seedEmployee({ number: `OTH-${run}`, first: "Otto", last: "Other", mail: `otto-${run}@amigatest.com`, department: "Operations" });
    const reportReq = await seedLeaveRequest(report);
    const otherReq = await seedLeaveRequest(other);
    await forceRole(u, "manager", mgr);

    const list = await authed(u, "GET", "/api/leave");
    expectStatus(list.status, 200, "manager-leave-scope GET /api/leave");
    const items = Array.isArray(list.json) ? list.json : [];
    expect(
      items.some((x) => x.id === reportReq && x.employeeId === report),
      "manager-leave-scope: leave list must contain the direct report's request",
    );
    expect(
      !items.some((x) => x.id === otherReq || x.employeeId === other),
      "manager-leave-scope: leave list must NOT contain the non-report's request",
    );

    expectStatus(
      (await authed(u, "PATCH", `/api/leave-requests/${reportReq}`, { body: { status: "approved" } })).status,
      200,
      "manager-leave-scope PATCH report's request",
    );
    expectStatus(
      (await authed(u, "PATCH", `/api/leave-requests/${otherReq}`, { body: { status: "approved" } })).status,
      403,
      "manager-leave-scope PATCH non-report's request",
    );
  } finally {
    const ids = [mgr, report, other].filter(Boolean);
    if (ids.length) {
      await pool.query("DELETE FROM leave_entitlements WHERE employee_id = ANY($1)", [ids]).catch(() => {});
      await pool.query("DELETE FROM leave_requests WHERE employee_id = ANY($1)", [ids]).catch(() => {});
      await pool.query("DELETE FROM employees WHERE id = ANY($1)", [ids]).catch(() => {});
    }
    await destroyUser(u);
  }
}

async function scenarioManagerSickPayScope() {
  const run = rand();
  const u = await makeUser("sickpayscope");
  let mgr, report, other;
  try {
    await bootstrap(u);
    mgr = await seedEmployee({ number: `SMGR-${run}`, first: "Sara", last: "Manager", mail: `sara-${run}@amigatest.com`, jobTitle: "Engineering Manager" });
    report = await seedEmployee({ number: `SRPT-${run}`, first: "Rhys", last: "Report", mail: `rhys-${run}@amigatest.com`, managerId: mgr });
    other = await seedEmployee({ number: `SOTH-${run}`, first: "Olga", last: "Other", mail: `olga-${run}@amigatest.com`, department: "Operations" });
    const reportAbs = await seedSickness(report);
    const otherAbs = await seedSickness(other);
    await forceRole(u, "manager", mgr);

    const list = await authed(u, "GET", "/api/sickness");
    expectStatus(list.status, 200, "manager-sickpay-scope GET /api/sickness");
    const items = Array.isArray(list.json) ? list.json : [];
    expect(
      items.some((x) => x.id === reportAbs && x.employeeId === report),
      "manager-sickpay-scope: sickness list must contain the report's absence",
    );
    expect(
      !items.some((x) => x.id === otherAbs || x.employeeId === other),
      "manager-sickpay-scope: sickness list must NOT contain the non-report's absence",
    );

    const reportPaths = [
      `/api/sickness/employees/${report}`,
      `/api/employees/${report}`,
      `/api/employees/${report}/salary-history`,
      `/api/employees/${report}/total-reward`,
      `/api/employees/${report}/benefits`,
      `/api/employees/${report}/documents`,
    ];
    const otherPaths = [
      `/api/sickness/employees/${other}`,
      `/api/employees/${other}`,
      `/api/employees/${other}/salary-history`,
      `/api/employees/${other}/total-reward`,
      `/api/employees/${other}/benefits`,
      `/api/employees/${other}/documents`,
    ];
    for (const p of reportPaths) {
      expectStatus((await authed(u, "GET", p)).status, 200, `manager-sickpay-scope GET ${p} (report)`);
    }
    for (const p of otherPaths) {
      expectStatus((await authed(u, "GET", p)).status, 403, `manager-sickpay-scope GET ${p} (non-report)`);
    }
  } finally {
    const ids = [mgr, report, other].filter(Boolean);
    if (ids.length) {
      await pool.query("DELETE FROM sickness_absences WHERE employee_id = ANY($1)", [ids]).catch(() => {});
      await pool.query("DELETE FROM employees WHERE id = ANY($1)", [ids]).catch(() => {});
    }
    await destroyUser(u);
  }
}

async function scenarioManagerCandidateScope() {
  const run = rand();
  const u = await makeUser("candscope");
  let mgr, ownedJob, otherJob, ownedCand, otherCand;
  try {
    await bootstrap(u);
    mgr = await seedEmployee({ number: `CMGR-${run}`, first: "Cara", last: "Manager", mail: `cara-${run}@amigatest.com`, jobTitle: "Engineering Manager" });
    ownedJob = await seedJob(`Owned Role ${run}`, mgr);
    otherJob = await seedJob(`Other Role ${run}`, null);
    ownedCand = await seedCandidate(ownedJob, `owen-${run}@amigatest.com`);
    otherCand = await seedCandidate(otherJob, `nina-${run}@amigatest.com`);
    await forceRole(u, "manager", mgr);

    const list = await authed(u, "GET", "/api/candidates");
    expectStatus(list.status, 200, "manager-candidate-scope GET /api/candidates");
    const items = Array.isArray(list.json) ? list.json : [];
    expect(
      items.some((x) => x.id === ownedCand && x.jobId === ownedJob),
      "manager-candidate-scope: list must contain the candidate on the owned job",
    );
    expect(
      !items.some((x) => x.id === otherCand || x.jobId === otherJob),
      "manager-candidate-scope: list must NOT contain the candidate on the non-owned job",
    );

    expectStatus(
      (await authed(u, "GET", `/api/candidates/${ownedCand}`)).status,
      200,
      "manager-candidate-scope GET owned candidate",
    );
    expectStatus(
      (await authed(u, "GET", `/api/candidates/${otherCand}`)).status,
      403,
      "manager-candidate-scope GET non-owned candidate",
    );
  } finally {
    if (ownedCand || otherCand) {
      await pool.query("DELETE FROM candidates WHERE id = ANY($1)", [[ownedCand, otherCand].filter(Boolean)]).catch(() => {});
    }
    if (ownedJob || otherJob) {
      await pool.query("DELETE FROM jobs WHERE id = ANY($1)", [[ownedJob, otherJob].filter(Boolean)]).catch(() => {});
    }
    if (mgr) await pool.query("DELETE FROM employees WHERE id=$1", [mgr]).catch(() => {});
    await destroyUser(u);
  }
}

async function scenarioCandidateHistoryTenantScope() {
  const run = rand();
  const u = await makeUser("candhistory");
  let tenantB;
  let tenantAJob;
  let tenantBJob;
  let tenantACandidate;
  let tenantBCandidate;
  try {
    await bootstrap(u);
    await forceRole(u, "admin", null);

    tenantB = await seedPublicTenant({
      slug: `candidate-history-b-${run}`,
      name: `Candidate History Tenant B ${run}`,
    });
    tenantAJob = await seedJob(`Candidate History Tenant A Role ${run}`);
    tenantBJob = await seedPublicJob(
      tenantB.id,
      `Candidate History Tenant B Role ${run}`,
    );
    tenantACandidate = await seedCandidate(
      tenantAJob,
      `candidate-history-a-${run}@amigatest.com`,
    );
    tenantBCandidate = await seedCandidateForTenant(
      tenantB.id,
      `candidate-history-b-${run}@amigatest.com`,
      tenantBJob,
    );
    await seedCandidateHistory(
      TENANT,
      tenantACandidate,
      `Tenant A history ${run}`,
    );
    await seedCandidateHistory(
      tenantB.id,
      tenantBCandidate,
      `Tenant B history ${run}`,
    );

    const own = await authed(u, "GET", `/api/candidates/${tenantACandidate}`);
    expectStatus(
      own.status,
      200,
      "candidate-history-tenant-scope GET own candidate",
    );
    expect(
      own.json?.id === tenantACandidate,
      "candidate-history-tenant-scope: own candidate was not returned",
    );
    const ownHistory = own.json?.stageHistory;
    expect(
      Array.isArray(ownHistory) &&
        ownHistory.length === 1 &&
        ownHistory[0]?.candidateId === tenantACandidate &&
        ownHistory[0]?.note === `Tenant A history ${run}`,
      "candidate-history-tenant-scope: own response must contain only the requesting tenant's history",
    );
    expect(
      !ownHistory.some((history) => history.note === `Tenant B history ${run}`),
      "candidate-history-tenant-scope: another tenant's history leaked into the own response",
    );

    const crossTenant = await authed(
      u,
      "GET",
      `/api/candidates/${tenantBCandidate}`,
    );
    expectStatus(
      crossTenant.status,
      404,
      "candidate-history-tenant-scope GET cross-tenant candidate",
    );
    expect(
      crossTenant.json?.error === "Candidate not found",
      "candidate-history-tenant-scope: cross-tenant candidate lookup must be not found",
    );
  } finally {
    const candidateIds = [tenantACandidate, tenantBCandidate].filter(Boolean);
    if (candidateIds.length) {
      await pool
        .query("DELETE FROM candidates WHERE id = ANY($1)", [candidateIds])
        .catch(() => {});
    }
    const jobIds = [tenantAJob, tenantBJob].filter(Boolean);
    if (jobIds.length) {
      await pool
        .query("DELETE FROM jobs WHERE id = ANY($1)", [jobIds])
        .catch(() => {});
    }
    if (tenantB) {
      await pool
        .query("DELETE FROM tenants WHERE id = $1", [tenantB.id])
        .catch(() => {});
    }
    await destroyUser(u);
  }
}

async function scenarioCandidateDetailTenantScope() {
  const run = rand();
  const u = await makeUser("candtenant");
  let tenantB, mgr, ownedJob, ownedCand, foreignCand;
  try {
    await bootstrap(u);
    tenantB = await seedPublicTenant({
      slug: `candidate-detail-b-${run}`,
      name: `Candidate Detail Tenant B ${run}`,
    });
    mgr = await seedEmployee({
      number: `CDMGR-${run}`,
      first: "Candidate",
      last: "Manager",
      mail: `candidate-manager-${run}@amigatest.com`,
      jobTitle: "Hiring Manager",
    });
    ownedJob = await seedJob(`Candidate Detail Role ${run}`, mgr);
    ownedCand = await seedCandidate(
      ownedJob,
      `owned-candidate-${run}@amigatest.com`,
    );
    foreignCand = await seedCandidateForTenant(
      tenantB.id,
      `foreign-candidate-${run}@amigatest.com`,
    );
    const ownedDocumentPath = `candidate-detail/${run}/owned.pdf`;
    const foreignDocumentPath = `candidate-detail/${run}/foreign.pdf`;
    await seedCandidateDocument(TENANT, ownedCand, ownedDocumentPath);
    await seedCandidateDocument(tenantB.id, foreignCand, foreignDocumentPath);

    await forceRole(u, "admin", null);
    const adminOwned = await authed(u, "GET", `/api/candidates/${ownedCand}`);
    expectStatus(
      adminOwned.status,
      200,
      "candidate-detail-tenant-scope admin GET owned candidate",
    );
    expect(
      adminOwned.json?.id === ownedCand &&
        adminOwned.json?.documents?.some(
          (doc) => doc.objectPath === ownedDocumentPath,
        ),
      "candidate-detail-tenant-scope: admin must receive the owning candidate and its document",
    );

    const adminForeign = await authed(u, "GET", `/api/candidates/${foreignCand}`);
    expectStatus(
      adminForeign.status,
      404,
      "candidate-detail-tenant-scope admin GET foreign candidate",
    );
    expect(
      adminForeign.json?.id === undefined &&
        adminForeign.json?.documents === undefined,
      "candidate-detail-tenant-scope: admin response must not contain the foreign candidate or document",
    );

    await forceRole(u, "manager", mgr);
    const managerOwned = await authed(u, "GET", `/api/candidates/${ownedCand}`);
    expectStatus(
      managerOwned.status,
      200,
      "candidate-detail-tenant-scope manager GET owned candidate",
    );
    expect(
      managerOwned.json?.id === ownedCand &&
        managerOwned.json?.documents?.some(
          (doc) => doc.objectPath === ownedDocumentPath,
        ),
      "candidate-detail-tenant-scope: manager must receive the owning candidate and its document",
    );

    const managerForeign = await authed(
      u,
      "GET",
      `/api/candidates/${foreignCand}`,
    );
    expectStatus(
      managerForeign.status,
      404,
      "candidate-detail-tenant-scope manager GET foreign candidate",
    );
    expect(
      managerForeign.json?.id === undefined &&
        managerForeign.json?.documents === undefined,
      "candidate-detail-tenant-scope: manager response must not contain the foreign candidate or document",
    );
  } finally {
    if (ownedCand || foreignCand) {
      await pool
        .query(
          "DELETE FROM candidates WHERE id = ANY($1)",
          [[ownedCand, foreignCand].filter(Boolean)],
        )
        .catch(() => {});
    }
    if (ownedJob) {
      await pool
        .query("DELETE FROM jobs WHERE id=$1", [ownedJob])
        .catch(() => {});
    }
    if (mgr) {
      await pool
        .query("DELETE FROM employees WHERE id=$1", [mgr])
        .catch(() => {});
    }
    if (tenantB) {
      await pool
        .query("DELETE FROM tenants WHERE id=$1", [tenantB.id])
        .catch(() => {});
    }
    await destroyUser(u);
  }
}

async function scenarioCandidateHistoryWritersTenantScope() {
  const run = rand();
  const u = await makeUser("candidatehistory");
  let tenantB;
  let unrelatedTenant;
  let candidateA;
  let candidateB;
  let unrelatedCandidate;
  let unrelatedHistory;
  let crossTenantOffer;
  let convertedEmployee;
  try {
    await bootstrap(u);
    await forceRole(u, "admin", null);
    tenantB = await seedPublicTenant({
      slug: `candidate-history-writer-b-${run}`,
      name: `Candidate History Writer Tenant B ${run}`,
    });
    unrelatedTenant = await seedPublicTenant({
      slug: `candidate-history-unrelated-${run}`,
      name: `Unrelated Candidate History Tenant ${run}`,
    });
    candidateA = await seedCandidate(null, `candidate-a-${run}@amigatest.com`);
    candidateB = await seedCandidateForTenant(
      tenantB.id,
      `candidate-b-${run}@amigatest.com`,
    );
    unrelatedCandidate = await seedCandidateForTenant(
      unrelatedTenant.id,
      `candidate-unrelated-${run}@amigatest.com`,
    );
    unrelatedHistory = (
      await pool.query(
        `INSERT INTO candidate_stage_history
           (tenant_id, candidate_id, from_stage, to_stage, note, changed_by)
         VALUES ($1,$2,NULL,'new','Unrelated tenant sentinel','Test')
         RETURNING id`,
        [unrelatedTenant.id, unrelatedCandidate],
      )
    ).rows[0].id;
    crossTenantOffer = await seedOfferForTenant(tenantB.id, candidateB);

    const stage = await authed(u, "POST", `/api/candidates/${candidateA}/stage`, {
      body: { toStage: "phone_screen", note: "Tenant-safe stage change" },
    });
    expectStatus(stage.status, 200, "candidate-history-tenant-scope stage change");

    const offer = await authed(u, "POST", `/api/candidates/${candidateA}/offers`, {
      body: {
        salary: 72000,
        currency: "GBP",
        startDate: "2030-02-01",
        employmentType: "full_time",
        contractType: "permanent",
        status: "sent",
      },
    });
    expectStatus(offer.status, 201, "candidate-history-tenant-scope offer sent");

    const sameTenantHistory = (
      await pool.query(
        `SELECT h.tenant_id, h.candidate_id, c.tenant_id AS candidate_tenant_id,
                h.from_stage, h.to_stage, h.changed_by
         FROM candidate_stage_history h
         JOIN candidates c ON c.id = h.candidate_id
         WHERE h.candidate_id = $1
         ORDER BY h.id`,
        [candidateA],
      )
    ).rows;
    expect(
      sameTenantHistory.length === 2 &&
        sameTenantHistory.every(
          (history) =>
            history.tenant_id === TENANT &&
            history.candidate_tenant_id === TENANT &&
            history.candidate_id === candidateA &&
            history.changed_by === "Admin",
        ) &&
        sameTenantHistory[0].to_stage === "phone_screen" &&
        sameTenantHistory[1].to_stage === "offered",
      "candidate-history-tenant-scope: stage and offer history must match the candidate and acting tenant",
    );

    const decline = await authed(
      u,
      "PATCH",
      `/api/offers/${offer.json?.id}`,
      { body: { status: "declined", declinedReason: "Candidate withdrew" } },
    );
    expectStatus(
      decline.status,
      200,
      "candidate-history-tenant-scope same-tenant offer decline",
    );

    const crossTenantStage = await authed(
      u,
      "POST",
      `/api/candidates/${candidateB}/stage`,
      { body: { toStage: "phone_screen", note: "must not cross tenants" } },
    );
    expectStatus(
      crossTenantStage.status,
      404,
      "candidate-history-tenant-scope cross-tenant stage change",
    );

    const crossTenantCreate = await authed(
      u,
      "POST",
      `/api/candidates/${candidateB}/offers`,
      {
        body: {
          salary: 73000,
          currency: "GBP",
          startDate: "2030-03-01",
          employmentType: "full_time",
          contractType: "permanent",
          status: "sent",
        },
      },
    );
    expectStatus(
      crossTenantCreate.status,
      404,
      "candidate-history-tenant-scope cross-tenant offer creation",
    );

    const crossTenantUpdate = await authed(
      u,
      "PATCH",
      `/api/offers/${crossTenantOffer}`,
      { body: { status: "declined", declinedReason: "must not cross tenants" } },
    );
    expectStatus(
      crossTenantUpdate.status,
      404,
      "candidate-history-tenant-scope cross-tenant offer update",
    );

    const crossTenantConvert = await authed(
      u,
      "POST",
      `/api/candidates/${candidateB}/convert-to-employee`,
      { body: { startDate: "2030-04-01", jobTitle: "Cross-tenant attempt" } },
    );
    expectStatus(
      crossTenantConvert.status,
      404,
      "candidate-history-tenant-scope cross-tenant conversion",
    );

    const crossTenantRows = (
      await pool.query(
        `SELECT h.tenant_id, h.candidate_id
         FROM candidate_stage_history h
         WHERE h.candidate_id = $1`,
        [candidateB],
      )
    ).rows;
    expect(
      crossTenantRows.length === 0,
      "candidate-history-tenant-scope: cross-tenant actions must not create history",
    );
    const untouchedOffer = (
      await pool.query(
        "SELECT tenant_id, candidate_id, status FROM offers WHERE id=$1",
        [crossTenantOffer],
      )
    ).rows[0];
    expect(
      untouchedOffer?.tenant_id === tenantB.id &&
        untouchedOffer?.candidate_id === candidateB &&
        untouchedOffer?.status === "sent",
      "candidate-history-tenant-scope: cross-tenant offer must remain unchanged",
    );

    const conversion = await authed(
      u,
      "POST",
      `/api/candidates/${candidateA}/convert-to-employee`,
      { body: { startDate: "2030-05-01", jobTitle: "Converted Candidate" } },
    );
    expectStatus(
      conversion.status,
      201,
      "candidate-history-tenant-scope same-tenant conversion",
    );
    convertedEmployee = conversion.json?.id;
    expect(
      typeof convertedEmployee === "number",
      "candidate-history-tenant-scope: conversion did not return an employee id",
    );

    const completeHistory = (
      await pool.query(
        `SELECT h.tenant_id, h.candidate_id, c.tenant_id AS candidate_tenant_id,
                h.to_stage, h.changed_by
         FROM candidate_stage_history h
         JOIN candidates c ON c.id = h.candidate_id
         WHERE h.candidate_id = $1
         ORDER BY h.id`,
        [candidateA],
      )
    ).rows;
    expect(
      completeHistory.length === 4 &&
        completeHistory.every(
          (history) =>
            history.tenant_id === TENANT &&
            history.candidate_tenant_id === TENANT &&
            history.candidate_id === candidateA &&
            history.changed_by === "Admin",
        ) &&
        completeHistory[2].to_stage === "rejected" &&
        completeHistory[3].to_stage === "hired",
      "candidate-history-tenant-scope: conversion history must remain with its candidate tenant",
    );
  } finally {
    const candidateIds = [candidateA, candidateB].filter(Boolean);
    if (candidateIds.length) {
      await pool
        .query("DELETE FROM candidate_stage_history WHERE candidate_id = ANY($1)", [candidateIds])
        .catch(() => {});
      const remaining = await pool
        .query(
          "SELECT COUNT(*)::int AS count FROM candidate_stage_history WHERE candidate_id = ANY($1)",
          [candidateIds],
        )
        .catch(() => ({ rows: [{ count: 1 }] }));
      expect(
        Number(remaining.rows[0]?.count ?? 1) === 0,
        "candidate-history-tenant-scope: test candidate history cleanup failed",
      );
      await pool.query("DELETE FROM candidates WHERE id = ANY($1)", [candidateIds]).catch(() => {});
    }
    if (convertedEmployee) {
      await pool.query("DELETE FROM employees WHERE id=$1", [convertedEmployee]).catch(() => {});
    }
    const sentinel = unrelatedHistory
      ? await pool
          .query(
            `SELECT COUNT(*)::int AS count
             FROM candidate_stage_history
             WHERE id=$1 AND tenant_id=$2 AND candidate_id=$3`,
            [unrelatedHistory, unrelatedTenant?.id, unrelatedCandidate],
          )
          .catch(() => ({ rows: [{ count: 0 }] }))
      : { rows: [{ count: 0 }] };
    expect(
      Number(sentinel.rows[0]?.count ?? 0) === 1,
      "candidate-history-tenant-scope: cleanup must preserve unrelated tenant history",
    );
    if (unrelatedCandidate) {
      await pool.query("DELETE FROM candidates WHERE id=$1", [unrelatedCandidate]).catch(() => {});
    }
    const tenantIds = [tenantB?.id, unrelatedTenant?.id].filter(Boolean);
    if (tenantIds.length) {
      await pool.query("DELETE FROM tenants WHERE id = ANY($1)", [tenantIds]).catch(() => {});
    }
    await destroyUser(u);
  }
}

async function scenarioEmployeeLeaveOwnership() {
  const u = await makeUser("leaveowner");
  const createdReqIds = [];
  let otherReq;
  try {
    await bootstrap(u);
    await forceRole(u, "employee", 3);

    // OWN: create + cancel a still-pending request.
    const own = await authed(u, "POST", "/api/leave/employees/3/requests", {
      body: { leaveType: "annual", startDate: "2031-03-03", endDate: "2031-03-05", reason: "own" },
    });
    expectStatus(own.status, 201, "leave-ownership POST own request");
    const ownId = own.json?.id;
    expect(typeof ownId === "number", "leave-ownership: own request returned no id");
    createdReqIds.push(ownId);
    expectStatus(
      (await authed(u, "PATCH", `/api/leave-requests/${ownId}`, { body: { status: "cancelled" } })).status,
      200,
      "leave-ownership cancel own pending request",
    );

    // OWN: cancelling a non-pending request is rejected.
    const approved = await authed(u, "POST", "/api/leave/employees/3/requests", {
      body: { leaveType: "annual", startDate: "2031-04-07", endDate: "2031-04-09", reason: "appr" },
    });
    expectStatus(approved.status, 201, "leave-ownership POST second own request");
    const approvedId = approved.json?.id;
    expect(typeof approvedId === "number", "leave-ownership: second own request returned no id");
    createdReqIds.push(approvedId);
    await pool.query("UPDATE leave_requests SET status='approved' WHERE id=$1", [approvedId]);
    expectStatus(
      (await authed(u, "PATCH", `/api/leave-requests/${approvedId}`, { body: { status: "cancelled" } })).status,
      403,
      "leave-ownership cancel own already-approved request",
    );

    // ANOTHER employee's request: fully blocked.
    otherReq = await seedLeaveRequest(1);
    expectStatus(
      (await authed(u, "PATCH", `/api/leave-requests/${otherReq}`, { body: { status: "cancelled" } })).status,
      403,
      "leave-ownership cancel colleague's request",
    );
    expectStatus(
      (await authed(u, "GET", "/api/leave/employees/1/requests")).status,
      403,
      "leave-ownership read colleague's requests",
    );
    expectStatus(
      (await authed(u, "POST", "/api/leave/employees/1/requests", { body: { leaveType: "annual", startDate: "2031-06-06", endDate: "2031-06-08", reason: "should-fail" } })).status,
      403,
      "leave-ownership create leave for colleague",
    );
  } finally {
    const allReqs = [...createdReqIds, otherReq].filter(Boolean);
    if (allReqs.length) {
      await pool.query("DELETE FROM leave_requests WHERE id = ANY($1)", [allReqs]).catch(() => {});
    }
    // Cancelling the own pending request recalculated entitlements for emp 3 /
    // year 2031 — remove that test-only row.
    await pool.query("DELETE FROM leave_entitlements WHERE employee_id=3 AND year=2031").catch(() => {});
    await destroyUser(u);
  }
}

async function scenarioEmployeeManagerOnlyBlocked() {
  const run = rand();
  const u = await makeUser("empblock");
  let emp, job, cand;
  try {
    await bootstrap(u);
    emp = await seedEmployee({ number: `EMP-${run}`, first: "Eli", last: "Employee", mail: `eli-${run}@amigatest.com` });
    await seedSickness(emp);
    job = await seedJob(`Some Role ${run}`, null);
    cand = await seedCandidate(job, `cody-${run}@amigatest.com`);
    await forceRole(u, "employee", emp);

    const paths = [
      "/api/sickness",
      `/api/sickness/employees/${emp}`,
      "/api/candidates",
      `/api/candidates/${cand}`,
    ];
    for (const p of paths) {
      expectStatus((await authed(u, "GET", p)).status, 403, `employee-blocked GET ${p}`);
    }
  } finally {
    if (emp) {
      await pool.query("DELETE FROM sickness_absences WHERE employee_id=$1", [emp]).catch(() => {});
    }
    if (cand) await pool.query("DELETE FROM candidates WHERE id=$1", [cand]).catch(() => {});
    if (job) await pool.query("DELETE FROM jobs WHERE id=$1", [job]).catch(() => {});
    if (emp) await pool.query("DELETE FROM employees WHERE id=$1", [emp]).catch(() => {});
    await destroyUser(u);
  }
}

async function scenarioAdminLeaveDecision() {
  const run = rand();
  const u = await makeUser("adminleave");
  let emp;
  try {
    await bootstrap(u);
    emp = await seedEmployee({ number: `ALD-${run}`, first: "Della", last: "Decide", mail: `della-${run}@amigatest.com`, jobTitle: "Underwriter", department: "Underwriting" });
    await forceRole(u, "admin", null);

    const usedAnnual2032 = async () => {
      const r = await authed(u, "GET", `/api/leave/employees/${emp}/entitlements?year=2032`);
      expectStatus(r.status, 200, "admin-leave-decision GET entitlements");
      const rows = Array.isArray(r.json) ? r.json : [];
      const a = rows.find((x) => x.leaveType === "annual");
      return a ? a.usedDays : 0;
    };

    // APPROVE path: usedDays increases by the request's working days.
    const req1 = await authed(u, "POST", `/api/leave/employees/${emp}/requests`, {
      body: { leaveType: "annual", startDate: "2032-03-01", endDate: "2032-03-05", reason: "approve-path" },
    });
    expectStatus(req1.status, 201, "admin-leave-decision POST request 1");
    const req1Id = req1.json?.id;
    const req1Days = req1.json?.workingDays;
    expect(typeof req1Id === "number" && typeof req1Days === "number" && req1Days > 0, "admin-leave-decision: request 1 missing id/workingDays");
    const usedBefore = await usedAnnual2032();
    expectStatus(
      (await authed(u, "PATCH", `/api/leave-requests/${req1Id}`, { body: { status: "approved" } })).status,
      200,
      "admin-leave-decision approve request 1",
    );
    const usedAfter = await usedAnnual2032();
    expect(
      usedAfter === usedBefore + req1Days,
      `admin-leave-decision: usedDays after approve expected ${usedBefore + req1Days}, got ${usedAfter}`,
    );

    // DECLINE path: 200 with no usage change.
    const req2 = await authed(u, "POST", `/api/leave/employees/${emp}/requests`, {
      body: { leaveType: "annual", startDate: "2032-03-15", endDate: "2032-03-19", reason: "decline-path" },
    });
    expectStatus(req2.status, 201, "admin-leave-decision POST request 2");
    const req2Id = req2.json?.id;
    expect(typeof req2Id === "number", "admin-leave-decision: request 2 missing id");
    expectStatus(
      (await authed(u, "PATCH", `/api/leave-requests/${req2Id}`, { body: { status: "declined" } })).status,
      200,
      "admin-leave-decision decline request 2",
    );
    const usedFinal = await usedAnnual2032();
    expect(
      usedFinal === usedAfter,
      `admin-leave-decision: usedDays after decline expected unchanged (${usedAfter}), got ${usedFinal}`,
    );
  } finally {
    if (emp) {
      await pool.query("DELETE FROM leave_requests WHERE employee_id=$1", [emp]).catch(() => {});
      await pool.query("DELETE FROM leave_entitlements WHERE employee_id=$1", [emp]).catch(() => {});
      await pool.query("DELETE FROM employees WHERE id=$1", [emp]).catch(() => {});
    }
    await destroyUser(u);
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
const SCENARIOS = [
  ["role-matrix:admin", scenarioRoleMatrixAdmin],
  ["role-matrix:manager", scenarioRoleMatrixManager],
  ["role-matrix:employee", scenarioRoleMatrixEmployee],
  ["role-matrix:unlinked", scenarioRoleMatrixUnlinked],
  ["signed-out-visitor", scenarioSignedOut],
  ["public-jobs-tenant-scope", scenarioPublicJobsTenantScope],
  ["public-applications-tenant-scope", scenarioPublicApplicationsTenantScope],
  ["public-application-rate-limit-tenant-scope", scenarioPublicApplicationRateLimitTenantScope],
  ["manager-leave-scope", scenarioManagerLeaveScope],
  ["manager-sickpay-scope", scenarioManagerSickPayScope],
  ["manager-candidate-scope", scenarioManagerCandidateScope],
  ["candidate-history-tenant-scope", scenarioCandidateHistoryTenantScope],
  ["candidate-detail-tenant-scope", scenarioCandidateDetailTenantScope],
  ["candidate-history-writers-tenant-scope", scenarioCandidateHistoryWritersTenantScope],
  ["employee-leave-ownership", scenarioEmployeeLeaveOwnership],
  ["employee-manager-only-blocked", scenarioEmployeeManagerOnlyBlocked],
  ["admin-leave-decision", scenarioAdminLeaveDecision],
];

async function globalSweep() {
  // Best-effort: remove any throwaway Clerk users this run created but could
  // not delete inline, and any orphaned app_users rows for them.
  for (const id of createdClerkUserIds) {
    await pool.query("DELETE FROM app_users WHERE clerk_user_id=$1", [id]).catch(() => {});
    await clerk(`/users/${id}`, { method: "DELETE" }).catch(() => {});
  }
}

async function main() {
  preflight();

  // Fail fast if the API is not reachable.
  try {
    const h = await api("GET", "/api/healthz");
    if (h.status !== 200) {
      console.error(`[rbac] API not healthy at ${BASE}/api/healthz (status ${h.status}). Is the API Server workflow running?`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[rbac] Cannot reach API at ${BASE}: ${err.message}`);
    process.exit(1);
  }

  const results = [];
  for (const [name, fn] of SCENARIOS) {
    const started = Date.now();
    try {
      await fn();
      results.push({ name, status: "success", ms: Date.now() - started });
      console.log(`PASS  ${name}  (${Date.now() - started}ms)`);
    } catch (err) {
      results.push({ name, status: "failure", ms: Date.now() - started, error: err.message });
      console.error(`FAIL  ${name}  (${Date.now() - started}ms)\n      ${err.message}`);
    }
  }

  await globalSweep().catch(() => {});
  await pool.end().catch(() => {});

  const failures = results.filter((r) => r.status !== "success");
  console.log(
    `\n[rbac] ${results.length - failures.length}/${results.length} scenarios passed.`,
  );
  if (failures.length) {
    console.error(
      `[rbac] FAILED scenarios: ${failures.map((f) => f.name).join(", ")}`,
    );
    process.exit(1);
  }
  console.log("[rbac] All RBAC access-control scenarios passed.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error(`[rbac] Unexpected runner error: ${err?.stack || err}`);
  await globalSweep().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
