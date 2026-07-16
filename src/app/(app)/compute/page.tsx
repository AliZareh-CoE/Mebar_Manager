import { MECHANISM_HELP, type HelpContext } from "@/lib/help-copy";
import { InfoHint } from "@/components/info-hint";
import { redirect } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, type ComputeRequestStatus } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { visibleProjectIds, isVisible } from "@/lib/visibility";
import { COMPUTE_STATUS_LABELS } from "@/lib/labels";
import { ComputeRequestCard } from "@/components/compute-request-card";

export const dynamic = "force-dynamic";

const GROUP_ORDER: ComputeRequestStatus[] = ["PENDING", "APPROVED", "COMPLETED", "DENIED", "WITHDRAWN"];

const GROUP_BLURBS: Record<ComputeRequestStatus, string> = {
  PENDING: "The coordinator's queue. Nothing here auto-proceeds.",
  APPROVED: "Hours ticking. Results summaries come due when the window closes.",
  COMPLETED: "Results in — outcomes vs. expectations, on the record.",
  DENIED: "Denied with reasons. Better requests come back.",
  WITHDRAWN: "Withdrawn by their requesters before a decision.",
};

export default async function ComputePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "SECRETARY") redirect("/tasks");
  const settings = await getSettings();
  const visibleIds = await visibleProjectIds(me, settings);

  const [allRequests, coordinator] = await Promise.all([
    db.query.computeRequests.findMany({
      with: {
        project: { columns: { id: true, title: true } },
        requester: { columns: { id: true, name: true } },
      },
      orderBy: (cr) => desc(cr.createdAt),
    }),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(eq(user.isComputeCoordinator, true), ne(user.banned, true)))
      .get(),
  ]);

  const requests = allRequests.filter((r) => isVisible(visibleIds, r.projectId));
  const serverTypeLabels = Object.fromEntries(
    settings.serverTypes.map((s) => [s.key, s.label])
  );
  const practiceLabels = Object.fromEntries(
    settings.practices.map((p) => [p.key, p.label])
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Compute
          <InfoHint
            {...MECHANISM_HELP.computeBar({
              thresholds: settings.thresholds,
              performance: settings.performance,
            } satisfies HelpContext)}
          />
        </h1>
        <p className="text-sm text-muted-foreground">
          {coordinator ? (
            <>
              Every request, decided by <span className="text-foreground/80">{coordinator.name}</span> —
              approvals grant access (NVIDIA Brev) with an expiry window.
            </>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              No compute coordinator is set — managers can take the role on the
              People page. Requests queue until then.
            </span>
          )}
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No compute requests yet. Request from a project page — with a plan.
        </p>
      ) : (
        GROUP_ORDER.map((status) => {
          const group = requests.filter((r) => r.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} className="flex flex-col gap-3">
              <div>
                <h2 className="font-medium">
                  {COMPUTE_STATUS_LABELS[status]}{" "}
                  <span className="text-muted-foreground">({group.length})</span>
                </h2>
                <p className="text-xs text-muted-foreground">{GROUP_BLURBS[status]}</p>
              </div>
              {group.map((r) => (
                <ComputeRequestCard
                  key={r.id}
                  request={r}
                  requesterName={r.requester.name}
                  me={me}
                  projectTitle={r.project.title}
                  serverTypeLabel={serverTypeLabels[r.serverType] ?? r.serverType}
                  practiceLabels={practiceLabels}
                />
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
