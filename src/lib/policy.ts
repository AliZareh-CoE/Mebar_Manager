import { z } from "zod";
import type { Role } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";

// Mirrors ROLES in lib/auth.ts — inlined so this pure module never imports
// the auth/db stack (keeps unit tests and client bundles clean).
// The matrix stays two-valued: "ENGINEER" reads as "everyone of at least
// engineer rank", which secretaries (rank 0) never reach — they act only
// through involvement (their own tasks).
const MATRIX_ROLES = ["MANAGER", "ENGINEER"] as const;

const ROLE_RANK: Record<Role, number> = { MANAGER: 2, ENGINEER: 1, SECRETARY: 0 };

/**
 * Central authorization. Every server action asks `can()` — never inline
 * role checks. Two kinds of capability:
 *
 * - FIXED: hard rules that admins cannot loosen (user management, settings,
 *   deciding decisions, and compute.decide which belongs to THE coordinator
 *   with no manager fallback).
 * - CONFIGURABLE: each has a minimum role, editable in the admin settings
 *   permission matrix.
 *
 * `ctx.involvedUserIds` short-circuits: people always may act on their own
 * things (the author edits their update, the requester withdraws their
 * request, the owner edits their project).
 */

export const CONFIGURABLE_CAPABILITIES = [
  "project.create",
  "project.editAny",
  "project.approve",
  "project.kill",
  "blocker.edit",
  "blocker.cancel",
  "milestone.edit",
  "milestone.cancel",
  "decision.cancel",
  "update.edit",
  "dataRequest.edit",
  "dataRequest.cancel",
  "computeRequest.withdraw",
  "task.edit",
  "task.cancel",
  "projectPeople.edit",
] as const;
export type ConfigurableCapability = (typeof CONFIGURABLE_CAPABILITIES)[number];

export type FixedCapability =
  | "users.manage"
  | "settings.manage"
  | "decision.decide"
  | "compute.decide"
  | "dataRequest.deliver"
  // Lab-leadership surface (initiatives = the weekly meeting's big fights).
  | "initiative.file"
  | "initiative.edit";

/**
 * Managers and the compute coordinator — the people who run the lab's big
 * fights, see everything, and appear on /performance. Pure so nav, pages,
 * loaders, and tests can all share it.
 */
export function isLabLeadership(
  u: Pick<SessionUser, "role" | "isComputeCoordinator">
): boolean {
  return u.role === "MANAGER" || u.isComputeCoordinator;
}

export type Capability = ConfigurableCapability | FixedCapability;

export const CAPABILITY_LABELS: Record<ConfigurableCapability, string> = {
  "project.create": "Create project proposals",
  "project.editAny": "Edit any project (owners/advisors always can)",
  "project.approve": "Approve proposals for scoping",
  "project.kill": "Kill projects",
  "blocker.edit": "Edit any blocker",
  "blocker.cancel": "Cancel blockers",
  "milestone.edit": "Edit milestones",
  "milestone.cancel": "Cancel milestones",
  "decision.cancel": "Withdraw pending decisions",
  "update.edit": "Edit others' updates (authors always can)",
  "dataRequest.edit": "Edit any data request (requester/assignee always can)",
  "dataRequest.cancel": "Cancel data requests",
  "computeRequest.withdraw": "Withdraw others' compute requests (requesters always can)",
  "task.edit": "Edit any task (requester/assignee always can)",
  "task.cancel": "Cancel tasks (requester/assignee always can)",
  "projectPeople.edit": "Edit a project's people lineup (owner/advisor always can)",
};

export type MatrixRole = (typeof MATRIX_ROLES)[number];

export const DEFAULT_MATRIX: Record<ConfigurableCapability, MatrixRole> = {
  "project.create": "ENGINEER",
  "project.editAny": "ENGINEER",
  "project.approve": "MANAGER",
  "project.kill": "MANAGER",
  "blocker.edit": "ENGINEER",
  "blocker.cancel": "ENGINEER",
  "milestone.edit": "ENGINEER",
  "milestone.cancel": "ENGINEER",
  "decision.cancel": "ENGINEER",
  "update.edit": "MANAGER",
  "dataRequest.edit": "ENGINEER",
  "dataRequest.cancel": "ENGINEER",
  "computeRequest.withdraw": "MANAGER",
  "task.edit": "ENGINEER",
  "task.cancel": "ENGINEER",
  "projectPeople.edit": "ENGINEER",
};

export const permissionMatrixSchema = z.object(
  Object.fromEntries(
    CONFIGURABLE_CAPABILITIES.map((c) => [c, z.enum(MATRIX_ROLES).default(DEFAULT_MATRIX[c])])
  ) as Record<ConfigurableCapability, z.ZodDefault<z.ZodEnum<{ MANAGER: "MANAGER"; ENGINEER: "ENGINEER" }>>>
);
export type PermissionMatrix = z.infer<typeof permissionMatrixSchema>;

export type PolicyCtx = {
  /** Users who own/authored/requested the thing — they always may act on it. */
  involvedUserIds?: (string | null | undefined)[];
};

/** Pure. The matrix is passed in so unit tests need no DB. */
export function can(
  user: SessionUser,
  capability: Capability,
  matrix: PermissionMatrix,
  ctx?: PolicyCtx
): boolean {
  if (ctx?.involvedUserIds?.includes(user.id)) return true;

  switch (capability) {
    case "users.manage":
    case "settings.manage":
    case "decision.decide":
      return user.role === "MANAGER";
    // THE coordinator decides compute — deliberately no manager fallback.
    case "compute.decide":
      return user.isComputeCoordinator;
    case "dataRequest.deliver":
      return user.role === "MANAGER"; // assignee covered by involvement
    case "initiative.file":
      return isLabLeadership(user);
    case "initiative.edit":
      return user.role === "MANAGER"; // requester/assignee covered by involvement
    default:
      // Rank comparison, not equality: "ENGINEER" in the matrix means
      // "engineer or above" — secretaries (rank 0) are always below it.
      return ROLE_RANK[user.role] >= ROLE_RANK[matrix[capability]];
  }
}
