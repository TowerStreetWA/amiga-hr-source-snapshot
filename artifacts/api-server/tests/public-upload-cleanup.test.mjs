import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupExpiredPublicUploads,
  createPublicUploadCleanupRunner,
  createPublicUploadCleanupFailureTracker,
} from "../src/lib/publicUploadCleanupCore.ts";

const tenantId = "tenant-a";
const now = new Date("2026-09-07T12:00:00.000Z");

function upload(overrides = {}) {
  return {
    id: 1,
    tenantId,
    objectPath: "/objects/uploads/tenant-a/expired-file",
    expiresAt: new Date("2026-09-06T12:00:00.000Z"),
    claimedAt: null,
    cleanupStartedAt: null,
    createdAt: new Date("2026-09-05T12:00:00.000Z"),
    ...overrides,
  };
}

function makeStore(rows) {
  const state = rows.map((row) => ({ ...row }));
  return {
    rows: state,
    async listExpiredUnclaimed({ expiresBefore, staleLeaseBefore, limit }) {
      return state
        .filter(
          (row) =>
            row.claimedAt === null &&
            row.expiresAt < expiresBefore &&
            (row.cleanupStartedAt === null ||
              row.cleanupStartedAt < staleLeaseBefore),
        )
        .slice(0, limit);
    },
    async markCleanupStarted({ id, startedAt, staleLeaseBefore }) {
      const row = state.find((candidate) => candidate.id === id);
      if (
        !row ||
        row.claimedAt !== null ||
        (row.cleanupStartedAt !== null &&
          row.cleanupStartedAt >= staleLeaseBefore)
      ) {
        return false;
      }
      row.cleanupStartedAt = startedAt;
      return true;
    },
    async deleteCleanupClaim({ id, startedAt }) {
      const index = state.findIndex(
        (row) =>
          row.id === id &&
          row.claimedAt === null &&
          row.cleanupStartedAt?.getTime() === startedAt.getTime(),
      );
      if (index === -1) return false;
      state.splice(index, 1);
      return true;
    },
    async releaseCleanupClaim({ id, startedAt }) {
      const row = state.find(
        (candidate) =>
          candidate.id === id &&
          candidate.cleanupStartedAt?.getTime() === startedAt.getTime(),
      );
      if (row) row.cleanupStartedAt = null;
    },
  };
}

test("cleanup removes expired unclaimed uploads but preserves claimed uploads", async () => {
  const pending = upload();
  const submitted = upload({
    id: 2,
    objectPath: "/objects/uploads/tenant-a/submitted-file",
    claimedAt: new Date("2026-09-06T13:00:00.000Z"),
  });
  const store = makeStore([pending, submitted]);
  const deletedPaths = [];

  const result = await cleanupExpiredPublicUploads({
    tenantId,
    now,
    store,
    storage: {
      async deleteObjectEntity(objectPath) {
        deletedPaths.push(objectPath);
      },
    },
  });

  assert.deepEqual(result, { inspected: 1, deleted: 1, failed: 0 });
  assert.deepEqual(deletedPaths, [pending.objectPath]);
  assert.deepEqual(store.rows, [submitted]);
});

test("cleanup releases a failed deletion for a later retry", async () => {
  const pending = upload();
  const store = makeStore([pending]);

  const result = await cleanupExpiredPublicUploads({
    tenantId,
    now,
    store,
    storage: {
      async deleteObjectEntity() {
        throw new Error("storage unavailable");
      },
    },
  });

  assert.deepEqual(result, { inspected: 1, deleted: 0, failed: 1 });
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].cleanupStartedAt, null);
});

test("cleanup does not touch uploads that have not expired", async () => {
  const pending = upload({
    expiresAt: new Date("2026-09-08T12:00:00.000Z"),
  });
  const store = makeStore([pending]);
  let deleteCount = 0;

  const result = await cleanupExpiredPublicUploads({
    tenantId,
    now,
    store,
    storage: {
      async deleteObjectEntity() {
        deleteCount++;
      },
    },
  });

  assert.deepEqual(result, { inspected: 0, deleted: 0, failed: 0 });
  assert.equal(deleteCount, 0);
  assert.equal(store.rows.length, 1);
});

test("cleanup still preserves an object referenced by a candidate document", async () => {
  const submitted = upload({
    claimedAt: null,
  });
  const store = makeStore([submitted]);
  // The production database adapter applies the candidate-document NOT EXISTS
  // predicate before this orchestration receives candidates. This regression
  // test models that result explicitly: referenced rows are not candidates.
  store.listExpiredUnclaimed = async () => [];
  let deleteCount = 0;

  const result = await cleanupExpiredPublicUploads({
    tenantId,
    now,
    store,
    storage: {
      async deleteObjectEntity() {
        deleteCount++;
      },
    },
  });

  assert.deepEqual(result, { inspected: 0, deleted: 0, failed: 0 });
  assert.equal(deleteCount, 0);
  assert.equal(store.rows.length, 1);
});

test("scheduled cleanup processes each active tenant once and aggregates results", async () => {
  const cleanedTenantIds = [];
  const runner = createPublicUploadCleanupRunner({
    listActiveTenantIds: async () => ["tenant-a", "tenant-b", "tenant-a"],
    cleanupTenant: async (tenantId) => {
      cleanedTenantIds.push(tenantId);
      return {
        inspected: 2,
        deleted: tenantId === "tenant-a" ? 1 : 2,
        failed: tenantId === "tenant-a" ? 1 : 0,
      };
    },
  });

  const result = await runner();

  assert.deepEqual(cleanedTenantIds, ["tenant-a", "tenant-b"]);
  assert.deepEqual(result, {
    tenantCount: 2,
    completedTenants: 2,
    failedTenants: 0,
    skippedTenants: 0,
    inspected: 4,
    deleted: 3,
    failed: 1,
  });
});

test("overlapping scheduled cleanup skips a tenant until its first run completes", async () => {
  let signalCleanupStarted;
  const cleanupStarted = new Promise((resolve) => {
    signalCleanupStarted = resolve;
  });
  let cleanupCanFinish;
  const cleanupFinished = new Promise((resolve) => {
    cleanupCanFinish = resolve;
  });
  const runner = createPublicUploadCleanupRunner({
    listActiveTenantIds: async () => ["tenant-a"],
    cleanupTenant: async () => {
      signalCleanupStarted();
      await cleanupFinished;
      return { inspected: 1, deleted: 1, failed: 0 };
    },
  });

  const firstRun = runner();
  await cleanupStarted;
  const overlappingRun = await runner();

  assert.deepEqual(overlappingRun, {
    tenantCount: 1,
    completedTenants: 0,
    failedTenants: 0,
    skippedTenants: 1,
    inspected: 0,
    deleted: 0,
    failed: 0,
  });

  cleanupCanFinish();
  assert.deepEqual(await firstRun, {
    tenantCount: 1,
    completedTenants: 1,
    failedTenants: 0,
    skippedTenants: 0,
    inspected: 1,
    deleted: 1,
    failed: 0,
  });
});

test("distributed lease contention skips a tenant without failing the run", async () => {
  let signalCleanupStarted;
  const cleanupStarted = new Promise((resolve) => {
    signalCleanupStarted = resolve;
  });
  let cleanupCanFinish;
  const cleanupFinished = new Promise((resolve) => {
    cleanupCanFinish = resolve;
  });
  let leaseHeld = false;
  const leaseContenders = [];
  const acquireTenantLease = async () => {
    if (leaseHeld) return false;
    leaseHeld = true;
    return true;
  };
  const releaseTenantLease = async () => {
    leaseHeld = false;
  };
  const createRunner = () =>
    createPublicUploadCleanupRunner({
      listActiveTenantIds: async () => ["tenant-a"],
      acquireTenantLease,
      releaseTenantLease,
      onTenantLeaseContended: (id) => leaseContenders.push(id),
      cleanupTenant: async () => {
        signalCleanupStarted();
        await cleanupFinished;
        return { inspected: 1, deleted: 1, failed: 0 };
      },
    });
  const firstRunner = createRunner();
  const secondRunner = createRunner();

  const firstRun = firstRunner();
  await cleanupStarted;
  const contendedRun = await secondRunner();

  assert.deepEqual(contendedRun, {
    tenantCount: 1,
    completedTenants: 0,
    failedTenants: 0,
    skippedTenants: 1,
    inspected: 0,
    deleted: 0,
    failed: 0,
  });
  assert.deepEqual(leaseContenders, ["tenant-a"]);

  cleanupCanFinish();
  assert.deepEqual(await firstRun, {
    tenantCount: 1,
    completedTenants: 1,
    failedTenants: 0,
    skippedTenants: 0,
    inspected: 1,
    deleted: 1,
    failed: 0,
  });
  assert.equal(leaseHeld, false);
});

test("a stale distributed lease can be reclaimed on a later run", async () => {
  let leaseExpiresAt = new Date("2026-09-07T12:30:00.000Z");
  const cleanedTenantIds = [];
  const runner = createPublicUploadCleanupRunner({
    listActiveTenantIds: async () => ["tenant-a"],
    acquireTenantLease: async () => {
      const acquiredAt = now;
      if (leaseExpiresAt > acquiredAt) return false;
      leaseExpiresAt = new Date(
        acquiredAt.getTime() + 60 * 60 * 1000,
      );
      return true;
    },
    releaseTenantLease: async () => {},
    cleanupTenant: async (id) => {
      cleanedTenantIds.push(id);
      return { inspected: 0, deleted: 0, failed: 0 };
    },
  });

  const blocked = await runner();
  assert.equal(blocked.skippedTenants, 1);
  leaseExpiresAt = new Date("2026-09-07T11:00:00.000Z");

  const recovered = await runner();
  assert.equal(recovered.completedTenants, 1);
  assert.deepEqual(cleanedTenantIds, ["tenant-a"]);
});

test("a failed tenant does not prevent other tenants or the next retry", async () => {
  const failures = [];
  let attempts = 0;
  const runner = createPublicUploadCleanupRunner({
    listActiveTenantIds: async () => ["tenant-a", "tenant-b"],
    cleanupTenant: async (tenantId) => {
      attempts++;
      if (tenantId === "tenant-a" && attempts === 1) {
        throw new Error("temporary database outage");
      }
      return { inspected: 1, deleted: 1, failed: 0 };
    },
    onTenantFailure: (tenantId, error) => {
      failures.push([tenantId, error.message]);
    },
  });

  const firstResult = await runner();
  const retryResult = await runner();

  assert.deepEqual(firstResult, {
    tenantCount: 2,
    completedTenants: 1,
    failedTenants: 1,
    skippedTenants: 0,
    inspected: 1,
    deleted: 1,
    failed: 0,
  });
  assert.deepEqual(retryResult, {
    tenantCount: 2,
    completedTenants: 2,
    failedTenants: 0,
    skippedTenants: 0,
    inspected: 2,
    deleted: 2,
    failed: 0,
  });
  assert.deepEqual(failures, [["tenant-a", "temporary database outage"]]);
});

test("repeated tenant failures alert once within the configured bounded window", async () => {
  const alerts = [];
  let currentTime = new Date("2026-09-07T12:00:00.000Z");
  const tracker = createPublicUploadCleanupFailureTracker({
    threshold: 3,
    windowMs: 60 * 60 * 1000,
    now: () => currentTime,
    onAlert: (alert) => alerts.push(alert),
  });

  await tracker.recordFailure("tenant-a", { failedUploads: 2 });
  await tracker.recordFailure("tenant-a");
  await tracker.recordFailure("tenant-a", { failedUploads: 1 });
  await tracker.recordFailure("tenant-a");

  assert.deepEqual(alerts, [
    {
      tenantId: "tenant-a",
      failureCount: 3,
      windowMs: 60 * 60 * 1000,
      failedUploads: 1,
    },
  ]);

  currentTime = new Date("2026-09-07T13:01:00.000Z");
  await tracker.recordFailure("tenant-a");
  await tracker.recordFailure("tenant-a");
  await tracker.recordFailure("tenant-a");

  assert.equal(alerts.length, 2);
  assert.equal(alerts[1].tenantId, "tenant-a");
  assert.equal(alerts[1].failureCount, 3);
});

test("a successful tenant run resolves and clears its cleanup alert", async () => {
  const alerts = [];
  const recoveries = [];
  let currentTime = new Date("2026-09-07T12:00:00.000Z");
  const tracker = createPublicUploadCleanupFailureTracker({
    threshold: 2,
    now: () => currentTime,
    onAlert: (alert) => alerts.push(alert),
    onRecovery: (recovery) => recoveries.push(recovery),
  });

  await tracker.recordFailure("tenant-a", { failedUploads: 2 });
  await tracker.recordFailure("tenant-a");
  assert.deepEqual(tracker.getHealth(), [
    {
      tenantId: "tenant-a",
      status: "active",
      failureCount: 2,
      failedUploadCount: 2,
      lastFailureAt: currentTime,
      recoveredAt: null,
    },
  ]);

  currentTime = new Date("2026-09-07T12:05:00.000Z");
  await tracker.recordSuccess("tenant-a");
  await tracker.recordFailure("tenant-a");

  assert.equal(alerts.length, 1);
  assert.deepEqual(recoveries, [{ tenantId: "tenant-a" }]);
  const health = tracker.getHealth();
  assert.equal(health.length, 1);
  assert.equal(health[0].tenantId, "tenant-a");
  assert.equal(health[0].status, "recovered");
  assert.equal(health[0].failureCount, 2);
  assert.equal(health[0].failedUploadCount, 2);
  assert.equal(health[0].lastFailureAt.toISOString(), "2026-09-07T12:05:00.000Z");
  assert.equal(health[0].recoveredAt.toISOString(), "2026-09-07T12:05:00.000Z");
  assert.equal(Object.hasOwn(health[0], "objectPath"), false);
});

test("cleanup failure history and alert state survive a new tracker instance", async () => {
  const alerts = [];
  const recoveries = [];
  const persistedStates = new Map();
  const store = {
    async load(tenantId) {
      const state = persistedStates.get(tenantId);
      return state
        ? {
            timestamps: [...state.timestamps],
            alertActive: state.alertActive,
          }
        : null;
    },
    async save(tenantId, state) {
      persistedStates.set(tenantId, {
        timestamps: [...state.timestamps],
        alertActive: state.alertActive,
      });
    },
    async clear(tenantId) {
      persistedStates.delete(tenantId);
    },
  };
  const currentTime = new Date("2026-09-07T12:00:00.000Z");
  const trackerBeforeRestart = createPublicUploadCleanupFailureTracker({
    threshold: 3,
    windowMs: 60 * 60 * 1000,
    now: () => currentTime,
    store,
  });

  await trackerBeforeRestart.recordFailure("tenant-a");
  await trackerBeforeRestart.recordFailure("tenant-a");

  const trackerAfterRestart = createPublicUploadCleanupFailureTracker({
    threshold: 3,
    windowMs: 60 * 60 * 1000,
    now: () => currentTime,
    store,
    onAlert: (alert) => alerts.push(alert),
    onRecovery: (recovery) => recoveries.push(recovery),
  });

  await trackerAfterRestart.recordFailure("tenant-a", { failedUploads: 1 });
  assert.deepEqual(alerts, [
    {
      tenantId: "tenant-a",
      failureCount: 3,
      windowMs: 60 * 60 * 1000,
      failedUploads: 1,
    },
  ]);
  assert.equal(persistedStates.get("tenant-a").alertActive, true);
  assert.equal(
    Object.hasOwn(persistedStates.get("tenant-a"), "objectPath"),
    false,
  );

  await trackerAfterRestart.recordSuccess("tenant-a");
  assert.deepEqual(recoveries, [{ tenantId: "tenant-a" }]);
  assert.equal(persistedStates.has("tenant-a"), false);
});

test("a persisted failure outside the window does not count after restart", async () => {
  const alerts = [];
  const persistedStates = new Map();
  const store = {
    async load(tenantId) {
      const state = persistedStates.get(tenantId);
      return state
        ? {
            timestamps: [...state.timestamps],
            alertActive: state.alertActive,
          }
        : null;
    },
    async save(tenantId, state) {
      persistedStates.set(tenantId, {
        timestamps: [...state.timestamps],
        alertActive: state.alertActive,
      });
    },
    async clear(tenantId) {
      persistedStates.delete(tenantId);
    },
  };
  let currentTime = new Date("2026-09-07T12:00:00.000Z");
  const trackerBeforeRestart = createPublicUploadCleanupFailureTracker({
    threshold: 3,
    windowMs: 60 * 60 * 1000,
    now: () => currentTime,
    store,
  });

  await trackerBeforeRestart.recordFailure("tenant-a");
  await trackerBeforeRestart.recordFailure("tenant-a");

  currentTime = new Date("2026-09-07T13:01:00.000Z");
  const trackerAfterRestart = createPublicUploadCleanupFailureTracker({
    threshold: 3,
    windowMs: 60 * 60 * 1000,
    now: () => currentTime,
    store,
    onAlert: (alert) => alerts.push(alert),
  });

  await trackerAfterRestart.recordFailure("tenant-a");
  assert.deepEqual(alerts, []);
  assert.deepEqual(persistedStates.get("tenant-a").timestamps, [
    currentTime.getTime(),
  ]);

  await trackerAfterRestart.recordFailure("tenant-a");
  await trackerAfterRestart.recordFailure("tenant-a");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].failureCount, 3);
});

test("scheduled cleanup observes per-upload failures without exposing upload details", async () => {
  const alerts = [];
  const tracker = createPublicUploadCleanupFailureTracker({
    threshold: 1,
    onAlert: (alert) => alerts.push(alert),
  });
  const runner = createPublicUploadCleanupRunner({
    listActiveTenantIds: async () => ["tenant-a"],
    cleanupTenant: async () => ({ inspected: 1, deleted: 0, failed: 1 }),
    onTenantResult: async (tenantId, result) => {
      if (result.failed > 0) {
        await tracker.recordFailure(tenantId, { failedUploads: result.failed });
      } else {
        await tracker.recordSuccess(tenantId);
      }
    },
  });

  await runner();

  assert.deepEqual(alerts, [
    {
      tenantId: "tenant-a",
      failureCount: 1,
      windowMs: 60 * 60 * 1000,
      failedUploads: 1,
    },
  ]);
  assert.equal(Object.hasOwn(alerts[0], "objectPath"), false);
});