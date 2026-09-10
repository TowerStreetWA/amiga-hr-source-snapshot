import { Router, type IRouter, type Request, type Response } from "express";
import {
  getPublicUploadCleanupHealth,
  runPublicUploadCleanup,
} from "../lib/publicUploadCleanup";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// GET /admin/maintenance/public-uploads/health — expose aggregate cleanup
// health for the current tenant only. Object paths and storage credentials are
// deliberately not part of the tracker or this response.
router.get(
  "/admin/maintenance/public-uploads/health",
  (req: Request, res: Response) => {
    res.json(
      getPublicUploadCleanupHealth(req.tenantId).map((entry) => ({
        tenantId: entry.tenantId,
        status: entry.status,
        failureCount: entry.failureCount,
        failedUploadCount: entry.failedUploadCount,
        lastFailureAt: entry.lastFailureAt.toISOString(),
        recoveredAt: entry.recoveredAt?.toISOString() ?? null,
      })),
    );
  },
);

// Admin-only by design: authorize.ts allows admins through and no /admin path
// is on the non-admin allowlist. The batch cap in the cleanup service keeps an
// operator run bounded and safe to repeat.
router.post(
  "/admin/maintenance/public-uploads/cleanup",
  async (req: Request, res: Response) => {
    try {
      const result = await runPublicUploadCleanup({
        tenantId: req.tenantId,
        storage: objectStorageService,
      });
      res.json(result);
    } catch (error) {
      req.log.error({ err: error }, "Public upload cleanup failed");
      res.status(503).json({ error: "Public upload cleanup unavailable" });
    }
  },
);

export default router;