import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, gte } from "drizzle-orm";
import { addHours, format, formatDistanceStrict } from "date-fns";
import { db } from "@/lib/db";
import { updates } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { getPolicy } from "@/lib/policy-server";
import { isLabLeadership } from "@/lib/policy";
import { fightTypeHelpCopy, type HelpContext } from "@/lib/help-copy";
import { visibleProjectIds, visibleTaskIds } from "@/lib/visibility";
import { activationStateKeys, engineStateFlags, frozenStateKeys } from "@/lib/workflow";
import { expireOverdueDecisions } from "@/lib/maintenance";
import { loadLabSnapshot } from "@/lib/fight-data";
import { computeFightList, isOverdue } from "@/lib/fight-engine";
import { decideDecision } from "@/actions/decisions";
import { FightItemCard } from "@/components/fight-item-card";
import { FormDialog } from "@/components/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Meeting mode: the weekly agenda, generated from the record. Leadership-only
 * — the meeting is where the Fight List gets reviewed, decisions get decided,
 * and the week's movement gets seen. Print-friendly for a paper handout.
 */
export default async function MeetingPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isLabLeadership(me)) redirect("/");

  const settings = await getSettings();
  const workflow = settings.workflow;
  const policy = await getPolicy(me);
  const now = new Date();

  // Lazy-expire decisions the same way the Fight List does, so the agenda
  // never lists a decision that has already auto-proceeded.
  expireOverdueDecisions(now, settings.thresholds.decisionTimeoutHours, frozenStateKeys(workflow));

  const visibleIds = await visibleProjectIds(me, settings);
  const taskIds = await visibleTaskIds(me, settings);

  const snapshot = await loadLabSnapshot(
    visibleIds,
    activationStateKeys(workflow),
    Object.fromEntries(settings.serverTypes.map((s) => [s.key, s.label])),
    taskIds,
    true, // includeInitiatives — leadership
    "ALL", // underloadScope — leadership sees every researcher
    true // includeExternalData — leadership
  );
  const items = computeFightList(snapshot, now, settings.thresholds, {
    stateFlags: engineStateFlags(workflow),
    enabledRules: Object.fromEntries(
      Object.entries(settings.fightRules).map(([type, rule]) => [type, rule.enabled])
    ),
  });
  const helpCtx: HelpContext = {
    thresholds: settings.thresholds,
    performance: settings.performance,
    viewerSeesScores: true, // page is leadership-only (route rule + guard)
  };
  const projectTitleById = new Map(snapshot.projects.map((p) => [p.id, p.title]));

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [recentUpdates, allPapers] = await Promise.all([
    db.query.updates.findMany({
      where: gte(updates.createdAt, weekAgo),
      with: {
        author: { columns: { id: true, name: true } },
        project: { columns: { id: true, title: true } },
      },
      orderBy: (u) => desc(u.createdAt),
    }),
    // Papers have no single statusChangedAt — pull all (low-volume) and
    // filter in JS by the max of submittedAt/acceptedAt/closedAt.
    db.query.papers.findMany({
      with: {
        project: { columns: { id: true, title: true } },
      },
      orderBy: (p) => desc(p.createdAt),
    }),
  ]);

  const updatesByProject = new Map<string, { title: string; rows: typeof recentUpdates }>();
  for (const u of recentUpdates) {
    const g = updatesByProject.get(u.projectId) ?? { title: u.project.title, rows: [] };
    g.rows.push(u);
    updatesByProject.set(u.projectId, g);
  }
  const updateGroups = [...updatesByProject.entries()]
    .map(([projectId, g]) => ({ projectId, ...g }))
    .sort((a, b) => a.title.localeCompare(b.title));

  function lastStatusChange(p: (typeof allPapers)[number]): { at: Date; label: string } | null {
    const events: Array<[Date | null, string]> = [
      [p.submittedAt, "Submitted"],
      [p.acceptedAt, "Accepted"],
      [p.closedAt, p.status === "REJECTED" ? "Rejected" : p.status === "WITHDRAWN" ? "Withdrawn" : "Closed"],
    ];
    const inWindow = events
      .filter((e): e is [Date, string] => e[0] != null && e[0] >= weekAgo && e[0] <= now)
      .sort((a, b) => b[0].getTime() - a[0].getTime());
    return inWindow.length ? { at: inWindow[0][0], label: inWindow[0][1] } : null;
  }
  const changedPapers = allPapers
    .map((p) => ({ p, change: lastStatusChange(p) }))
    .filter(
      (x): x is { p: (typeof allPapers)[number]; change: { at: Date; label: string } } =>
        x.change != null
    )
    .sort((a, b) => b.change.at.getTime() - a.change.at.getTime());

  const openInitiatives = [...(snapshot.openInitiatives ?? [])].sort(
    (a, b) => a.deadline.getTime() - b.deadline.getTime()
  );

  function decideActionFor(d: (typeof snapshot.pendingDecisions)[number]) {
    if (!policy.can("decision.decide")) {
      return (
        <span className="text-sm text-muted-foreground">
          waiting on {d.requestedFrom?.name ?? "leadership"}
        </span>
      );
    }
    return (
      <FormDialog
        trigger={<Button size="sm">Decide now</Button>}
        title="Decide"
        description={d.question}
        submitLabel="Decide"
        successMessage="Decided. That's the job."
        action={decideDecision.bind(null, d.id)}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`mtg-dn-${d.id}`}>The decision</Label>
          <Textarea id={`mtg-dn-${d.id}`} name="decisionNote" required />
        </div>
      </FormDialog>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Print rules: hide the app chrome and force a white background when
          printing the agenda. Scoped to this page (unmounts on navigation). */}
      <style>{`
        @media print {
          header { display: none !important; }
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meeting mode</h1>
          <p className="text-sm text-muted-foreground">
            {`This week's agenda, built from the record — as of ${format(now, "MMM d, HH:mm")}.`}
          </p>
        </div>
        <p className="no-print text-sm text-muted-foreground">
          Use your browser&apos;s Print for a clean handout.
        </p>
      </div>

      {/* SECTION 1 — Fight list for review */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Fight list for review</h2>
          <p className="text-xs text-muted-foreground">
            Everything sitting still, worst first — the same list, read-only for the meeting.
          </p>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to fight — a healthy week.</p>
        ) : (
          settings.fightSectionOrder.map((type) => {
            const sectionItems = items.filter((i) => i.type === type);
            if (sectionItems.length === 0) return null;
            const rule = settings.fightRules[type];
            return (
              <div key={type} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {rule.title} ({sectionItems.length})
                </h3>
                {sectionItems.map((item) => (
                  <FightItemCard
                    key={`${item.type}-${item.entityId}`}
                    item={item}
                    help={fightTypeHelpCopy(item.type, helpCtx)}
                  />
                ))}
              </div>
            );
          })
        )}
      </section>

      {/* SECTION 2 — Updates this week */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Updates this week</h2>
          <p className="text-xs text-muted-foreground">
            Progress posted in the last 7 days, by project.
          </p>
        </div>
        {updateGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates posted this week.</p>
        ) : (
          updateGroups.map((g) => (
            <Card key={g.projectId}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={`/projects/${g.projectId}`} className="hover:underline">
                    {g.title}
                  </Link>
                </CardTitle>
                <CardDescription>
                  {g.rows.length} update{g.rows.length === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {g.rows.map((u) => (
                  <div key={u.id} className="text-sm">
                    <p className="text-xs text-muted-foreground">
                      {`${u.author.name} · ${format(u.createdAt, "MMM d")}`}
                    </p>
                    <p>
                      <span className="font-medium">Moved:</span> {u.whatMoved}
                    </p>
                    {u.whatsBlocked && (
                      <p>
                        <span className="font-medium">Blocked:</span> {u.whatsBlocked}
                      </p>
                    )}
                    <p>
                      <span className="font-medium">Next:</span> {u.whatsNext}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* SECTION 3 — Decisions to make */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Decisions to make</h2>
          <p className="text-xs text-muted-foreground">
            Pending calls with their auto-proceed countdown. Decide in the room.
          </p>
        </div>
        {snapshot.pendingDecisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No decisions waiting.</p>
        ) : (
          snapshot.pendingDecisions.map((d) => {
            const deadline = addHours(d.createdAt, settings.thresholds.decisionTimeoutHours);
            return (
              <Card key={d.id}>
                <CardContent className="flex flex-col gap-2 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{d.question}</p>
                    <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                      auto-proceeds in {formatDistanceStrict(deadline, now)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {`${projectTitleById.get(d.projectId) ?? "—"} · asked of ${d.requestedFrom?.name ?? "leadership"}`}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      Recommendation:
                    </span>{" "}
                    {d.recommendation}
                  </p>
                  <div className="no-print self-start">{decideActionFor(d)}</div>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      {/* SECTION 4 — Papers that moved */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Papers that moved</h2>
          <p className="text-xs text-muted-foreground">
            Papers whose status changed in the last 7 days.
          </p>
        </div>
        {changedPapers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No paper status changes this week.</p>
        ) : (
          changedPapers.map(({ p, change }) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4 text-sm shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {`${p.project.title}${p.venue ? " · " + p.venue : ""}`}
                </p>
              </div>
              <Badge variant="outline">{`${change.label} ${format(change.at, "MMM d")}`}</Badge>
            </div>
          ))
        )}
      </section>

      {/* SECTION 5 — Open initiatives */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Open initiatives</h2>
          <p className="text-xs text-muted-foreground">
            The lab&apos;s live big fights, soonest deadline first.
          </p>
        </div>
        {openInitiatives.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open initiatives.</p>
        ) : (
          openInitiatives.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4 text-sm shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{i.title}</p>
                <p className="text-xs text-muted-foreground">
                  {`Fighter: ${i.assignee?.name ?? "Unassigned"} · filed by ${i.requester.name}`}
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  isOverdue(i.deadline, now)
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                }
              >
                {format(i.deadline, "MMM d")}
              </Badge>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
