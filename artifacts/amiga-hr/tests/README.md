# Amiga Specialty HR RBAC checks

The RBAC checks have two complementary entry points:

## Server-side access validation

Run the deterministic, browserless API matrix from a shell:

```bash
pnpm --filter @workspace/amiga-hr run test:rbac
```

This requires `CLERK_SECRET_KEY` and `DATABASE_URL`, and the API Server workflow
must be running. It checks authentication status, authorization status, and
data scoping on the protected `/api` routes.

## Browser role and sidebar validation

The frontend checks run through Replit's browser testing harness because the
test needs real Clerk sessions and browser navigation. Run the four role
scenarios from the code-execution sandbox with the testing skill:

```js
import {
  buildRoleMatrixPlans,
  RBAC_TECH_DOC,
} from "../../artifacts/amiga-hr/tests/rbac-role-matrix";

for (const { role, plan } of buildRoleMatrixPlans()) {
  const result = await runTest({
    testPlan: plan,
    relevantTechnicalDocumentation: RBAC_TECH_DOC,
    testClerkAuth: true,
  });
  console.log(`${role}: ${result.status}`);
}
```

Run the scenarios in the returned order. The admin scenario bootstraps the
tenant's first test user as an admin; each later scenario then sets its own
role and employee link in the database. The browser scenarios verify:

- admin, manager, employee, and unlinked-user home redirects;
- allowed and forbidden frontend routes; and
- the sidebar links visible to each linked role, including admin-only links
  hidden from managers and employees.

Replay the responsive role-menu checks separately after the four role
scenarios. This replay creates a 390x844 mobile context for both a manager and
an employee, opens the mobile navigation Sheet, and checks the same allowed and
forbidden links as the desktop matrix:

```js
import { buildMobileRoleMenuPlan, RBAC_TECH_DOC } from
  "../../artifacts/amiga-hr/tests/rbac-role-matrix";

const mobile = buildMobileRoleMenuPlan();
const result = await runTest({
  testPlan: mobile.plan,
  relevantTechnicalDocumentation: RBAC_TECH_DOC,
  testClerkAuth: true,
});
console.log(`mobile role menu: ${result.status}`);
```

The browser pass is intentionally separate from `test:rbac`: the shell runner
can validate API responses, but it cannot create browser contexts or exercise
the frontend route and sidebar gates.


## Replay the signed-out visitor journey and shared job link

The signed-out scenario uses a fresh browser context and deliberately has no
`[Clerk Auth]` or employee-role setup. It seeds one uniquely named live job,
opens `/apply?job=<public-job-id>`, and verifies that the application form
preselects and displays that exact role. It then cleans up the seeded job. The
scenario remains independent of employee role fixtures.

Run it from the code-execution sandbox with the testing skill:

```js
import {
  buildSignedOutVisitorPlan,
  SIGNED_OUT_TECH_DOC,
} from "../../artifacts/amiga-hr/tests/rbac-role-matrix";

const { plan } = buildSignedOutVisitorPlan();
const result = await runTest({
  testPlan: plan,
  relevantTechnicalDocumentation: SIGNED_OUT_TECH_DOC,
  testClerkAuth: true,
});
console.log(`signed-out visitor: ${result.status}`);
```

Because this scenario does not sign in or seed employee role data, it can run
independently of the admin, manager, employee, and unlinked-user scenarios.

The same signed-out visitor replay also covers the public application form's
role-list states. It intercepts `GET /api/public/jobs` to return `200 []` and
checks the explicit "no open roles" message, then returns `503` and checks the
retry action plus the general-application fallback. It removes the
interception, retries, and confirms the seeded role is available again. A
failed shared-link load must not leave an unverified job id selected or
submitted, and no Clerk session is created during any of these checks.

## Replay the signed-out application submission

The submission scenario uses a fresh browser context with no Clerk sign-in,
fills the minimum public form fields, submits a general application, confirms
the success state, verifies that `/api/me` is still unauthenticated, and
checks the resulting candidate plus stage-history rows before cleaning them up.

```js
import {
  buildSignedOutApplicationPlan,
  SIGNED_OUT_APPLICATION_TECH_DOC,
} from "../../artifacts/amiga-hr/tests/rbac-role-matrix";

const application = buildSignedOutApplicationPlan();
const result = await runTest({
  testPlan: application.plan,
  relevantTechnicalDocumentation: SIGNED_OUT_APPLICATION_TECH_DOC,
  testClerkAuth: true,
});
console.log(`signed-out application: ${result.status}`);
```

The scenario seeds no jobs or users. Its applicant email is unique per replay,
and its candidate/stage-history rows are deleted in the final database step.
