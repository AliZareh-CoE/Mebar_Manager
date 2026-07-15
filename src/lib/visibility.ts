import "server-only";
import { eq, or } from "drizzle-orm";
import { union } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import { projects, blockers, dataRequests, computeRequests } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/session";
import type { LabSettings } from "@/lib/settings";

/**
 * RESTRICTED visibility: managers see everything; researchers see only
 * projects they're involved in — owner, advisor, creator, blocker owner,
 * data-request requester/assignee, or compute requester. Involvement counts
 * across all statuses: resolving something you touched must not hide the
 * project's history from you.
 *
 * Returns null when unrestricted (manager, or OPEN mode).
 */
export async function visibleProjectIds(
  user: SessionUser,
  settings: LabSettings
): Promise<Set<string> | null> {
  if (user.role === "MANAGER" || settings.visibilityMode === "OPEN") return null;

  const rows = await union(
    db
      .select({ id: projects.id })
      .from(projects)
      .where(
        or(
          eq(projects.ownerId, user.id),
          eq(projects.advisorId, user.id),
          eq(projects.createdById, user.id)
        )
      ),
    db.select({ id: blockers.projectId }).from(blockers).where(eq(blockers.ownerId, user.id)),
    db
      .select({ id: dataRequests.projectId })
      .from(dataRequests)
      .where(or(eq(dataRequests.assigneeId, user.id), eq(dataRequests.requesterId, user.id))),
    db
      .select({ id: computeRequests.projectId })
      .from(computeRequests)
      .where(eq(computeRequests.requesterId, user.id))
  );

  return new Set(rows.map((r) => r.id));
}

export function isVisible(ids: Set<string> | null, projectId: string): boolean {
  return ids === null || ids.has(projectId);
}
