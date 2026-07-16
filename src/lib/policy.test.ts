import { describe, expect, it } from "vitest";
import {
  can,
  isLabLeadership,
  permissionMatrixSchema,
  DEFAULT_MATRIX,
  CONFIGURABLE_CAPABILITIES,
  type PermissionMatrix,
} from "./policy";
import type { SessionUser } from "./session";

const matrix: PermissionMatrix = permissionMatrixSchema.parse({});

const engineer: SessionUser = {
  id: "u-eng",
  name: "Eng",
  email: "e@lab",
  role: "ENGINEER",
  isDataAnalyst: false,
  digestOptOut: false,
  onboardedAt: null,
  isComputeCoordinator: false,
};
const manager: SessionUser = { ...engineer, id: "u-mgr", role: "MANAGER" };
const coordinator: SessionUser = { ...manager, id: "u-coord", isComputeCoordinator: true };

describe("defaults", () => {
  it("matrix parse fills every configurable capability", () => {
    for (const cap of CONFIGURABLE_CAPABILITIES) {
      expect(matrix[cap]).toBe(DEFAULT_MATRIX[cap]);
    }
  });

  it("engineers can do day-to-day things, not manager-gated ones", () => {
    expect(can(engineer, "project.create", matrix)).toBe(true);
    expect(can(engineer, "blocker.cancel", matrix)).toBe(true);
    expect(can(engineer, "project.kill", matrix)).toBe(false);
    expect(can(engineer, "project.approve", matrix)).toBe(false);
    expect(can(engineer, "update.edit", matrix)).toBe(false);
  });

  it("managers can do everything configurable", () => {
    for (const cap of CONFIGURABLE_CAPABILITIES) {
      expect(can(manager, cap, matrix)).toBe(true);
    }
  });
});

describe("matrix overrides", () => {
  it("tightening a capability to MANAGER locks engineers out", () => {
    const strict = { ...matrix, "blocker.cancel": "MANAGER" as const };
    expect(can(engineer, "blocker.cancel", strict)).toBe(false);
    expect(can(manager, "blocker.cancel", strict)).toBe(true);
  });

  it("loosening kill to ENGINEER lets engineers kill", () => {
    const loose = { ...matrix, "project.kill": "ENGINEER" as const };
    expect(can(engineer, "project.kill", loose)).toBe(true);
  });
});

describe("involvement short-circuit", () => {
  it("people always act on their own things", () => {
    expect(
      can(engineer, "update.edit", matrix, { involvedUserIds: [engineer.id] })
    ).toBe(true);
    expect(
      can(engineer, "computeRequest.withdraw", matrix, { involvedUserIds: [engineer.id] })
    ).toBe(true);
  });

  it("null/undefined involvement entries don't grant anything", () => {
    expect(
      can(engineer, "update.edit", matrix, { involvedUserIds: [null, undefined] })
    ).toBe(false);
  });
});

describe("fixed capabilities", () => {
  it("compute.decide belongs to the coordinator only — no manager fallback", () => {
    expect(can(coordinator, "compute.decide", matrix)).toBe(true);
    expect(can(manager, "compute.decide", matrix)).toBe(false);
    expect(can(engineer, "compute.decide", matrix)).toBe(false);
  });

  it("users.manage / settings.manage are ADMIN-fixed — managers are locked out", () => {
    const admin: SessionUser = { ...engineer, id: "u-admin", role: "ADMIN" };
    for (const cap of ["users.manage", "settings.manage"] as const) {
      expect(can(admin, cap, matrix)).toBe(true);
      expect(can(manager, cap, matrix)).toBe(false);
      expect(can(engineer, cap, matrix)).toBe(false);
    }
  });

  it("decision.decide is manager rank or above (admin included)", () => {
    const admin: SessionUser = { ...engineer, id: "u-admin", role: "ADMIN" };
    expect(can(admin, "decision.decide", matrix)).toBe(true);
    expect(can(manager, "decision.decide", matrix)).toBe(true);
    expect(can(engineer, "decision.decide", matrix)).toBe(false);
  });

  it("the admin passes every configurable capability via rank", () => {
    const admin: SessionUser = { ...engineer, id: "u-admin", role: "ADMIN" };
    const allManager = permissionMatrixSchema.parse(
      Object.fromEntries(CONFIGURABLE_CAPABILITIES.map((c) => [c, "MANAGER"]))
    );
    for (const cap of CONFIGURABLE_CAPABILITIES) {
      expect(can(admin, cap, allManager)).toBe(true);
    }
  });

  it("dataRequest.deliver: assignee via involvement, otherwise manager", () => {
    expect(
      can(engineer, "dataRequest.deliver", matrix, { involvedUserIds: [engineer.id] })
    ).toBe(true);
    expect(can(engineer, "dataRequest.deliver", matrix)).toBe(false);
    expect(can(manager, "dataRequest.deliver", matrix)).toBe(true);
  });
});

describe("SECRETARY rank semantics", () => {
  const secretary: SessionUser = { ...engineer, id: "u-sec", role: "SECRETARY" };

  it("secretaries are denied every configurable capability at both matrix values", () => {
    const allEngineer = permissionMatrixSchema.parse(
      Object.fromEntries(CONFIGURABLE_CAPABILITIES.map((c) => [c, "ENGINEER"]))
    );
    const allManager = permissionMatrixSchema.parse(
      Object.fromEntries(CONFIGURABLE_CAPABILITIES.map((c) => [c, "MANAGER"]))
    );
    for (const cap of CONFIGURABLE_CAPABILITIES) {
      expect(can(secretary, cap, allEngineer)).toBe(false);
      expect(can(secretary, cap, allManager)).toBe(false);
    }
  });

  it("involvement still lets a secretary act on their own tasks", () => {
    expect(
      can(secretary, "task.edit", matrix, { involvedUserIds: [secretary.id] })
    ).toBe(true);
    expect(
      can(secretary, "task.cancel", matrix, { involvedUserIds: ["someone-else"] })
    ).toBe(false);
  });

  it("secretaries never reach fixed manager capabilities", () => {
    expect(can(secretary, "users.manage", matrix)).toBe(false);
    expect(can(secretary, "settings.manage", matrix)).toBe(false);
    expect(can(secretary, "decision.decide", matrix)).toBe(false);
    expect(can(secretary, "compute.decide", matrix)).toBe(false);
  });

  it("engineers and managers keep task capabilities via rank", () => {
    expect(can(engineer, "task.edit", matrix)).toBe(true);
    expect(can(manager, "task.cancel", matrix)).toBe(true);
  });
});

describe("initiative capabilities (leadership = manager OR compute coordinator)", () => {
  const engineerCoordinator: SessionUser = {
    ...engineer,
    id: "u-eng-coord",
    isComputeCoordinator: true,
  };
  const secretary2: SessionUser = { ...engineer, id: "u-sec2", role: "SECRETARY" };

  it("isLabLeadership: managers and coordinators only", () => {
    expect(isLabLeadership(manager)).toBe(true);
    expect(isLabLeadership(coordinator)).toBe(true);
    expect(isLabLeadership(engineerCoordinator)).toBe(true);
    expect(isLabLeadership(engineer)).toBe(false);
    expect(isLabLeadership(secretary2)).toBe(false);
  });

  it("filing: leadership only", () => {
    expect(can(manager, "initiative.file", matrix)).toBe(true);
    expect(can(engineerCoordinator, "initiative.file", matrix)).toBe(true);
    expect(can(engineer, "initiative.file", matrix)).toBe(false);
    expect(can(secretary2, "initiative.file", matrix)).toBe(false);
  });

  it("editing: any manager, or involved requester/assignee", () => {
    expect(can(manager, "initiative.edit", matrix)).toBe(true);
    expect(
      can(engineerCoordinator, "initiative.edit", matrix, {
        involvedUserIds: [engineerCoordinator.id],
      })
    ).toBe(true);
    // An uninvolved non-manager coordinator can't edit others' initiatives.
    expect(
      can(engineerCoordinator, "initiative.edit", matrix, {
        involvedUserIds: ["someone-else"],
      })
    ).toBe(false);
  });
});
