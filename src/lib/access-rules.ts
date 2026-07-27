import { isLabLeadership } from "@/lib/policy";

/**
 * The single source of truth for "who sees what" — pure and DB-free so the
 * whole persona × surface grid is unit-testable. visibility.ts turns these
 * scopes into queries; pages and nav turn them into guards and links.
 */

export type AccessUser = {
  role: "ADMIN" | "MANAGER" | "ENGINEER" | "SECRETARY";
  isComputeCoordinator: boolean;
};

export type VisibilityMode = "RESTRICTED" | "OPEN";

export type ProjectScope = "ALL" | "INVOLVED" | "NONE";
export type TaskScope = "ALL" | "INVOLVED" | "OWN";

/**
 * Leadership (managers + the coordinator) sees every project; secretaries
 * see none, ever; engineers see their involvement unless the lab is OPEN.
 */
export function projectScope(user: AccessUser, mode: VisibilityMode): ProjectScope {
  if (user.role === "SECRETARY") return "NONE";
  if (isLabLeadership(user) || mode === "OPEN") return "ALL";
  return "INVOLVED";
}

/**
 * Secretaries see ONLY their own tasks — even in OPEN mode. Engineers see
 * tasks they filed plus tasks on their visible projects (all, when OPEN).
 */
export function taskScope(user: AccessUser, mode: VisibilityMode): TaskScope {
  if (user.role === "SECRETARY") return "OWN";
  if (isLabLeadership(user) || mode === "OPEN") return "ALL";
  return "INVOLVED";
}

export function canSeeInitiatives(user: AccessUser): boolean {
  return isLabLeadership(user);
}

export function canSeePerformance(user: AccessUser): boolean {
  return isLabLeadership(user);
}

/** Lab statistics: contribution counts are leadership reading, like scores. */
export function canSeeStats(user: AccessUser): boolean {
  return isLabLeadership(user);
}

export const GUARDED_ROUTES = [
  "/board",
  "/data",
  "/compute",
  "/tasks",
  "/handbook",
  "/sops",
  "/meeting",
  "/initiatives",
  "/performance",
  "/stats",
  "/admin/users",
  "/admin/feedback",
  "/admin/settings",
  "/admin/audit",
  "/admin/db",
] as const;
export type GuardedRoute = (typeof GUARDED_ROUTES)[number];

/** May this user load the route at all? (Everyone gets / and /account.) */
export function routeAllowed(user: AccessUser, route: GuardedRoute): boolean {
  switch (route) {
    case "/board":
    case "/data":
    case "/compute":
    // The protocol library is a read surface for everyone doing lab work.
    case "/sops":
      return user.role !== "SECRETARY";
    case "/tasks":
    // The handbook is the whole lab's front door — every role reads it.
    case "/handbook":
      return true;
    // Meeting mode is the leadership agenda — exactly the initiatives gate.
    case "/meeting":
    case "/initiatives":
      return canSeeInitiatives(user);
    case "/performance":
      return canSeePerformance(user);
    case "/stats":
      return canSeeStats(user);
    // The dangerous stuff — the ADMIN alone. Managers run projects; they
    // don't manage accounts, rewrite settings, or triage feedback.
    case "/admin/users":
    case "/admin/feedback":
    case "/admin/settings":
    case "/admin/audit":
    case "/admin/db":
      return user.role === "ADMIN";
  }
}
