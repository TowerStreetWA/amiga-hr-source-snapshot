import {
  boolean,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantsTable } from "./tenants";

export const publicUploadCleanupFailureStatesTable = pgTable(
  "public_upload_cleanup_failure_states",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    // Stores only failure times; upload paths, filenames, and credentials never
    // enter the persisted alert state.
    failureTimestamps: jsonb("failure_timestamps")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    alertActive: boolean("alert_active").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);