import { sql } from "drizzle-orm";
import { db } from "./index.ts";
import { DEFAULT_TENANT_ID } from "./constants.ts";

export { DEFAULT_TENANT_ID };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TransactionFn<T> = Parameters<typeof db.transaction<T>>[0];
type Tx = Parameters<TransactionFn<unknown>>[0];

/**
 * Run `fn` inside a transaction that has `app.current_tenant` bound to
 * `tenantId` for its entire lifetime.
 *
 * This is the access pattern every route handler will adopt in Phase B/C. The
 * Row-Level Security policies added in Phase C read `app.current_tenant`, so a
 * query that forgets its `WHERE tenant_id` is still constrained by the GUC.
 *
 * `SET LOCAL` (not `SET`) scopes the setting to the surrounding transaction and
 * resets it on commit/rollback. Combined with running inside an explicit
 * transaction, this is safe regardless of connection-pooler mode — a pooled
 * connection can never leak one request's tenant into the next. A bare `SET`
 * would persist on the pooled connection and leak across tenants.
 *
 * The tenant id is validated as a UUID and bound as a parameter, so it can
 * never be used for SQL injection via the `SET LOCAL` statement.
 *
 * Not yet wired into any route — shipped in Phase A so Phase B can adopt it.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error(`withTenant: invalid tenant id (expected UUID): ${tenantId}`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
    return fn(tx);
  });
}
