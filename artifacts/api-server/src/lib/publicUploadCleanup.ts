import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, lte, notExists, or } from "drizzle-orm";
import {
  db,
  candidateDocumentsTable,
  publicApplicationUploadsTable,
  publicUploadCleanupLeasesTable,
  publicUploadCleanupFailureStatesTable,
  tenantsTable,
} from "@workspace/db";
import { logger } from "./logger.ts";
import { ObjectStorageService } from "./objectStorage.ts";
import {
  cleanupExpiredPublicUploads,
  createPublicUploadCleanupRunner,
  createPublicUploadCleanupFailureTracker,
  PUBLIC_UPLOAD_CLEANUP_FAILURE_ALERT_THRESHOLD,
  PUBLIC_UPLOAD_CLEANUP_FAILURE_WINDOW_MS,
  PUBLIC_UPLOAD_CLEANUP_TENANT_LEASE_MS,
  type PublicUploadCleanupCandidate,
  type PublicUploadCleanupFailureStore,
  type PublicUploadCleanupHealth,
  type PublicUploadCleanupResult,
  type PublicUploadCleanupStore,
} from "./publicUploadCleanupCore.ts";
export const PUBLIC_UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000;
export { cleanupExpiredPublicUploads };
export type {
  PublicUploadCleanupCandidate,
  PublicUploadCleanupHealth,
  PublicUploadCleanupStore,
} from "./publicUploadCleanupCore.ts";

const databaseCleanupStore: PublicUploadCleanupStore = {
  async listExpiredUnclaimed({
    tenantId,
    expiresBefore,
    staleLeaseBefore,
    limit,
  }) {
    return db
      .select({
        id: publicApplicationUploadsTable.id,
        objectPath: publicApplicationUploadsTable.objectPath,
        expiresAt: publicApplicationUploadsTable.expiresAt,
        claimedAt: publicApplicationUploadsTable.claimedAt,
        cleanupStartedAt: publicApplicationUploadsTable.cleanupStartedAt,
      })
      .from(publicApplicationUploadsTable)
      .where(
        and(
          eq(publicApplicationUploadsTable.tenantId, tenantId),
          isNull(publicApplicationUploadsTable.claimedAt),
          lt(publicApplicationUploadsTable.expiresAt, expiresBefore),
          notExists(
            db
              .select({ id: candidateDocumentsTable.id })
              .from(candidateDocumentsTable)
              .where(
                and(
                  eq(
                    candidateDocumentsTable.tenantId,
                    publicApplicationUploadsTable.tenantId,
                  ),
                  eq(
                    candidateDocumentsTable.objectPath,
                    publicApplicationUploadsTable.objectPath,
                  ),
                ),
              ),
          ),
          or(
            isNull(publicApplicationUploadsTable.cleanupStartedAt),
            lt(publicApplicationUploadsTable.cleanupStartedAt, staleLeaseBefore),
          ),
        ),
      )
      .orderBy(publicApplicationUploadsTable.expiresAt)
      .limit(limit);
  },

  async markCleanupStarted({
    tenantId,
    id,
    startedAt,
    staleLeaseBefore,
  }) {
    const rows = await db
      .update(publicApplicationUploadsTable)
      .set({ cleanupStartedAt: startedAt })
      .where(
        and(
          eq(publicApplicationUploadsTable.tenantId, tenantId),
          eq(publicApplicationUploadsTable.id, id),
          isNull(publicApplicationUploadsTable.claimedAt),
          notExists(
            db
              .select({ id: candidateDocumentsTable.id })
              .from(candidateDocumentsTable)
              .where(
                and(
                  eq(
                    candidateDocumentsTable.tenantId,
                    publicApplicationUploadsTable.tenantId,
                  ),
                  eq(
                    candidateDocumentsTable.objectPath,
                    publicApplicationUploadsTable.objectPath,
                  ),
                ),
              ),
          ),
          or(
            isNull(publicApplicationUploadsTable.cleanupStartedAt),
            lt(publicApplicationUploadsTable.cleanupStartedAt, staleLeaseBefore),
          ),
        ),
      )
      .returning({ id: publicApplicationUploadsTable.id });
    return rows.length > 0;
  },

  async deleteCleanupClaim({ tenantId, id, startedAt }) {
    const rows = await db
      .delete(publicApplicationUploadsTable)
      .where(
        and(
          eq(publicApplicationUploadsTable.tenantId, tenantId),
          eq(publicApplicationUploadsTable.id, id),
          isNull(publicApplicationUploadsTable.claimedAt),
          eq(publicApplicationUploadsTable.cleanupStartedAt, startedAt),
        ),
      )
      .returning({ id: publicApplicationUploadsTable.id });
    return rows.length > 0;
  },

  async releaseCleanupClaim({ tenantId, id, startedAt }) {
    await db
      .update(publicApplicationUploadsTable)
      .set({ cleanupStartedAt: null })
      .where(
        and(
          eq(publicApplicationUploadsTable.tenantId, tenantId),
          eq(publicApplicationUploadsTable.id, id),
          eq(publicApplicationUploadsTable.cleanupStartedAt, startedAt),
        ),
      );
  },
};

export async function runPublicUploadCleanup({
  tenantId,
  now,
  limit,
  storage = new ObjectStorageService(),
}: {
  tenantId: string;
  now?: Date;
  limit?: number;
  storage?: Pick<ObjectStorageService, "deleteObjectEntity">;
}) {
  return cleanupExpiredPublicUploads({
    tenantId,
    now,
    limit,
    storage,
    store: databaseCleanupStore,
  });
}

async function listActiveTenantIds(): Promise<string[]> {
  const rows = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));
  return rows.map((row) => row.id);
}

const scheduledCleanupOwnerId = randomUUID();
const scheduledObjectStorageService = new ObjectStorageService();

const cleanupFailureStateStore: PublicUploadCleanupFailureStore = {
  async load(tenantId) {
    const [row] = await db
      .select({
        failureTimestamps:
          publicUploadCleanupFailureStatesTable.failureTimestamps,
        alertActive: publicUploadCleanupFailureStatesTable.alertActive,
      })
      .from(publicUploadCleanupFailureStatesTable)
      .where(eq(publicUploadCleanupFailureStatesTable.tenantId, tenantId));
    if (!row) return null;

    return {
      timestamps: row.failureTimestamps
        .map((timestamp) => Date.parse(timestamp))
        .filter((timestamp) => Number.isFinite(timestamp)),
      alertActive: row.alertActive,
    };
  },

  async save(tenantId, state) {
    const failureTimestamps = state.timestamps.map((timestamp) =>
      new Date(timestamp).toISOString(),
    );
    await db
      .insert(publicUploadCleanupFailureStatesTable)
      .values({
        tenantId,
        failureTimestamps,
        alertActive: state.alertActive,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: publicUploadCleanupFailureStatesTable.tenantId,
        set: {
          failureTimestamps,
          alertActive: state.alertActive,
          updatedAt: new Date(),
        },
      });
  },

  async clear(tenantId) {
    await db
      .delete(publicUploadCleanupFailureStatesTable)
      .where(eq(publicUploadCleanupFailureStatesTable.tenantId, tenantId));
  },
};

export function createDatabasePublicUploadCleanupRunner({
  storage = new ObjectStorageService(),
  now,
  listActiveTenantIds: listActiveTenantIdsOverride = listActiveTenantIds,
  onTenantResult,
  onTenantFailure,
}: {
  storage?: Pick<ObjectStorageService, "deleteObjectEntity">;
  now?: Date;
  listActiveTenantIds?: () => Promise<string[]>;
  onTenantResult?: (
    tenantId: string,
    result: PublicUploadCleanupResult,
  ) => void | Promise<void>;
  onTenantFailure?: (tenantId: string, error: unknown) => void | Promise<void>;
} = {}) {
  return createPublicUploadCleanupRunner({
    listActiveTenantIds: listActiveTenantIdsOverride,
    cleanupTenant: (tenantId) =>
      runPublicUploadCleanup({
        tenantId,
        now,
        storage,
      }),
    onTenantResult,
    onTenantFailure:
      onTenantFailure ??
      ((tenantId, error) => {
        logger.error(
          { err: error, tenantId },
          "Scheduled public upload cleanup failed for tenant",
        );
      }),
  });
}
function configuredCleanupFailureAlertThreshold(): number {
  const configured = Number(
    process.env.PUBLIC_UPLOAD_CLEANUP_ALERT_THRESHOLD,
  );
  return Number.isInteger(configured) && configured > 0
    ? configured
    : PUBLIC_UPLOAD_CLEANUP_FAILURE_ALERT_THRESHOLD;
}

function configuredCleanupFailureAlertWindowMs(): number {
  const configured = Number(
    process.env.PUBLIC_UPLOAD_CLEANUP_ALERT_WINDOW_MS,
  );
  return Number.isFinite(configured) && configured > 0
    ? configured
    : PUBLIC_UPLOAD_CLEANUP_FAILURE_WINDOW_MS;
}

const cleanupFailureTracker = createPublicUploadCleanupFailureTracker({
  threshold: configuredCleanupFailureAlertThreshold(),
  windowMs: configuredCleanupFailureAlertWindowMs(),
  store: cleanupFailureStateStore,
  onAlert: ({ tenantId, failureCount, windowMs, failedUploads }) => {
    logger.warn(
      {
        tenantId,
        failureCount,
        windowMs,
        ...(failedUploads === undefined ? {} : { failedUploads }),
      },
      "Repeated public upload cleanup failures for tenant; investigate storage or database health",
    );
  },
  onRecovery: ({ tenantId }) => {
    logger.info(
      { tenantId },
      "Public upload cleanup recovered for tenant; failure alert resolved",
    );
  },
});

export function getPublicUploadCleanupHealth(
  tenantId?: string,
): PublicUploadCleanupHealth[] {
  const health = cleanupFailureTracker.getHealth();
  return tenantId ? health.filter((entry) => entry.tenantId === tenantId) : health;
}
const runScheduledCleanup = createPublicUploadCleanupRunner({
  listActiveTenantIds,
  acquireTenantLease: acquireScheduledTenantLease,
  releaseTenantLease: releaseScheduledTenantLease,
  cleanupTenant: (tenantId) =>
    runPublicUploadCleanup({
      tenantId,
      storage: scheduledObjectStorageService,
    }),
  onTenantResult: async (tenantId, result) => {
    if (result.failed > 0) {
      await cleanupFailureTracker.recordFailure(tenantId, {
        failedUploads: result.failed,
      });
    } else {
      await cleanupFailureTracker.recordSuccess(tenantId);
    }
  },
  onTenantFailure: async (tenantId, error) => {
    await cleanupFailureTracker.recordFailure(tenantId);
    logger.error(
      {
        tenantId,
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "Scheduled public upload cleanup failed for tenant",
    );
  },
  onTenantLeaseContended: (tenantId) => {
    logger.info(
      { tenantId },
      "Scheduled public upload cleanup skipped tenant because its lease is held",
    );
  },
});

export async function runPublicUploadCleanupForActiveTenants() {
  const summary = await runScheduledCleanup();
  logger.info(summary, "Scheduled public upload cleanup completed");
  return summary;
}

export const PUBLIC_UPLOAD_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

function configuredCleanupIntervalMs(): number {
  const configured = Number(process.env.PUBLIC_UPLOAD_CLEANUP_INTERVAL_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : PUBLIC_UPLOAD_CLEANUP_INTERVAL_MS;
}

export function startPublicUploadCleanupScheduler({
  intervalMs = configuredCleanupIntervalMs(),
  run = runPublicUploadCleanupForActiveTenants,
}: {
  intervalMs?: number;
  run?: () => Promise<unknown>;
} = {}) {
  const execute = () => {
    void run().catch((error) => {
      logger.error({ err: error }, "Scheduled public upload cleanup unavailable");
    });
  };

  // Run once when the server becomes ready, then continue on the managed
  // interval. Failed runs are logged and retried on the next tick.
  execute();
  const timer = setInterval(execute, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function acquireScheduledTenantLease(tenantId: string): Promise<boolean> {
  const acquiredAt = new Date();
  const expiresAt = new Date(
    acquiredAt.getTime() + PUBLIC_UPLOAD_CLEANUP_TENANT_LEASE_MS,
  );
  const rows = await db
    .insert(publicUploadCleanupLeasesTable)
    .values({
      tenantId,
      ownerId: scheduledCleanupOwnerId,
      acquiredAt,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: publicUploadCleanupLeasesTable.tenantId,
      set: {
        ownerId: scheduledCleanupOwnerId,
        acquiredAt,
        expiresAt,
      },
      where: lte(publicUploadCleanupLeasesTable.expiresAt, acquiredAt),
    })
    .returning({ tenantId: publicUploadCleanupLeasesTable.tenantId });
  return rows.length > 0;
}

async function releaseScheduledTenantLease(tenantId: string): Promise<void> {
  await db
    .delete(publicUploadCleanupLeasesTable)
    .where(
      and(
        eq(publicUploadCleanupLeasesTable.tenantId, tenantId),
        eq(publicUploadCleanupLeasesTable.ownerId, scheduledCleanupOwnerId),
      ),
    );
}
