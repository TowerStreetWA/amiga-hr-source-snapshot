import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  uuid,
  unique,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.ts";
import { employeesTable } from "./employees.ts";

/**
 * Application users — the bridge between a Clerk identity and an in-app role.
 *
 * Replit-managed Clerk has no Organizations or roles, so role/identity lives
 * here in our own database. One row per Clerk user per tenant. `role` is one of
 * `admin | manager | employee`. `employeeId` links the login to an `employees`
 * row (matched by email on first sign-in); it is nullable because a signed-in
 * user may not correspond to any staff record yet (the "no access yet" state).
 */
export const appUsersTable = pgTable(
  "app_users",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("employee"),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    // Composite FK (tenant_id, employee_id) -> employees(tenant_id, id).
    // Nullable: an authenticated user may not be linked to a staff record.
    employeeId: integer("employee_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clerkUserUniq: unique("app_users_tenant_clerk_user_uniq").on(
      t.tenantId,
      t.clerkUserId,
    ),
    employeeFk: foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employeesTable.tenantId, employeesTable.id],
      name: "app_users_employee_id_tenant_fk",
    }).onDelete("set null"),
    tenantRoleIdx: index("app_users_tenant_role_idx").on(t.tenantId, t.role),
    tenantEmailIdx: index("app_users_tenant_email_idx").on(t.tenantId, t.email),
  }),
);

export type AppUser = typeof appUsersTable.$inferSelect;
export type InsertAppUser = typeof appUsersTable.$inferInsert;

export const pendingAppAccessInvitesTable = pgTable(
  "pending_app_access_invites",
  {
    id: serial("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("employee"),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
    clerkInvitationId: text("clerk_invitation_id").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    invitationUniq: unique("pending_app_access_invites_clerk_invitation_uniq").on(
      t.clerkInvitationId,
    ),
    tenantEmailUniq: unique("pending_app_access_invites_tenant_email_uniq").on(
      t.tenantId,
      t.email,
    ),
    tenantEmailIdx: index("pending_app_access_invites_tenant_email_idx").on(
      t.tenantId,
      t.email,
    ),
  }),
);

export type PendingAppAccessInvite =
  typeof pendingAppAccessInvitesTable.$inferSelect;
