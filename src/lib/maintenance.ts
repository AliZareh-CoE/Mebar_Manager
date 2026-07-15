import "server-only";
import { and, eq, lt, notInArray, inArray } from "drizzle-orm";
import { subHours } from "date-fns";
import { db } from "@/lib/db";
import { decisions, projects } from "@/lib/db/schema";
import { DECISION_TIMEOUT_HOURS } from "@/lib/thresholds";
import { frozenStateKeys } from "@/lib/workflow";
import { DEFAULT_WORKFLOW } from "@/lib/settings-defaults";

/**
 * The one auto-mutation in the app: pending decisions older than the timeout
 * flip to AUTO_PROCEEDED — the engineer goes ahead with their own
 * recommendation. Idempotent, one indexed UPDATE; called lazily from the
 * read paths.
 *
 * Decisions on frozen projects (paused/terminal workflow states) are exempt:
 * nobody is proceeding with anything on a paused project, so the clock only
 * applies while the project is moving.
 */
export function expireOverdueDecisions(
  now: Date = new Date(),
  timeoutHours: number = DECISION_TIMEOUT_HOURS,
  frozenStates: readonly string[] = frozenStateKeys(DEFAULT_WORKFLOW)
): void {
  db.update(decisions)
    .set({ status: "AUTO_PROCEEDED", decidedAt: now })
    .where(
      and(
        eq(decisions.status, "PENDING"),
        lt(decisions.createdAt, subHours(now, timeoutHours)),
        inArray(
          decisions.projectId,
          db
            .select({ id: projects.id })
            .from(projects)
            .where(
              frozenStates.length
                ? notInArray(projects.state, [...frozenStates])
                : undefined
            )
        )
      )
    )
    .run();
}
