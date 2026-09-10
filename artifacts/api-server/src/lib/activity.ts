import { activityLogTable, db } from "@workspace/db";

export async function logActivity(
  action: string,
  entityType: string,
  entityId: number | null,
  summary: string,
  actor: string = "Admin",
  tenantId: string,
): Promise<void> {
  await db.insert(activityLogTable).values({
    tenantId,
    action,
    entityType,
    entityId,
    summary,
    actor,
  });
}
