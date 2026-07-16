import "server-only";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

/**
 * Fire-and-forget admin audit trail. `void logAudit(...)` AFTER the mutation
 * commits — a failed insert must never block or fail the action. The app is
 * the record; the audit row is a courtesy trail for the admin.
 *
 * `action` is a dotted namespace ("project.transition", "settings.thresholds",
 * ...) so /admin/audit can prefix-filter on it.
 */
export async function logAudit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      actorId,
      action,
      entity,
      entityId,
      summary,
      meta: meta ?? null,
    });
  } catch (error) {
    console.error("[audit] log failed:", error);
  }
}
