import type { ProjectPersonRole } from "@/lib/db/schema";

/**
 * Pure lineup logic — who is on a project and in what role. Kept free of
 * the DB so the activation checkpoint, actions, and tests share one brain.
 */

export interface LineupRow {
  id: string;
  userId: string | null;
  externalName: string | null;
  role: ProjectPersonRole;
}

/** The person a new lineup row points at: a member XOR an external name. */
export type PersonPick =
  | { kind: "member"; userId: string }
  | { kind: "external"; externalName: string };

/**
 * What the missing-people rule and the activation checkpoint both ask:
 * which required roles are absent? Returns human phrases ready for copy.
 */
export function missingRoleLabels(rows: Pick<LineupRow, "role">[]): string[] {
  const roles = new Set(rows.map((r) => r.role));
  return [
    ...(roles.has("PI") ? [] : ["a PI"]),
    ...(roles.has("FIRST_AUTHOR") ? [] : ["a first author"]),
  ];
}

export type RolePlan =
  | { op: "promote"; rowId: string; demoteRowId: string | null }
  | { op: "insert"; demoteRowId: string | null };

/**
 * Assigning PI or FIRST_AUTHOR keeps the invariant "exactly one of each"
 * with swap semantics: the previous holder is demoted to CONTRIBUTOR (they
 * stay on the lineup — being replaced as PI doesn't eject you from the
 * project), and a person already on the lineup is promoted in place rather
 * than duplicated.
 */
export function planRoleAssignment(
  rows: LineupRow[],
  role: Extract<ProjectPersonRole, "PI" | "FIRST_AUTHOR">,
  person: PersonPick
): RolePlan {
  const matches = (r: LineupRow) =>
    person.kind === "member"
      ? r.userId === person.userId
      : r.userId === null && r.externalName === person.externalName;

  const current = rows.find((r) => r.role === role) ?? null;
  // The same person may hold both PI and FIRST_AUTHOR (solo work), so the
  // row to promote is their non-target-role row only if they aren't already
  // holding the other required role — holding PI must not be *moved* to
  // FIRST_AUTHOR, it must be duplicated. Promote only CONTRIBUTOR rows.
  const existing = rows.find((r) => matches(r) && r.role === "CONTRIBUTOR");

  if (current && matches(current)) {
    // Already holds the role — nothing to do; model as promote-in-place.
    return { op: "promote", rowId: current.id, demoteRowId: null };
  }
  if (existing) {
    return { op: "promote", rowId: existing.id, demoteRowId: current?.id ?? null };
  }
  return { op: "insert", demoteRowId: current?.id ?? null };
}
