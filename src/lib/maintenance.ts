import "server-only";
import { and, eq, lt, notInArray, inArray } from "drizzle-orm";
import { subHours } from "date-fns";
import { db } from "@/lib/db";
import { decisions, projects } from "@/lib/db/schema";
import { DECISION_TIMEOUT_HOURS } from "@/lib/thresholds";

/**
 * The one auto-mutation in the app: pending decisions older than 48h flip to
 * AUTO_PROCEEDED — the engineer goes ahead with their own recommendation.
 * Idempotent, one indexed UPDATE; called lazily from the read paths.
 *
 * Decisions on PAUSED/DONE/KILLED projects are exempt: nobody is proceeding
 * with anything on a paused project, so the 48h clock only applies while the
 * project is moving.
 */
export function expireOverdueDecisions(now: Date = new Date()): void {
  db.update(decisions)
    .set({ status: "AUTO_PROCEEDED", decidedAt: now })
    .where(
      and(
        eq(decisions.status, "PENDING"),
        lt(decisions.createdAt, subHours(now, DECISION_TIMEOUT_HOURS)),
        inArray(
          decisions.projectId,
          db
            .select({ id: projects.id })
            .from(projects)
            .where(notInArray(projects.state, ["PAUSED", "DONE", "KILLED"]))
        )
      )
    )
    .run();
}
