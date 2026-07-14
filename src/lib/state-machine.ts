import { setup, transition } from "xstate";
import type { ProjectState } from "@/lib/db/schema";
import type { Role } from "@/lib/auth";

/**
 * Project lifecycle, modeled as an XState machine.
 *
 * PROPOSAL → SCOPING → ACTIVE ⇄ BLOCKED, ACTIVE|BLOCKED → PAUSED → ACTIVE,
 * ACTIVE → DONE, anything non-terminal → KILLED. DONE and KILLED are final.
 */

export type ProjectEvent =
  | { type: "APPROVE" }
  | { type: "START" }
  | { type: "BLOCK" }
  | { type: "UNBLOCK" }
  | { type: "PAUSE"; pauseReason: string; reviveDate: Date; now: Date }
  | { type: "REVIVE" }
  | { type: "COMPLETE" }
  | { type: "KILL" };

export type ProjectEventType = ProjectEvent["type"];

/** Deliberate, high-stakes calls belong to the manager. */
export const MANAGER_ONLY_EVENTS: ProjectEventType[] = ["APPROVE", "KILL"];

export const EVENT_LABELS: Record<ProjectEventType, string> = {
  APPROVE: "Approve for scoping",
  START: "Start project",
  BLOCK: "Mark blocked",
  UNBLOCK: "Unblock",
  PAUSE: "Pause",
  REVIVE: "Revive",
  COMPLETE: "Mark done",
  KILL: "Kill project",
};

export const projectMachine = setup({
  types: {
    events: {} as ProjectEvent,
  },
  guards: {
    validPause: ({ event }) =>
      event.type === "PAUSE" &&
      event.pauseReason.trim().length > 0 &&
      event.reviveDate.getTime() > event.now.getTime(),
  },
}).createMachine({
  id: "project",
  initial: "PROPOSAL",
  states: {
    PROPOSAL: { on: { APPROVE: { target: "SCOPING" }, KILL: { target: "KILLED" } } },
    SCOPING: { on: { START: { target: "ACTIVE" }, KILL: { target: "KILLED" } } },
    ACTIVE: {
      on: {
        BLOCK: { target: "BLOCKED" },
        PAUSE: { target: "PAUSED", guard: "validPause" },
        COMPLETE: { target: "DONE" },
        KILL: { target: "KILLED" },
      },
    },
    BLOCKED: {
      on: {
        UNBLOCK: { target: "ACTIVE" },
        PAUSE: { target: "PAUSED", guard: "validPause" },
        KILL: { target: "KILLED" },
      },
    },
    PAUSED: { on: { REVIVE: { target: "ACTIVE" }, KILL: { target: "KILLED" } } },
    DONE: { type: "final" },
    KILLED: { type: "final" },
  },
});

export type ApplyResult =
  | { ok: true; next: ProjectState }
  | { ok: false; error: string };

/**
 * Validate and apply an event to a project state. Pure — the caller persists
 * the result.
 */
export function applyEvent(
  state: ProjectState,
  event: ProjectEvent,
  actorRole: Role
): ApplyResult {
  if (MANAGER_ONLY_EVENTS.includes(event.type) && actorRole !== "MANAGER") {
    return { ok: false, error: "Only a manager can do that." };
  }

  const events = eventsForState(state);
  if (!events.includes(event.type)) {
    return { ok: false, error: `"${EVENT_LABELS[event.type]}" is not possible from ${state}.` };
  }

  if (event.type === "PAUSE") {
    if (!event.pauseReason.trim()) {
      return { ok: false, error: "Pausing requires a reason." };
    }
    if (event.reviveDate.getTime() <= event.now.getTime()) {
      return { ok: false, error: "Pausing requires a future revive date." };
    }
  }

  const snapshot = projectMachine.resolveState({ value: state });
  const [next] = transition(projectMachine, snapshot, event);
  const nextState = next.value as ProjectState;

  if (nextState === state) {
    return { ok: false, error: `"${EVENT_LABELS[event.type]}" is not possible from ${state}.` };
  }
  return { ok: true, next: nextState };
}

/** Event types available from a state (before role filtering). */
export function eventsForState(state: ProjectState): ProjectEventType[] {
  const stateConfig = projectMachine.config.states?.[state];
  return Object.keys(stateConfig?.on ?? {}) as ProjectEventType[];
}

/** Events a given role may fire from a state — drives the UI buttons. */
export function availableEvents(state: ProjectState, role: Role): ProjectEventType[] {
  return eventsForState(state).filter(
    (e) => role === "MANAGER" || !MANAGER_ONLY_EVENTS.includes(e)
  );
}
