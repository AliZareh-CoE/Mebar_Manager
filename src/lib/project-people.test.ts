import { describe, it, expect } from "vitest";
import { missingRoleLabels, planRoleAssignment, type LineupRow } from "./project-people";

const row = (over: Partial<LineupRow>): LineupRow => ({
  id: "r1",
  userId: null,
  externalName: null,
  utfStudentId: null,
  role: "CONTRIBUTOR",
  ...over,
});

describe("missingRoleLabels", () => {
  it("reports both on an empty lineup", () => {
    expect(missingRoleLabels([])).toEqual(["a PI", "a first author"]);
  });

  it("reports only the absent role", () => {
    expect(missingRoleLabels([row({ role: "PI" })])).toEqual(["a first author"]);
    expect(missingRoleLabels([row({ role: "FIRST_AUTHOR" })])).toEqual(["a PI"]);
  });

  it("is satisfied by one of each regardless of contributors", () => {
    expect(
      missingRoleLabels([
        row({ id: "a", role: "PI" }),
        row({ id: "b", role: "FIRST_AUTHOR" }),
        row({ id: "c", role: "CONTRIBUTOR" }),
      ])
    ).toEqual([]);
  });
});

describe("planRoleAssignment", () => {
  const member = { kind: "member", userId: "u1" } as const;
  const external = { kind: "external", externalName: "Maya Chen" } as const;

  it("inserts into an empty lineup with nothing to demote", () => {
    expect(planRoleAssignment([], "PI", member)).toEqual({ op: "insert", demoteRowId: null });
  });

  it("demotes the previous holder when a new person takes the role", () => {
    const rows = [row({ id: "old", userId: "u9", role: "PI" })];
    expect(planRoleAssignment(rows, "PI", member)).toEqual({
      op: "insert",
      demoteRowId: "old",
    });
  });

  it("promotes an existing contributor instead of duplicating them", () => {
    const rows = [
      row({ id: "old", userId: "u9", role: "PI" }),
      row({ id: "c", userId: "u1", role: "CONTRIBUTOR" }),
    ];
    expect(planRoleAssignment(rows, "PI", member)).toEqual({
      op: "promote",
      rowId: "c",
      demoteRowId: "old",
    });
  });

  it("no-ops (promote in place) when the person already holds the role", () => {
    const rows = [row({ id: "pi", userId: "u1", role: "PI" })];
    expect(planRoleAssignment(rows, "PI", member)).toEqual({
      op: "promote",
      rowId: "pi",
      demoteRowId: null,
    });
  });

  it("lets one person hold PI and FIRST_AUTHOR via two rows", () => {
    // u1 is already PI; making them FIRST_AUTHOR must insert a second row,
    // not move the PI row.
    const rows = [row({ id: "pi", userId: "u1", role: "PI" })];
    expect(planRoleAssignment(rows, "FIRST_AUTHOR", member)).toEqual({
      op: "insert",
      demoteRowId: null,
    });
  });

  it("matches externals by name with no userId", () => {
    const rows = [
      row({ id: "x", externalName: "Maya Chen", role: "CONTRIBUTOR" }),
      row({ id: "m", userId: "u1", role: "FIRST_AUTHOR" }),
    ];
    expect(planRoleAssignment(rows, "FIRST_AUTHOR", external)).toEqual({
      op: "promote",
      rowId: "x",
      demoteRowId: "m",
    });
  });

  it("never mistakes a same-named UTF-student tag for an external", () => {
    // A roster tag named exactly like the external being promoted must stay
    // untouched: the plan inserts a fresh external row instead.
    const rows = [
      row({ id: "utf", externalName: "Maya Chen", utfStudentId: "s1", role: "UTF_STUDENT" }),
    ];
    expect(planRoleAssignment(rows, "PI", external)).toEqual({
      op: "insert",
      demoteRowId: null,
    });
  });

  it("missingRoleLabels ignores UTF students and contributors", () => {
    const rows = [
      row({ id: "utf", externalName: "Lily", utfStudentId: "s2", role: "UTF_STUDENT" }),
      row({ id: "c", userId: "u2", role: "CONTRIBUTOR" }),
    ];
    expect(missingRoleLabels(rows)).toEqual(["a PI", "a first author"]);
  });
});
