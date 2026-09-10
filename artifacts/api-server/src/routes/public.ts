import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  SubmitApplicationBody,
  RequestPublicUploadUrlBody,
  RequestPublicUploadUrlResponse,
} from "@workspace/api-zod";
import {
  db,
  jobsTable,
  candidatesTable,
  candidateDocumentsTable,
  candidateStageHistoryTable,
  publicApplicationUploadsTable,
  tenantsTable,
} from "@workspace/db";
import {
  ObjectNotFoundError,
  ObjectInvalidSizeError,
  ObjectTooLargeError,
  ObjectStorageService,
} from "../lib/objectStorage.ts";
import { hasMatchingFileSignature } from "../lib/fileSignatures.ts";
import { sendApplicationConfirmation } from "../lib/email.ts";
import { logActivity } from "../lib/activity.ts";
import { rateLimit } from "../lib/rateLimit.ts";
import { listPublicJobs } from "../lib/publicJobs.ts";
import { PUBLIC_UPLOAD_RETENTION_MS } from "../lib/publicUploadCleanup.ts";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_PREFIXES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument", "image/png", "image/jpeg", "image/webp"];
const MAX_UPLOAD_ERROR = `File too large. Maximum size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`;

const uploadLimiter = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "pub-upload" });
const applyLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  keyPrefix: "pub-apply",
  keyGenerator: (req, clientAddress) => `${req.tenantId}:${clientAddress}`,
});

class InvalidPublicUploadReferenceError extends Error {
  constructor() {
    super("Invalid or expired document reference");
    this.name = "InvalidPublicUploadReferenceError";
  }
}
function isUploadObjectPathForTenant(p: string, tenantId: string): boolean {
  if (typeof p !== "string") return false;
  const tenantUploadPrefix = `/objects/uploads/${tenantId}/`;
  return (
    p.startsWith(tenantUploadPrefix) &&
    /^[A-Za-z0-9_-]+$/.test(p.slice(tenantUploadPrefix.length))
  );
}

// The single-tenant deployment's deprecated un-versioned public paths all map
// to this slug. New integrations should use /public/:tenantSlug/* instead.
const DEFAULT_PUBLIC_SLUG = "amiga";

/**
 * Resolve a tenant slug (case-insensitive via citext) to an active tenant and
 * stash its id on `req.tenantId`. Responds 404 and returns false if the slug
 * doesn't map to an active tenant, so callers should `return` when false.
 *
 * Resolving here attributes the request to a tenant; the queries below now
 * scope by `req.tenantId` (Phase B.6), so the public surface is shaped
 * per-tenant at both the routing and data layers.
 */
async function resolveTenantSlug(req: Request, res: Response, slug: string): Promise<boolean> {
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(and(eq(tenantsTable.slug, slug), eq(tenantsTable.status, "active")));
  if (!tenant) {
    res.status(404).json({ error: "not found" });
    return false;
  }
  req.tenantId = tenant.id;
  return true;
}

async function listJobs(req: Request, res: Response): Promise<void> {
  await listPublicJobs(req, res, () =>
    db
      .select()
      .from(jobsTable)
      .where(and(eq(jobsTable.status, "open"), eq(jobsTable.tenantId, req.tenantId)))
      .orderBy(desc(jobsTable.createdAt)),
  );
}

async function requestUploadUrl(req: Request, res: Response): Promise<void> {
  const parsed = RequestPublicUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }
  const { size, contentType } = parsed.data;
  if (typeof size === "number" && size > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: MAX_UPLOAD_ERROR });
    return;
  }
  if (typeof contentType === "string" && !ALLOWED_MIME_PREFIXES.some((p) => contentType.startsWith(p))) {
    res.status(415).json({ error: "Unsupported file type. Please upload PDF, Word, or image files." });
    return;
  }
  try {
    // Public upload paths are tenant-namespaced so an object path issued for
    // one public application flow cannot be attached to another tenant.
    const uploadURL = await objectStorageService.getObjectEntityUploadURL(
      `uploads/${req.tenantId}`,
      parsed.data.name,
    );
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    try {
      await db.insert(publicApplicationUploadsTable).values({
        tenantId: req.tenantId,
        objectPath,
        expiresAt: new Date(Date.now() + PUBLIC_UPLOAD_RETENTION_MS),
      });
    } catch (error) {
      // Do not return an upload URL that the cleanup ledger cannot track.
      // The client never receives this URL when the ledger insert fails.
      await objectStorageService
        .deleteObjectEntity(objectPath)
        .catch((cleanupError) =>
          req.log.warn(
            { err: cleanupError },
            "Unable to remove untracked public upload object",
          ),
        );
      throw error;
    }
    res.json(RequestPublicUploadUrlResponse.parse({ uploadURL, objectPath }));
  } catch (error) {
    req.log.error({ err: error }, "Error generating public upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
}

async function submitApplication(req: Request, res: Response): Promise<void> {
  const parsed = SubmitApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid application", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  if (data.documents && data.documents.length > 10) {
    res.status(400).json({ error: "Too many documents attached. Maximum 10." });
    return;
  }
  if (data.documents) {
    for (const d of data.documents) {
      if (!isUploadObjectPathForTenant(d.objectPath, req.tenantId)) {
        res.status(400).json({ error: "Invalid document reference." });
        return;
      }
      try {
        const { metadata, content } =
          await objectStorageService.getObjectEntityMetadataAndContent(
            d.objectPath,
            MAX_UPLOAD_BYTES,
          );
        const storedName = metadata.metadata?.name;
        const storedSize =
          (typeof metadata.size === "string" && metadata.size.trim() !== "") ||
          typeof metadata.size === "number"
            ? Number(metadata.size)
            : Number.NaN;
        if (!Number.isSafeInteger(storedSize) || storedSize < 0) {
          res.status(400).json({ error: "Invalid document reference." });
          return;
        }
        if (storedSize > MAX_UPLOAD_BYTES) {
          res.status(413).json({ error: MAX_UPLOAD_ERROR });
          return;
        }
        const storedMimeType =
          typeof metadata.contentType === "string"
            ? metadata.contentType.trim().toLowerCase()
            : undefined;
        const suppliedMimeType =
          typeof d.mimeType === "string"
            ? d.mimeType.trim().toLowerCase()
            : undefined;
        const metadataMismatch =
          storedName !== d.name ||
          (d.fileSize !== undefined &&
            d.fileSize !== null &&
            storedSize !== d.fileSize) ||
          (suppliedMimeType !== undefined && storedMimeType !== suppliedMimeType);
        const contentMismatch =
          storedMimeType === undefined ||
          !hasMatchingFileSignature(content, storedMimeType);
        if (metadataMismatch || contentMismatch) {
          res.status(400).json({ error: "Invalid document reference." });
          return;
        }
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          res.status(400).json({ error: "Invalid document reference." });
          return;
        }
        if (error instanceof ObjectInvalidSizeError) {
          res.status(400).json({ error: "Invalid document reference." });
          return;
        }
        if (error instanceof ObjectTooLargeError) {
          res.status(413).json({ error: MAX_UPLOAD_ERROR });
          return;
        }
        req.log.error({ err: error }, "Error validating public application document");
        res.status(500).json({ error: "Failed to submit application" });
        return;
      }
    }
  }
  const applicationJobId = data.jobId ?? null;
  const applicationEmail = data.email.trim().toLowerCase();
  if (applicationJobId !== null) {
    const [job] = await db
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.id, applicationJobId),
          eq(jobsTable.tenantId, req.tenantId),
          eq(jobsTable.status, "open"),
        ),
      );
    if (!job) {
      res.status(404).json({ error: "not found" });
      return;
    }
  }
  let result: Awaited<ReturnType<typeof submitApplicationTransaction>>;
  try {
    result = await db.transaction((tx) =>
      submitApplicationTransaction(tx, req, data, applicationJobId, applicationEmail),
    );
  } catch (error) {
    if (error instanceof InvalidPublicUploadReferenceError) {
      res.status(400).json({ error: "Invalid or expired document reference." });
      return;
    }
    throw error;
  }
  const created = result.candidate;
  if (result.duplicate) {
    res.status(200).json({
      id: created.id,
      message: "Thank you — your application has already been received.",
    });
    return;
  }
  await logActivity(
    "public_application",
    "candidate",
    created.id,
    `New online application from ${created.firstName} ${created.lastName}`,
    "Admin",
    req.tenantId,
  );
  // Confirmation email to applicant (best-effort)
  let jobTitle = "your application";
  if (created.jobId) {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, created.jobId));
    if (job) jobTitle = job.title;
  }
  void sendApplicationConfirmation({
    to: created.email,
    candidateName: `${created.firstName} ${created.lastName}`,
    jobTitle,
  }).catch((err) => req.log.error({ err }, "application confirmation email failed"));
  res.status(201).json({
    id: created.id,
    message: "Thank you — your application has been received.",
  });
}

async function submitApplicationTransaction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  req: Request,
  data: ReturnType<typeof SubmitApplicationBody.parse>,
  applicationJobId: number | null,
  applicationEmail: string,
) {
    // A retry can arrive while the first request is still committing. The
    // transaction-scoped advisory lock makes the lookup-and-insert atomic for
    // this application without preventing the same applicant from applying
    // for a different role.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${req.tenantId}:${applicationEmail}:${applicationJobId ?? "general"}`}))`,
    );
    const [existing] = await tx
      .select()
      .from(candidatesTable)
      .where(
        and(
          eq(candidatesTable.tenantId, req.tenantId),
          eq(candidatesTable.source, "online_application"),
          sql`lower(${candidatesTable.email}) = ${applicationEmail}`,
          applicationJobId === null
            ? isNull(candidatesTable.jobId)
            : eq(candidatesTable.jobId, applicationJobId),
        ),
      )
      .limit(1);
    if (existing) {
      return { candidate: existing, duplicate: true };
    }

    const claimedAt = new Date();
    if (data.documents && data.documents.length > 0) {
      for (const document of data.documents) {
        const [claimed] = await tx
          .update(publicApplicationUploadsTable)
          .set({ claimedAt })
          .where(
            and(
              eq(publicApplicationUploadsTable.tenantId, req.tenantId),
              eq(publicApplicationUploadsTable.objectPath, document.objectPath),
              isNull(publicApplicationUploadsTable.claimedAt),
              isNull(publicApplicationUploadsTable.cleanupStartedAt),
              sql`${publicApplicationUploadsTable.expiresAt} > ${claimedAt}`,
            ),
          )
          .returning({ id: publicApplicationUploadsTable.id });
        if (!claimed) throw new InvalidPublicUploadReferenceError();
      }
    }

    const [cand] = await tx
      .insert(candidatesTable)
      .values({
        tenantId: req.tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: applicationEmail,
        phone: data.phone ?? null,
        jobId: applicationJobId,
        currentStage: "new",
        source: "online_application",
        rightToWorkStatus: data.rightToWorkStatus ?? "unknown",
        linkedinUrl: data.linkedinUrl ?? null,
        currentCompany: data.currentCompany ?? null,
        currentRole: data.currentRole ?? null,
        yearsExperience: data.yearsExperience ?? null,
        currentSalary:
          data.currentSalary !== undefined && data.currentSalary !== null
            ? String(data.currentSalary)
            : null,
        expectedSalary:
          data.expectedSalary !== undefined && data.expectedSalary !== null
            ? String(data.expectedSalary)
            : null,
        noticePeriod: data.noticePeriod ?? null,
        lastBonusAmount:
          data.lastBonusAmount !== undefined && data.lastBonusAmount !== null
            ? String(data.lastBonusAmount)
            : null,
        lastBonusPercentage:
          data.lastBonusPercentage !== undefined && data.lastBonusPercentage !== null
            ? String(data.lastBonusPercentage)
            : null,
        currentPensionPercentage:
          data.currentPensionPercentage !== undefined && data.currentPensionPercentage !== null
            ? String(data.currentPensionPercentage)
            : null,
        referenceOneName: data.referenceOneName ?? null,
        referenceOneCompany: data.referenceOneCompany ?? null,
        referenceOneJobTitle: data.referenceOneJobTitle ?? null,
        referenceOneEmail: data.referenceOneEmail ?? null,
        referenceOnePhone: data.referenceOnePhone ?? null,
        referenceTwoName: data.referenceTwoName ?? null,
        referenceTwoCompany: data.referenceTwoCompany ?? null,
        referenceTwoJobTitle: data.referenceTwoJobTitle ?? null,
        referenceTwoEmail: data.referenceTwoEmail ?? null,
        referenceTwoPhone: data.referenceTwoPhone ?? null,
        currency: "GBP",
        coverLetter: data.coverLetter ?? null,
      })
      .returning();
    await tx.insert(candidateStageHistoryTable).values({
      tenantId: req.tenantId,
      candidateId: cand.id,
      fromStage: null,
      toStage: "new",
      note: "Submitted via online application form",
      changedBy: "Public",
    });
    if (data.documents && data.documents.length > 0) {
      const tenantId = req.tenantId;
      await tx.insert(candidateDocumentsTable).values(
        data.documents.map((d) => ({
          tenantId,
          candidateId: cand.id,
          name: d.name,
          category: d.category,
          objectPath: d.objectPath,
          fileSize: d.fileSize ?? null,
          mimeType: d.mimeType ?? null,
        })),
      );
    }
    return { candidate: cand, duplicate: false };
}
function withSlug(
  handler: (req: Request, res: Response) => Promise<void>,
  afterResolve?: (req: Request, res: Response, next: NextFunction) => void,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void (async () => {
      try {
        const slug = req.params.tenantSlug;
        if (typeof slug !== "string") {
          res.status(404).json({ error: "not found" });
          return;
        }
        if (!(await resolveTenantSlug(req, res, slug))) return;
        if (afterResolve) {
          afterResolve(req, res, (err) => {
            if (err) {
              next(err);
              return;
            }
            void handler(req, res).catch(next);
          });
          return;
        }
        await handler(req, res);
      } catch (err) {
        next(err);
      }
    })();
  };
}

router.get("/public/:tenantSlug/jobs", withSlug(listJobs));
router.post("/public/:tenantSlug/upload-url", uploadLimiter, withSlug(requestUploadUrl));
router.post("/public/:tenantSlug/applications", withSlug(submitApplication, applyLimiter));

// --- Deprecated un-versioned aliases -----------------------------------------
// Kept working for the existing single-tenant deployment and the generated API
// client. They resolve to the Amiga tenant and log a deprecation warning so we
// can see who is still calling them before removal in a later phase.
function deprecated(
  handler: (req: Request, res: Response) => Promise<void>,
  afterResolve?: (req: Request, res: Response, next: NextFunction) => void,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void (async () => {
      try {
        req.log.warn({ deprecated: true, path: req.path }, "deprecated un-versioned public path");
        if (!(await resolveTenantSlug(req, res, DEFAULT_PUBLIC_SLUG))) return;
        if (afterResolve) {
          afterResolve(req, res, (err) => {
            if (err) {
              next(err);
              return;
            }
            void handler(req, res).catch(next);
          });
          return;
        }
        await handler(req, res);
      } catch (err) {
        next(err);
      }
    })();
  };
}

router.get("/public/jobs", deprecated(listJobs));
router.post("/public/storage/uploads/request-url", uploadLimiter, deprecated(requestUploadUrl));
router.post("/public/applications", deprecated(submitApplication, applyLimiter));

export default router;
