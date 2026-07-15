import "server-only";
import { eq, or } from "drizzle-orm";
import { union } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import {
  projects,
  blockers,
  dataRequests,
  computeRequests,
  tasks,
  projectPeople,
} from "@/lib/db/schema";
import type { SessionUser } from "@/lib/session";
import { getSettings, type LabSettings } from "@/lib/settings";
import { projectScope, taskScope } from "@/lib/access-rules";

/**
 * RESTRICTED visibility: managers see everything; researchers see only
 * projects they're involved in — owner, advisor, creator, blocker owner,
 * data-request requester/assignee, compute requester, or listed on the
 * project's people lineup (PI / first author / contributor). Involvement
 * counts across all statuses: resolving something you touched must not hide
 * the project's history from you.
 *
 * Secretaries see NO projects at all (even in OPEN mode) — their world is
 * their own task list.
 *
 * Returns null when unrestricted (manager, or OPEN mode).
 */
export async function visibleProjectIds(
  user: SessionUser,
  settings: LabSettings
): Promise<Set<string> | null> {
  const scope = projectScope(user, settings.visibilityMode);
  if (scope === "NONE") return new Set();
  if (scope === "ALL") return null;

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
      .where(eq(computeRequests.requesterId, user.id)),
    db
      .select({ id: projectPeople.projectId })
      .from(projectPeople)
      .where(eq(projectPeople.userId, user.id))
  );

  return new Set(rows.map((r) => r.id));
}

export function isVisible(ids: Set<string> | null, projectId: string): boolean {
  return ids === null || ids.has(projectId);
}

/**
 * Task visibility. null = sees all tasks (managers, or OPEN mode for
 * engineers). Secretaries see ONLY their own tasks (assigned or filed),
 * even in OPEN mode. Engineers additionally see tasks they filed and tasks
 * linked to their visible projects.
 */
export async function visibleTaskIds(
  user: SessionUser,
  settings: LabSettings
): Promise<Set<string> | null> {
  const scope = taskScope(user, settings.visibilityMode);
  if (scope === "ALL") return null;

  if (scope === "OWN") {
    const rows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(or(eq(tasks.assigneeId, user.id), eq(tasks.requesterId, user.id)));
    return new Set(rows.map((r) => r.id));
  }

  const projectIds = await visibleProjectIds(user, settings);
  const rows = await db
    .select({ id: tasks.id, projectId: tasks.projectId, requesterId: tasks.requesterId })
    .from(tasks);
  return new Set(
    rows
      .filter(
        (t) =>
          t.requesterId === user.id ||
          (t.projectId !== null && isVisible(projectIds, t.projectId))
      )
      .map((t) => t.id)
  );
}

/**
 * Action-side guard: mutations must respect the same visibility as pages —
 * a researcher who guesses a hidden project's id must not be able to write
 * to it. Cheap for managers/OPEN mode (no query).
 */
export async function canAccessProject(
  user: SessionUser,
  projectId: string
): Promise<boolean> {
  const settings = await getSettings();
  const ids = await visibleProjectIds(user, settings);
  return isVisible(ids, projectId);
}
