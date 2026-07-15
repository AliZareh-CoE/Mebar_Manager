import { describe, expect, it } from "vitest";
import {
  can,
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

  it("users.manage / settings.manage / decision.decide are manager-fixed", () => {
    for (const cap of ["users.manage", "settings.manage", "decision.decide"] as const) {
      expect(can(manager, cap, matrix)).toBe(true);
      expect(can(engineer, cap, matrix)).toBe(false);
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
