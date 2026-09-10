import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * A database handle that can run `.execute(sql\`...\`)` — either the pooled `db`
 * or a transaction handle (`tx`) passed in by a caller already inside a
 * transaction. The allocator must run inside the SAME transaction as the
 * subsequent INSERT so the advisory lock is held until commit.
 */
type Executor = Pick<typeof db, "execute">;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Allocate the next per-tenant AMG#### employee number.
 *
 * Numbering is PER TENANT: tenant A and tenant B can both have AMG0001. The
 * MAX(...) is scoped by `tenant_id = $1`, and the sequence gap is closed by an
 * advisory transaction lock keyed on the tenant — `pg_advisory_xact_lock` over
 * `hashtextextended(tenant_id::text, 0)`. Two concurrent inserts for the SAME
 * tenant serialise on that lock; inserts for DIFFERENT tenants do not block each
 * other. This replaces the old whole-table `LOCK TABLE employees` (which
 * serialised every tenant against every other) with per-tenant contention only.
 *
 * The lock is `xact` scoped, so it is released automatically when the
 * surrounding transaction commits or rolls back — the caller MUST invoke this
 * inside a transaction and perform the INSERT in that same transaction.
 *
 * @param tx       a transaction handle (must be inside an open transaction)
 * @param tenantId the tenant to allocate within; validated as a UUID
 */
export async function nextEmployeeNumberForTenant(
  tx: Executor,
  tenantId: string,
): Promise<string> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error(
      `nextEmployeeNumberForTenant: invalid tenant id (expected UUID): ${tenantId}`,
    );
  }
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}::text, 0))`,
  );
  const result = await tx.execute(
    sql`SELECT COALESCE(MAX(CAST(SUBSTRING(employee_number FROM 4) AS INTEGER)), 0) AS max_num
        FROM employees
        WHERE tenant_id = ${tenantId} AND employee_number ~ '^AMG[0-9]+$'`,
  );
  const rows = (result as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
  const row = rows[0] as { max_num: number | string } | undefined;
  const next = (row ? Number(row.max_num) : 0) + 1;
  return `AMG${String(next).padStart(4, "0")}`;
}
