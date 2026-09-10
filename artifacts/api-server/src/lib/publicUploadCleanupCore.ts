export const PUBLIC_UPLOAD_CLEANUP_BATCH_SIZE = 100;
const CLEANUP_LEASE_MS = 60 * 60 * 1000;

export const PUBLIC_UPLOAD_CLEANUP_TENANT_LEASE_MS = CLEANUP_LEASE_MS;
export type PublicUploadCleanupCandidate = {
  id: number;
  objectPath: string;
  expiresAt: Date;
  claimedAt: Date | null;
  cleanupStartedAt: Date | null;
};

export type PublicUploadCleanupStore = {
  listExpiredUnclaimed(args: {
    tenantId: string;
    expiresBefore: Date;
    staleLeaseBefore: Date;
    limit: number;
  }): Promise<PublicUploadCleanupCandidate[]>;
  markCleanupStarted(args: {
    tenantId: string;
    id: number;
    startedAt: Date;
    staleLeaseBefore: Date;
  }): Promise<boolean>;
  deleteCleanupClaim(args: {
    tenantId: string;
    id: number;
    startedAt: Date;
  }): Promise<boolean>;
  releaseCleanupClaim(args: {
    tenantId: string;
    id: number;
    startedAt: Date;
  }): Promise<void>;
};

export type PublicUploadCleanupResult = {
  inspected: number;
  deleted: number;
  failed: number;
};

export type PublicUploadCleanupBatchResult = {
  tenantCount: number;
  completedTenants: number;
  failedTenants: number;
  skippedTenants: number;
  inspected: number;
  deleted: number;
  failed: number;
};

type TenantLeaseCallback = (tenantId: string) => Promise<boolean>;

export const PUBLIC_UPLOAD_CLEANUP_FAILURE_ALERT_THRESHOLD = 3;
export const PUBLIC_UPLOAD_CLEANUP_FAILURE_WINDOW_MS = 60 * 60 * 1000;

export type PublicUploadCleanupFailureAlert = {
  tenantId: string;
  failureCount: number;
  windowMs: number;
  failedUploads?: number;
};

export type PublicUploadCleanupRecovery = {
  tenantId: string;
};

export type PublicUploadCleanupHealthStatus = "active" | "recovered";

export type PublicUploadCleanupFailureState = {
  timestamps: number[];
  alertActive: boolean;
};

export type PublicUploadCleanupFailureStore = {
  load(tenantId: string): Promise<PublicUploadCleanupFailureState | null>;
  save(tenantId: string, state: PublicUploadCleanupFailureState): Promise<void>;
  clear(tenantId: string): Promise<void>;
};

type PublicUploadCleanupFailureTrackerState =
  PublicUploadCleanupFailureState & {
    failedUploadCounts: number[];
    lastFailureAt: number | null;
    lastAlertFailureCount: number;
    lastAlertFailedUploadCount: number;
    recoveredAt: number | null;
  };

/**
 * Tracks tenant cleanup failures without retaining upload details.
 *
 * A successful tenant run clears the bounded failure history and resolves any
 * active alert. A compact health summary is retained after recovery so an
 * operator can distinguish a recovered tenant from one with no observed
 * incident. Upload paths and other upload details are never retained.
 */
export function createPublicUploadCleanupFailureTracker({
  threshold = PUBLIC_UPLOAD_CLEANUP_FAILURE_ALERT_THRESHOLD,
  windowMs = PUBLIC_UPLOAD_CLEANUP_FAILURE_WINDOW_MS,
  now = () => new Date(),
  store,
  onAlert,
  onRecovery,
}: {
  threshold?: number;
  windowMs?: number;
  now?: () => Date;
  store?: PublicUploadCleanupFailureStore;
  onAlert?: (
    alert: PublicUploadCleanupFailureAlert,
  ) => void | Promise<void>;
  onRecovery?: (
    recovery: PublicUploadCleanupRecovery,
  ) => void | Promise<void>;
}) {
  const safeThreshold =
    Number.isInteger(threshold) && threshold > 0
      ? threshold
      : PUBLIC_UPLOAD_CLEANUP_FAILURE_ALERT_THRESHOLD;
  const safeWindowMs =
    Number.isFinite(windowMs) && windowMs > 0
      ? windowMs
      : PUBLIC_UPLOAD_CLEANUP_FAILURE_WINDOW_MS;
  const failuresByTenant = new Map<
    string,
    PublicUploadCleanupFailureTrackerState
  >();
  const operationsByTenant = new Map<string, Promise<void>>();

  function pruneExpiredFailures(
    state: PublicUploadCleanupFailureTrackerState,
    currentTime: number,
  ) {
    const windowStart = currentTime - safeWindowMs;
    const recentFailures = state.timestamps
      .map((timestamp, index) => ({
        timestamp,
        failedUploadCount: state.failedUploadCounts[index] ?? 0,
      }))
      .filter(({ timestamp }) => timestamp > windowStart);
    state.timestamps = recentFailures.map(({ timestamp }) => timestamp);
    state.failedUploadCounts = recentFailures.map(
      ({ failedUploadCount }) => failedUploadCount,
    );
    if (state.timestamps.length === 0) {
      state.alertActive = false;
    }
  }

  function createState(
    persistedState?: PublicUploadCleanupFailureState | null,
  ): PublicUploadCleanupFailureTrackerState {
    const timestamps = persistedState?.timestamps ?? [];
    return {
      timestamps: [...timestamps],
      failedUploadCounts: timestamps.map(() => 0),
      alertActive: persistedState?.alertActive ?? false,
      lastFailureAt:
        timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
      lastAlertFailureCount: timestamps.length,
      lastAlertFailedUploadCount: 0,
      recoveredAt: null,
    };
  }

  async function loadState(tenantId: string) {
    if (store) {
      const persistedState = await store.load(tenantId);
      const state = createState(persistedState);
      failuresByTenant.set(tenantId, state);
      return state;
    }

    return (
      failuresByTenant.get(tenantId) ??
      (() => {
        const state = createState();
        failuresByTenant.set(tenantId, state);
        return state;
      })()
    );
  }

  function serializeTenantOperation(
    tenantId: string,
    operation: () => Promise<void>,
  ) {
    const previous = operationsByTenant.get(tenantId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    operationsByTenant.set(tenantId, next);
    return next.finally(() => {
      if (operationsByTenant.get(tenantId) === next) {
        operationsByTenant.delete(tenantId);
      }
    });
  }

  return {
    recordFailure(
      tenantId: string,
      details: { failedUploads?: number } = {},
    ) {
      return serializeTenantOperation(tenantId, async () => {
        const currentTime = now().getTime();
        const state = await loadState(tenantId);
        pruneExpiredFailures(state, currentTime);
        const failedUploadCount =
          Number.isInteger(details.failedUploads) && details.failedUploads! > 0
            ? details.failedUploads!
            : 0;
        state.timestamps.push(currentTime);
        state.failedUploadCounts.push(failedUploadCount);
        state.lastFailureAt = currentTime;
        const shouldAlert =
          state.timestamps.length >= safeThreshold && !state.alertActive;
        if (shouldAlert) {
          state.alertActive = true;
          state.lastAlertFailureCount = state.timestamps.length;
          state.lastAlertFailedUploadCount = state.failedUploadCounts.reduce(
            (total, count) => total + count,
            0,
          );
        }

        if (store) {
          await store.save(tenantId, state);
        }
        if (shouldAlert) {
          await onAlert?.({
            tenantId,
            failureCount: state.timestamps.length,
            windowMs: safeWindowMs,
            ...(details.failedUploads === undefined
              ? {}
              : { failedUploads: details.failedUploads }),
          });
        }
      });
    },

    recordSuccess(tenantId: string) {
      return serializeTenantOperation(tenantId, async () => {
        const state = await loadState(tenantId);
        const recoveredAt = now().getTime();
        const wasActive = state.alertActive;
        state.timestamps = [];
        state.failedUploadCounts = [];
        state.alertActive = false;
        state.recoveredAt = wasActive ? recoveredAt : state.recoveredAt;
        if (store) {
          await store.clear(tenantId);
        }
        if (wasActive) {
          await onRecovery?.({ tenantId });
        } else if (!state.recoveredAt) {
          failuresByTenant.delete(tenantId);
        }
      });
    },

    getHealth(): PublicUploadCleanupHealth[] {
      const currentTime = now().getTime();
      const health: PublicUploadCleanupHealth[] = [];

      for (const [tenantId, state] of failuresByTenant) {
        pruneExpiredFailures(state, currentTime);
        if (state.alertActive) {
          health.push({
            tenantId,
            status: "active",
            failureCount: state.timestamps.length,
            failedUploadCount: state.failedUploadCounts.reduce(
              (total, count) => total + count,
              0,
            ),
            lastFailureAt: new Date(state.lastFailureAt ?? currentTime),
            recoveredAt: null,
          });
        } else if (state.recoveredAt && state.lastFailureAt) {
          health.push({
            tenantId,
            status: "recovered",
            failureCount: state.lastAlertFailureCount,
            failedUploadCount: state.lastAlertFailedUploadCount,
            lastFailureAt: new Date(state.lastFailureAt),
            recoveredAt: new Date(state.recoveredAt),
          });
        } else {
          failuresByTenant.delete(tenantId);
        }
      }

      return health;
    },
  };
}

/**
 * Creates the tenant-level orchestration used by scheduled maintenance.
 *
 * The active-tenant lookup is intentionally supplied by the caller so this
 * orchestration remains independent from the database adapter and can be
 * exercised without storage or database access. The running set is kept by
 * the returned runner, which means overlapping scheduler ticks skip only the
 * tenants already being processed while still allowing other tenants to run.
 */
export function createPublicUploadCleanupRunner({
  listActiveTenantIds,
  cleanupTenant,
  acquireTenantLease = async () => true,
  releaseTenantLease = async () => {},
  onTenantResult,
  onTenantFailure,
  onTenantLeaseContended,
}: {
  listActiveTenantIds: () => Promise<string[]>;
  cleanupTenant: (tenantId: string) => Promise<PublicUploadCleanupResult>;
  acquireTenantLease?: TenantLeaseCallback;
  releaseTenantLease?: TenantLeaseReleaseCallback;
  onTenantResult?: (
    tenantId: string,
    result: PublicUploadCleanupResult,
  ) => void | Promise<void>;
  onTenantFailure?: (tenantId: string, error: unknown) => void | Promise<void>;
  onTenantLeaseContended?: (tenantId: string) => void | Promise<void>;
}) {
  const runningTenantIds = new Set<string>();

  return async function run(): Promise<PublicUploadCleanupBatchResult> {
    const tenantIds = [...new Set(await listActiveTenantIds())];
    const summary: PublicUploadCleanupBatchResult = {
      tenantCount: tenantIds.length,
      completedTenants: 0,
      failedTenants: 0,
      skippedTenants: 0,
      inspected: 0,
      deleted: 0,
      failed: 0,
    };

    for (const tenantId of tenantIds) {
      if (runningTenantIds.has(tenantId)) {
        summary.skippedTenants++;
        continue;
      }

      runningTenantIds.add(tenantId);
      let leaseAcquired = false;
      try {
        leaseAcquired = await acquireTenantLease(tenantId);
        if (!leaseAcquired) {
          summary.skippedTenants++;
          try {
            await onTenantLeaseContended?.(tenantId);
          } catch {
            // Observability must not turn normal lease contention into a run
            // failure or prevent other tenants from being processed.
          }
          continue;
        }

        const result = await cleanupTenant(tenantId);
        summary.completedTenants++;
        summary.inspected += result.inspected;
        summary.deleted += result.deleted;
        summary.failed += result.failed;
        try {
          await onTenantResult?.(tenantId, result);
        } catch {
          // Observability must not prevent other tenants from being retried.
        }
      } catch (error) {
        summary.failedTenants++;
        try {
          await onTenantFailure?.(tenantId, error);
        } catch {
          // Observability must not prevent other tenants from being retried.
        }
      } finally {
        if (leaseAcquired) {
          try {
            await releaseTenantLease(tenantId);
          } catch (error) {
            try {
              await onTenantFailure?.(tenantId, error);
            } catch {
              // A release failure is observable but must not stop other
              // tenants from being retried.
            }
          }
        }
        runningTenantIds.delete(tenantId);
      }
    }

    return summary;
  };
}

export async function cleanupExpiredPublicUploads({
  tenantId,
  now = new Date(),
  limit = PUBLIC_UPLOAD_CLEANUP_BATCH_SIZE,
  storage,
  store,
}: {
  tenantId: string;
  now?: Date;
  limit?: number;
  storage: { deleteObjectEntity(objectPath: string): Promise<void> };
  store: PublicUploadCleanupStore;
}): Promise<PublicUploadCleanupResult> {
  const safeLimit = Math.max(
    1,
    Math.min(Math.floor(limit), PUBLIC_UPLOAD_CLEANUP_BATCH_SIZE),
  );
  const staleLeaseBefore = new Date(now.getTime() - CLEANUP_LEASE_MS);
  const candidates = await store.listExpiredUnclaimed({
    tenantId,
    expiresBefore: now,
    staleLeaseBefore,
    limit: safeLimit,
  });

  let deleted = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const startedAt = new Date();
    const claimed = await store.markCleanupStarted({
      tenantId,
      id: candidate.id,
      startedAt,
      staleLeaseBefore,
    });
    if (!claimed) continue;

    try {
      await storage.deleteObjectEntity(candidate.objectPath);
      if (
        await store.deleteCleanupClaim({
          tenantId,
          id: candidate.id,
          startedAt,
        })
      ) {
        deleted++;
      }
    } catch {
      failed++;
      await store.releaseCleanupClaim({
        tenantId,
        id: candidate.id,
        startedAt,
      });
    }
  }

  return { inspected: candidates.length, deleted, failed };
}

type TenantLeaseReleaseCallback = (tenantId: string) => Promise<void>;

export type PublicUploadCleanupHealth = {
  tenantId: string;
  status: PublicUploadCleanupHealthStatus;
  failureCount: number;
  failedUploadCount: number;
  lastFailureAt: Date;
  recoveredAt: Date | null;
};
