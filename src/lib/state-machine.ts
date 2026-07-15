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

/** Deliberate, high-stakes calls belong to the manager (default policy). */
export const MANAGER_ONLY_EVENTS: ProjectEventType[] = ["APPROVE", "KILL"];

/** Predicate deciding whether the actor may fire an event type. */
export type EventGate = (e: ProjectEventType) => boolean;

/** The default gate — mirrors the stock permission matrix. */
export const roleGate =
  (role: Role): EventGate =>
  (e) =>
    role === "MANAGER" || !MANAGER_ONLY_EVENTS.includes(e);

function normalizeGate(gate: Role | EventGate): EventGate {
  return typeof gate === "function" ? gate : roleGate(gate);
}

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

const DAY_MS = 86_400_000;

/**
 * UTC start of the day containing `d`. HTML date inputs parse as UTC
 * midnight, so comparing against the raw `now` instant would reject a
 * perfectly good "tomorrow" for users west of UTC. Same-UTC-day or later
 * counts as valid.
 */
function utcDayStart(d: Date): Date {
  return new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS);
}

export const projectMachine = setup({
  types: {
    events: {} as ProjectEvent,
  },
  guards: {
    validPause: ({ event }) =>
      event.type === "PAUSE" &&
      event.pauseReason.trim().length > 0 &&
      event.reviveDate.getTime() >= utcDayStart(event.now).getTime(),
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
  gate: Role | EventGate
): ApplyResult {
  if (!normalizeGate(gate)(event.type)) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  const events = eventsForState(state);
  if (!events.includes(event.type)) {
    return { ok: false, error: `"${EVENT_LABELS[event.type]}" is not possible from ${state}.` };
  }

  if (event.type === "PAUSE") {
    if (!event.pauseReason.trim()) {
      return { ok: false, error: "Pausing requires a reason." };
    }
    if (event.reviveDate.getTime() < utcDayStart(event.now).getTime()) {
      return { ok: false, error: "The revive date can't be in the past." };
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

/** Events the actor may fire from a state — drives the UI buttons. */
export function availableEvents(
  state: ProjectState,
  gate: Role | EventGate
): ProjectEventType[] {
  return eventsForState(state).filter(normalizeGate(gate));
}
