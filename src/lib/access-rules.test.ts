import { describe, expect, it } from "vitest";
import {
  GUARDED_ROUTES,
  canSeeInitiatives,
  canSeePerformance,
  projectScope,
  routeAllowed,
  taskScope,
  type AccessUser,
  type GuardedRoute,
  type ProjectScope,
  type TaskScope,
  type VisibilityMode,
} from "./access-rules";

/**
 * The full persona × surface contract, asserted as a grid. If a product
 * decision changes who sees what, this file is the place that must change —
 * loudly.
 */

const PERSONAS = {
  adminCoordinator: { role: "ADMIN", isComputeCoordinator: true }, // the PI's multi-hat
  admin: { role: "ADMIN", isComputeCoordinator: false },
  manager: { role: "MANAGER", isComputeCoordinator: false },
  managerCoordinator: { role: "MANAGER", isComputeCoordinator: true },
  engineer: { role: "ENGINEER", isComputeCoordinator: false },
  engineerCoordinator: { role: "ENGINEER", isComputeCoordinator: true },
  secretary: { role: "SECRETARY", isComputeCoordinator: false },
} satisfies Record<string, AccessUser>;
type Persona = keyof typeof PERSONAS;

describe("project visibility scope", () => {
  const expected: Record<Persona, Record<VisibilityMode, ProjectScope>> = {
    adminCoordinator: { RESTRICTED: "ALL", OPEN: "ALL" },
    admin: { RESTRICTED: "ALL", OPEN: "ALL" },
    manager: { RESTRICTED: "ALL", OPEN: "ALL" },
    managerCoordinator: { RESTRICTED: "ALL", OPEN: "ALL" },
    engineer: { RESTRICTED: "INVOLVED", OPEN: "ALL" },
    engineerCoordinator: { RESTRICTED: "ALL", OPEN: "ALL" }, // coordinators see everything
    secretary: { RESTRICTED: "NONE", OPEN: "NONE" }, // even in OPEN mode
  };
  for (const [persona, byMode] of Object.entries(expected) as [
    Persona,
    Record<VisibilityMode, ProjectScope>,
  ][]) {
    for (const mode of ["RESTRICTED", "OPEN"] as const) {
      it(`${persona} in ${mode} → ${byMode[mode]}`, () => {
        expect(projectScope(PERSONAS[persona], mode)).toBe(byMode[mode]);
      });
    }
  }
});

describe("task visibility scope", () => {
  const expected: Record<Persona, Record<VisibilityMode, TaskScope>> = {
    adminCoordinator: { RESTRICTED: "ALL", OPEN: "ALL" },
    admin: { RESTRICTED: "ALL", OPEN: "ALL" },
    manager: { RESTRICTED: "ALL", OPEN: "ALL" },
    managerCoordinator: { RESTRICTED: "ALL", OPEN: "ALL" },
    engineer: { RESTRICTED: "INVOLVED", OPEN: "ALL" },
    engineerCoordinator: { RESTRICTED: "ALL", OPEN: "ALL" },
    secretary: { RESTRICTED: "OWN", OPEN: "OWN" }, // own tasks only, always
  };
  for (const [persona, byMode] of Object.entries(expected) as [
    Persona,
    Record<VisibilityMode, TaskScope>,
  ][]) {
    for (const mode of ["RESTRICTED", "OPEN"] as const) {
      it(`${persona} in ${mode} → ${byMode[mode]}`, () => {
        expect(taskScope(PERSONAS[persona], mode)).toBe(byMode[mode]);
      });
    }
  }
});

describe("leadership surfaces (initiatives, performance)", () => {
  const expected: Record<Persona, boolean> = {
    adminCoordinator: true,
    admin: true,
    manager: true,
    managerCoordinator: true,
    engineer: false,
    engineerCoordinator: true,
    secretary: false,
  };
  for (const [persona, allowed] of Object.entries(expected) as [Persona, boolean][]) {
    it(`${persona} → ${allowed}`, () => {
      expect(canSeeInitiatives(PERSONAS[persona])).toBe(allowed);
      expect(canSeePerformance(PERSONAS[persona])).toBe(allowed);
    });
  }
});

describe("route access grid", () => {
  const expected: Record<Persona, Record<GuardedRoute, boolean>> = {
    adminCoordinator: {
      "/board": true, "/data": true, "/compute": true, "/tasks": true,
      "/initiatives": true, "/performance": true,
      "/admin/users": true, "/admin/feedback": true, "/admin/settings": true,
    },
    admin: {
      "/board": true, "/data": true, "/compute": true, "/tasks": true,
      "/initiatives": true, "/performance": true,
      "/admin/users": true, "/admin/feedback": true, "/admin/settings": true,
    },
    // Managers run the lab's work — the dangerous stuff is the admin's alone.
    manager: {
      "/board": true, "/data": true, "/compute": true, "/tasks": true,
      "/initiatives": true, "/performance": true,
      "/admin/users": false, "/admin/feedback": false, "/admin/settings": false,
    },
    managerCoordinator: {
      "/board": true, "/data": true, "/compute": true, "/tasks": true,
      "/initiatives": true, "/performance": true,
      "/admin/users": false, "/admin/feedback": false, "/admin/settings": false,
    },
    engineer: {
      "/board": true, "/data": true, "/compute": true, "/tasks": true,
      "/initiatives": false, "/performance": false,
      "/admin/users": false, "/admin/feedback": false, "/admin/settings": false,
    },
    engineerCoordinator: {
      "/board": true, "/data": true, "/compute": true, "/tasks": true,
      "/initiatives": true, "/performance": true,
      // Coordinator sees the lab, but admin pages stay admin-only.
      "/admin/users": false, "/admin/feedback": false, "/admin/settings": false,
    },
    secretary: {
      "/board": false, "/data": false, "/compute": false, "/tasks": true,
      "/initiatives": false, "/performance": false,
      "/admin/users": false, "/admin/feedback": false, "/admin/settings": false,
    },
  };

  for (const [persona, routes] of Object.entries(expected) as [
    Persona,
    Record<GuardedRoute, boolean>,
  ][]) {
    for (const route of GUARDED_ROUTES) {
      it(`${persona} ${routes[route] ? "may" : "may NOT"} load ${route}`, () => {
        expect(routeAllowed(PERSONAS[persona], route)).toBe(routes[route]);
      });
    }
  }
});
