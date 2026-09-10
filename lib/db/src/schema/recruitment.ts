import {
  pgTable,
  serial,
  text,
  timestamp,
  numeric,
  integer,
  date,
  uuid,
  unique,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.ts";
import { employeesTable } from "./employees.ts";

export const jobsTable = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    department: text("department").notNull(),
    location: text("location").notNull().default("London"),
    employmentType: text("employment_type").notNull().default("full_time"),
    salaryMin: numeric("salary_min", { precision: 12, scale: 2 }),
    salaryMax: numeric("salary_max", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("GBP"),
    description: text("description"),
    status: text("status").notNull().default("open"),
    closingDate: date("closing_date"),
    // Optional owning line manager (the "hiring manager"). Lets a manager see
    // the candidates applying for roles they own. ON DELETE SET NULL so removing
    // an employee never orphans a job.
    hiringManagerId: integer("hiring_manager_id").references(
      () => employeesTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Required so candidates can reference (tenant_id, job_id) compositely.
    tenantIdUniq: unique("jobs_tenant_id_uniq").on(t.tenantId, t.id),
    tenantHiringManagerIdx: index("jobs_tenant_hiring_manager_idx").on(
      t.tenantId,
      t.hiringManagerId,
    ),
  }),
);

export const candidatesTable = pgTable(
  "candidates",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    // Composite FK (tenant_id, job_id) -> jobs(tenant_id, id) ON DELETE SET NULL
    // lives in migration 0006. job_id stays nullable.
    jobId: integer("job_id"),
    currentStage: text("current_stage").notNull().default("new"),
    source: text("source").notNull().default("manual"),
    rightToWorkStatus: text("right_to_work_status").default("unknown"),
    linkedinUrl: text("linkedin_url"),
    currentCompany: text("current_company"),
    currentRole: text("current_role"),
    yearsExperience: integer("years_experience"),
    currentSalary: numeric("current_salary", { precision: 12, scale: 2 }),
    expectedSalary: numeric("expected_salary", { precision: 12, scale: 2 }),
    noticePeriod: text("notice_period"),
    lastBonusAmount: numeric("last_bonus_amount", { precision: 12, scale: 2 }),
    lastBonusPercentage: numeric("last_bonus_percentage", { precision: 5, scale: 2 }),
    currentPensionPercentage: numeric("current_pension_percentage", { precision: 5, scale: 2 }),
    referenceOneName: text("reference_one_name"),
    referenceOneCompany: text("reference_one_company"),
    referenceOneJobTitle: text("reference_one_job_title"),
    referenceOneEmail: text("reference_one_email"),
    referenceOnePhone: text("reference_one_phone"),
    referenceTwoName: text("reference_two_name"),
    referenceTwoCompany: text("reference_two_company"),
    referenceTwoJobTitle: text("reference_two_job_title"),
    referenceTwoEmail: text("reference_two_email"),
    referenceTwoPhone: text("reference_two_phone"),
    currency: text("currency").notNull().default("GBP"),
    coverLetter: text("cover_letter"),
    notes: text("notes"),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // hired_employee_id keeps its single-column FK (set null) — it points across
    // the recruitment/employee boundary and is not part of the composite-FK set.
    // Kept inline so drizzle-kit push and the SQL migrations agree on it.
    hiredEmployeeId: integer("hired_employee_id").references(
      () => employeesTable.id,
      { onDelete: "set null" },
    ),
    rejectedReason: text("rejected_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Required so candidate children can reference (tenant_id, id) compositely.
    tenantIdUniq: unique("candidates_tenant_id_uniq").on(t.tenantId, t.id),
    // Composite FK (tenant_id, job_id) -> jobs(tenant_id, id) ON DELETE SET NULL.
    jobFk: foreignKey({
      columns: [t.tenantId, t.jobId],
      foreignColumns: [jobsTable.tenantId, jobsTable.id],
      name: "candidates_job_id_tenant_fk",
    }).onDelete("set null"),
    tenantStatusIdx: index("candidates_tenant_stage_idx").on(
      t.tenantId,
      t.currentStage,
    ),
    tenantJobIdx: index("candidates_tenant_job_idx").on(t.tenantId, t.jobId),
  }),
);

export const candidateDocumentsTable = pgTable(
  "candidate_documents",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, candidate_id) -> candidates(tenant_id, id)
    // ON DELETE CASCADE, declared below.
    candidateId: integer("candidate_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("cv"),
    objectPath: text("object_path").notNull(),
    fileSize: integer("file_size"),
    mimeType: text("mime_type"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    candidateFk: foreignKey({
      columns: [t.tenantId, t.candidateId],
      foreignColumns: [candidatesTable.tenantId, candidatesTable.id],
      name: "candidate_documents_candidate_id_tenant_fk",
    }).onDelete("cascade"),
    tenantCandidateIdx: index("candidate_documents_tenant_candidate_idx").on(
      t.tenantId,
      t.candidateId,
    ),
  }),
);

export const publicApplicationUploadsTable = pgTable(
  "public_application_uploads",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // This is deliberately separate from candidate_documents: rows here are
    // upload intents, while candidate_documents represents a submitted file.
    objectPath: text("object_path").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    // Prevent two cleanup workers from deleting an object while a submission
    // is claiming it. Stale leases can be retried by a later cleanup run.
    cleanupStartedAt: timestamp("cleanup_started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantObjectPathUnique: unique(
      "public_application_uploads_tenant_object_path_uniq",
    ).on(t.tenantId, t.objectPath),
    tenantExpiryIdx: index("public_application_uploads_tenant_expiry_idx").on(
      t.tenantId,
      t.expiresAt,
    ),
  }),
);

export const publicUploadCleanupLeasesTable = pgTable(
  "public_upload_cleanup_leases",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
);
export const candidateStageHistoryTable = pgTable(
  "candidate_stage_history",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, candidate_id) -> candidates(tenant_id, id)
    // ON DELETE CASCADE, declared below.
    candidateId: integer("candidate_id").notNull(),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    note: text("note"),
    changedBy: text("changed_by").notNull().default("Admin"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    candidateFk: foreignKey({
      columns: [t.tenantId, t.candidateId],
      foreignColumns: [candidatesTable.tenantId, candidatesTable.id],
      name: "candidate_stage_history_candidate_id_tenant_fk",
    }).onDelete("cascade"),
    tenantCandidateIdx: index(
      "candidate_stage_history_tenant_candidate_idx",
    ).on(t.tenantId, t.candidateId),
  }),
);

export const interviewsTable = pgTable(
  "interviews",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, candidate_id) -> candidates(tenant_id, id)
    // ON DELETE CASCADE, declared below.
    candidateId: integer("candidate_id").notNull(),
    type: text("type").notNull().default("phone"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    location: text("location"),
    interviewerName: text("interviewer_name").notNull(),
    status: text("status").notNull().default("scheduled"),
    outcome: text("outcome"),
    score: integer("score"),
    feedback: text("feedback"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    candidateFk: foreignKey({
      columns: [t.tenantId, t.candidateId],
      foreignColumns: [candidatesTable.tenantId, candidatesTable.id],
      name: "interviews_candidate_id_tenant_fk",
    }).onDelete("cascade"),
    tenantCandidateIdx: index("interviews_tenant_candidate_idx").on(
      t.tenantId,
      t.candidateId,
    ),
  }),
);

export const offersTable = pgTable(
  "offers",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Composite FK (tenant_id, candidate_id) -> candidates(tenant_id, id)
    // ON DELETE CASCADE, declared below.
    candidateId: integer("candidate_id").notNull(),
    salary: numeric("salary", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("GBP"),
    startDate: date("start_date").notNull(),
    employmentType: text("employment_type").notNull().default("full_time"),
    contractType: text("contract_type").notNull().default("permanent"),
    benefitsNote: text("benefits_note"),
    status: text("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    declinedReason: text("declined_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    candidateFk: foreignKey({
      columns: [t.tenantId, t.candidateId],
      foreignColumns: [candidatesTable.tenantId, candidatesTable.id],
      name: "offers_candidate_id_tenant_fk",
    }).onDelete("cascade"),
    tenantCandidateIdx: index("offers_tenant_candidate_idx").on(
      t.tenantId,
      t.candidateId,
    ),
  }),
);

export type Job = typeof jobsTable.$inferSelect;
export type InsertJob = typeof jobsTable.$inferInsert;
export type Candidate = typeof candidatesTable.$inferSelect;
export type InsertCandidate = typeof candidatesTable.$inferInsert;
export type CandidateDocument = typeof candidateDocumentsTable.$inferSelect;
export type PublicApplicationUpload =
  typeof publicApplicationUploadsTable.$inferSelect;
export type CandidateStageHistory =
  typeof candidateStageHistoryTable.$inferSelect;
export type Interview = typeof interviewsTable.$inferSelect;
export type Offer = typeof offersTable.$inferSelect;
