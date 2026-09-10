import {
  pgTable,
  uuid,
  text,
  timestamp,
  customType,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Postgres `citext` (case-insensitive text). Requires the citext extension,
// which the Phase A migration creates. Tenant slugs are compared
// case-insensitively (e.g. "Amiga" and "amiga" resolve to the same tenant).
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

// Control-plane tenant catalog. One row per customer company (= one Clerk
// Organization once Clerk is wired). This is the ONLY table that is not
// tenant-scoped; every other table gains a `tenant_id` in Phase B.
export const tenantsTable = pgTable(
  "tenants",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // Nullable so we can seed tenants before Clerk Organizations are wired.
    clerkOrgId: text("clerk_org_id"),
    slug: citext("slug").notNull(),
    name: text("name").notNull(),
    tier: text("tier").notNull().default("pool"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clerkOrgIdUniq: unique("tenants_clerk_org_id_uniq").on(t.clerkOrgId),
    slugUniq: unique("tenants_slug_uniq").on(t.slug),
    tierCheck: check("tenants_tier_check", sql`${t.tier} IN ('pool', 'silo')`),
  }),
);

export type Tenant = typeof tenantsTable.$inferSelect;
export type InsertTenant = typeof tenantsTable.$inferInsert;
