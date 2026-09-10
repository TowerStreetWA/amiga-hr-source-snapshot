import type { Request, Response } from "express";

export interface PublicJobRow {
  id: number;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  salaryMin: string | number | null;
  salaryMax: string | number | null;
  currency: string;
  description: string | null;
  status: string;
  closingDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PUBLIC_JOBS_UNAVAILABLE_MESSAGE =
  "Open roles are temporarily unavailable. Please try again.";

export async function listPublicJobs(
  req: Request,
  res: Response,
  loadRows: () => Promise<PublicJobRow[]>,
): Promise<void> {
  try {
    const rows = await loadRows();
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        department: r.department,
        location: r.location,
        employmentType: r.employmentType,
        salaryMin: r.salaryMin !== null ? Number(r.salaryMin) : null,
        salaryMax: r.salaryMax !== null ? Number(r.salaryMax) : null,
        currency: r.currency,
        description: r.description,
        status: r.status,
        closingDate: r.closingDate,
        candidateCount: 0,
        hiredCount: 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error loading public open roles");
    res.status(503).json({
      error: PUBLIC_JOBS_UNAVAILABLE_MESSAGE,
      retryable: true,
    });
  }
}