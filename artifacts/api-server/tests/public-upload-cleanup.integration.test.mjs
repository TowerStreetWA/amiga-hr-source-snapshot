import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
const integrationTest = process.env.DATABASE_URL
  ? test
  : test.skip;

const now = new Date("2026-09-08T12:00:00.000Z");

function objectPath(tenantId, name) {
  return `/objects/public-upload-cleanup-${tenantId}/${name}`;
}

async function queryUploadRows(pool, tenantIds) {
  const { rows } = await pool.query(
    `SELECT tenant_id AS "tenantId",
            object_path AS "objectPath",
            expires_at AS "expiresAt",
            claimed_at AS "claimedAt",
            cleanup_started_at AS "cleanupStartedAt"
       FROM public_application_uploads
      WHERE tenant_id = ANY($1::uuid[])
      ORDER BY tenant_id, object_path`,
    [tenantIds],
  );
  return rows;
}

integrationTest(
  "scheduled cleanup uses the real tenant database and retries storage failures",
  async (t) => {
    const { pool } = await import("@workspace/db");
    const tenantIds = {
      activeA: randomUUID(),
      activeB: randomUUID(),
      inactive: randomUUID(),
    };
    const paths = {
      activeARetry: objectPath(tenantIds.activeA, "retry"),
      activeAClaimed: objectPath(tenantIds.activeA, "claimed"),
      activeAReferenced: objectPath(tenantIds.activeA, "referenced"),
      activeAFresh: objectPath(tenantIds.activeA, "fresh"),
      activeBDelete: objectPath(tenantIds.activeB, "delete"),
      activeBClaimed: objectPath(tenantIds.activeB, "claimed"),
      activeBReferenced: objectPath(tenantIds.activeB, "referenced"),
      inactiveDelete: objectPath(tenantIds.inactive, "delete"),
    };
    const seededTenantIds = Object.values(tenantIds);
    const expiredAt = new Date("2026-09-01T12:00:00.000Z");
    const claimedAt = new Date("2026-09-02T12:00:00.000Z");
    const referencedAt = new Date("2026-09-03T12:00:00.000Z");
    const freshAt = new Date("2026-09-09T12:00:00.000Z");

    t.after(async () => {
      await pool.query(
        "DELETE FROM public_application_uploads WHERE tenant_id = ANY($1::uuid[])",
        [seededTenantIds],
      );
      await pool.query(
        "DELETE FROM candidate_documents WHERE tenant_id = ANY($1::uuid[])",
        [seededTenantIds],
      );
      await pool.query(
        "DELETE FROM candidates WHERE tenant_id = ANY($1::uuid[])",
        [seededTenantIds],
      );
      await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [
        seededTenantIds,
      ]);
      await pool.end();
    });

    const { createDatabasePublicUploadCleanupRunner } = await import(
      "../src/lib/publicUploadCleanup.ts"
    );

    try {
      await pool.query(
        `INSERT INTO tenants (id, slug, name, status)
         VALUES
           ($1, $2, $3, 'active'),
           ($4, $5, $6, 'active'),
           ($7, $8, $9, 'inactive')`,
        [
          tenantIds.activeA,
          `cleanup-${tenantIds.activeA}`,
          "Upload cleanup active A",
          tenantIds.activeB,
          `cleanup-${tenantIds.activeB}`,
          "Upload cleanup active B",
          tenantIds.inactive,
          `cleanup-${tenantIds.inactive}`,
          "Upload cleanup inactive",
        ],
      );

      const candidateIds = {};
      for (const [name, tenantId] of [
        ["activeA", tenantIds.activeA],
        ["activeB", tenantIds.activeB],
      ]) {
        const { rows } = await pool.query(
          `INSERT INTO candidates (tenant_id, first_name, last_name, email)
           VALUES ($1, $2, 'Cleanup', $3)
           RETURNING id`,
          [
            tenantId,
            `Candidate ${name}`,
            `${name}-${tenantId}@example.invalid`,
          ],
        );
        candidateIds[name] = rows[0].id;
      }

      await pool.query(
        `INSERT INTO candidate_documents
           (tenant_id, candidate_id, name, object_path, file_size, mime_type)
         VALUES
           ($1, $2, 'referenced-a.pdf', $3, 10, 'application/pdf'),
           ($4, $5, 'referenced-b.pdf', $6, 10, 'application/pdf')`,
        [
          tenantIds.activeA,
          candidateIds.activeA,
          paths.activeAReferenced,
          tenantIds.activeB,
          candidateIds.activeB,
          paths.activeBReferenced,
        ],
      );

      await pool.query(
        `INSERT INTO public_application_uploads
           (tenant_id, object_path, expires_at, claimed_at)
         VALUES
           ($1, $2, $3, NULL),
           ($1, $4, $5, $6),
           ($1, $7, $8, NULL),
           ($1, $9, $10, NULL),
           ($11, $12, $3, NULL),
           ($11, $13, $5, $6),
           ($11, $14, $8, NULL),
           ($15, $16, $3, NULL)`,
        [
          tenantIds.activeA,
          paths.activeARetry,
          expiredAt,
          paths.activeAClaimed,
          claimedAt,
          claimedAt,
          paths.activeAReferenced,
          referencedAt,
          paths.activeAFresh,
          freshAt,
          tenantIds.activeB,
          paths.activeBDelete,
          paths.activeBClaimed,
          paths.activeBReferenced,
          tenantIds.inactive,
          paths.inactiveDelete,
        ],
      );

      let shouldFailRetry = true;
      const deletedPaths = [];
      const storage = {
        async deleteObjectEntity(path) {
          if (path === paths.activeARetry && shouldFailRetry) {
            shouldFailRetry = false;
            throw new Error("simulated storage outage");
          }
          deletedPaths.push(path);
        },
      };
      const runScheduledCleanup = createDatabasePublicUploadCleanupRunner({
        storage,
        now,
        listActiveTenantIds: async () => {
          const { rows } = await pool.query(
            `SELECT id
               FROM tenants
              WHERE id = ANY($1::uuid[])
                AND status = 'active'`,
            [seededTenantIds],
          );
          return rows.map((row) => row.id);
        },
      });

      const firstRun = await runScheduledCleanup();

      assert.deepEqual(firstRun, {
        tenantCount: 2,
        completedTenants: 2,
        failedTenants: 0,
        skippedTenants: 0,
        inspected: 2,
        deleted: 1,
        failed: 1,
      });
      assert.deepEqual(deletedPaths, [paths.activeBDelete]);

      const afterFirstRun = await queryUploadRows(pool, seededTenantIds);
      assert.deepEqual(
        afterFirstRun.map((row) => row.objectPath),
        [
          paths.activeAClaimed,
          paths.activeAFresh,
          paths.activeAReferenced,
          paths.activeARetry,
          paths.activeBClaimed,
          paths.activeBReferenced,
          paths.inactiveDelete,
        ].sort(),
      );
      const retryRow = afterFirstRun.find(
        (row) => row.objectPath === paths.activeARetry,
      );
      assert.equal(retryRow.cleanupStartedAt, null);

      const retryRun = await runScheduledCleanup();

      assert.deepEqual(retryRun, {
        tenantCount: 2,
        completedTenants: 2,
        failedTenants: 0,
        skippedTenants: 0,
        inspected: 1,
        deleted: 1,
        failed: 0,
      });
      assert.deepEqual(deletedPaths, [paths.activeBDelete, paths.activeARetry]);

      const remainingRows = await queryUploadRows(pool, seededTenantIds);
      assert.deepEqual(
        remainingRows.map((row) => row.objectPath),
        [
          paths.activeAClaimed,
          paths.activeAFresh,
          paths.activeAReferenced,
          paths.activeBClaimed,
          paths.activeBReferenced,
          paths.inactiveDelete,
        ].sort(),
      );
      assert.ok(
        remainingRows.some(
          (row) => row.objectPath === paths.activeAReferenced,
        ),
      );
      assert.ok(
        remainingRows.some(
          (row) => row.objectPath === paths.activeBReferenced,
        ),
      );
    } catch (error) {
      await pool.query(
        "DELETE FROM public_application_uploads WHERE tenant_id = ANY($1::uuid[])",
        [seededTenantIds],
      );
      await pool.query(
        "DELETE FROM candidate_documents WHERE tenant_id = ANY($1::uuid[])",
        [seededTenantIds],
      );
      await pool.query(
        "DELETE FROM candidates WHERE tenant_id = ANY($1::uuid[])",
        [seededTenantIds],
      );
      await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [
        seededTenantIds,
      ]);
      throw error;
    }
  },
);