import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { getPolicy, transitionGate } from "@/lib/policy-server";
import { isLabLeadership, isManagerOrAbove } from "@/lib/policy";
import { fightTypeHelpCopy, type HelpContext } from "@/lib/help-copy";
import { visibleProjectIds, visibleTaskIds } from "@/lib/visibility";
import {
  activationStateKeys,
  engineStateFlags,
  frozenStateKeys,
  transitionDescriptors,
} from "@/lib/workflow";
import { expireOverdueDecisions } from "@/lib/maintenance";
import { loadLabSnapshot, loadAllBlockerCauses } from "@/lib/fight-data";
import {
  computeFightList,
  computeParetoData,
  type FightItem,
} from "@/lib/fight-engine";
import { decideDecision } from "@/actions/decisions";
import { pushMilestoneDueDate } from "@/actions/milestones";
import { submitComputeResults } from "@/actions/compute-requests";
import { ComputeDecisionDialogs } from "@/components/compute-request-card";
import { FightItemCard } from "@/components/fight-item-card";
import { FormDialog } from "@/components/form-dialog";
import { UpdateDialog } from "@/components/forms/update-dialog";
import { BlockerRowActions } from "@/components/blocker-row-actions";
import { DataRequestRowActions } from "@/components/data-request-row-actions";
import { InitiativeRowActions } from "@/components/initiative-row-actions";
import { MilestoneStatusButtons } from "@/components/milestone-status-buttons";
import { TaskRowActions } from "@/components/task-row-actions";
import { TransitionButtons } from "@/components/transition-buttons";
import { ParetoChart } from "@/components/pareto-chart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function FightListPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const settings = await getSettings();
  const workflow = settings.workflow;
  const policy = await getPolicy(me);
  expireOverdueDecisions(
    new Date(),
    settings.thresholds.decisionTimeoutHours,
    frozenStateKeys(workflow)
  );

  const visibleIds = await visibleProjectIds(me, settings);
  const taskIds = await visibleTaskIds(me, settings);
  const [snapshot, causes, allPeople] = await Promise.all([
    loadLabSnapshot(
      visibleIds,
      activationStateKeys(workflow),
      Object.fromEntries(settings.serverTypes.map((s) => [s.key, s.label])),
      taskIds,
      isLabLeadership(me),
      isLabLeadership(me) ? "ALL" : me.role === "ENGINEER" ? { selfId: me.id } : "NONE",
      isLabLeadership(me) || me.isDataAnalyst,
      isLabLeadership(me) ? "ALL" : { selfId: me.id }
    ),
    loadAllBlockerCauses(visibleIds),
    db
      .select({
        id: user.id,
        name: user.name,
        role: user.role,
        isDataAnalyst: user.isDataAnalyst,
        isComputeCoordinator: user.isComputeCoordinator,
      })
      .from(user)
      .where(ne(user.banned, true)),
  ]);

  const people = allPeople.map(({ id, name }) => ({ id, name }));
  const analysts = allPeople
    .filter((p) => p.isDataAnalyst)
    .map(({ id, name }) => ({ id, name }));
  const secretaries = allPeople
    .filter((p) => p.role === "SECRETARY")
    .map(({ id, name }) => ({ id, name }));

  const now = new Date();
  const enabledRules = Object.fromEntries(
    Object.entries(settings.fightRules).map(([type, rule]) => [type, rule.enabled])
  );
  const items = computeFightList(snapshot, now, settings.thresholds, {
    stateFlags: engineStateFlags(workflow),
    enabledRules,
  });
  const pareto = computeParetoData(causes);
  const helpCtx: HelpContext = {
    thresholds: settings.thresholds,
    performance: settings.performance,
    viewerSeesScores: isLabLeadership(me),
  };
  const projectStateById = new Map(snapshot.projects.map((p) => [p.id, p.state]));
  const blockerById = new Map(snapshot.openBlockers.map((b) => [b.id, b]));
  const milestoneById = new Map(snapshot.openMilestones.map((m) => [m.id, m]));
  const dataRequestById = new Map(snapshot.openDataRequests.map((dr) => [dr.id, dr]));
  const computeRequestById = new Map(snapshot.activeComputeRequests.map((cr) => [cr.id, cr]));
  const taskById = new Map((snapshot.openTasks ?? []).map((t) => [t.id, t]));
  const initiativeById = new Map(
    (snapshot.openInitiatives ?? []).map((i) => [i.id, i])
  );
  const leadership = allPeople
    .filter((p) => p.role === "MANAGER" || p.role === "ADMIN" || p.isComputeCoordinator)
    .map(({ id, name }) => ({ id, name }));

  function actionFor(item: FightItem) {
    switch (item.type) {
      case "STALLED_PROJECT":
        if (!item.projectId) return null;
        return (
          <UpdateDialog
            projectId={item.projectId}
            trigger={<Button size="sm">Add update</Button>}
          />
        );
      case "PAST_REVIVE":
        if (!item.projectId) return null;
        return (
          <TransitionButtons
            projectId={item.projectId}
            transitions={transitionDescriptors(
              workflow,
              projectStateById.get(item.projectId) ?? "PAUSED",
              transitionGate(me!, policy),
              isLabLeadership(me!)
            )}
          />
        );
      case "OVERDUE_BLOCKER":
      case "UNOWNED_BLOCKER": {
        const blocker = blockerById.get(item.entityId);
        if (!blocker) return null;
        return (
          <BlockerRowActions
            blockerId={blocker.id}
            status={blocker.status}
            ownerId={blocker.ownerId}
            people={people}
          />
        );
      }
      case "OVERDUE_DATA_REQUEST":
      case "UNOWNED_DATA_REQUEST": {
        const request = dataRequestById.get(item.entityId);
        if (!request) return null;
        return (
          <DataRequestRowActions
            requestId={request.id}
            status={request.status}
            assigneeId={request.assigneeId}
            analysts={analysts}
            meId={me!.id}
            meIsAnalyst={me!.isDataAnalyst}
          />
        );
      }
      case "PENDING_COMPUTE_REQUEST": {
        if (me!.isComputeCoordinator) {
          return <ComputeDecisionDialogs requestId={item.entityId} />;
        }
        return (
          <span className="text-sm text-muted-foreground">
            waiting on {item.responsible?.name ?? "no coordinator set"}
          </span>
        );
      }
      case "OVERDUE_COMPUTE_RESULTS": {
        const request = computeRequestById.get(item.entityId);
        if (!request) return null;
        if (me!.id !== request.requester.id && !isManagerOrAbove(me!)) {
          return (
            <span className="text-sm text-muted-foreground">
              waiting on {item.responsible?.name}
            </span>
          );
        }
        return (
          <FormDialog
            trigger={<Button size="sm">Submit results</Button>}
            title="Results summary"
            description="Final outcomes vs. what you expected. Confirm you've retrieved all data and checkpoints from the server."
            submitLabel="Submit"
            successMessage="Results submitted. Request closed."
            action={submitComputeResults.bind(null, item.entityId)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`rs-${item.entityId}`}>Summary</Label>
              <Textarea id={`rs-${item.entityId}`} name="resultsSummary" rows={4} required />
            </div>
          </FormDialog>
        );
      }
      case "PENDING_DECISION":
        if (!policy.can("decision.decide")) {
          return (
            <span className="text-sm text-muted-foreground">
              waiting on {item.responsible?.name}
            </span>
          );
        }
        return (
          <FormDialog
            trigger={<Button size="sm">Decide now</Button>}
            title="Decide"
            description={item.detail}
            submitLabel="Decide"
            successMessage="Decided. That's the job."
            action={decideDecision.bind(null, item.entityId)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`dn-${item.entityId}`}>The decision</Label>
              <Textarea id={`dn-${item.entityId}`} name="decisionNote" required />
            </div>
          </FormDialog>
        );
      case "OVERDUE_TASK":
      case "UNOWNED_TASK": {
        const task = taskById.get(item.entityId);
        if (!task) return null;
        return (
          <TaskRowActions
            taskId={task.id}
            status={task.status}
            assigneeId={task.assigneeId}
            secretaries={secretaries}
            meId={me!.id}
            meIsSecretary={me!.role === "SECRETARY"}
          />
        );
      }
      case "OVERDUE_INITIATIVE":
      case "UNOWNED_INITIATIVE": {
        const initiative = initiativeById.get(item.entityId);
        if (!initiative) return null;
        return (
          <InitiativeRowActions
            initiativeId={initiative.id}
            status={initiative.status}
            assigneeId={initiative.assigneeId}
            leadership={leadership}
            meId={me!.id}
          />
        );
      }
      case "MISSING_PROJECT_PEOPLE":
        if (!item.projectId) return null;
        return (
          <Button variant="outline" size="sm" render={<Link href={`/projects/${item.projectId}`} />}>
            Open People tab
          </Button>
        );
      case "SUBMISSION_TARGET_AT_RISK":
        if (!item.projectId) return null;
        return (
          <Button variant="outline" size="sm" render={<Link href={`/projects/${item.projectId}`} />}>
            Open the draft
          </Button>
        );
      case "OVERDUE_PERSON_MILESTONE":
        // Managed from the admin People page; members see the card only.
        return isManagerOrAbove(me!) ? (
          <Button variant="outline" size="sm" render={<Link href="/admin/users" />}>
            Manage milestones
          </Button>
        ) : null;
      case "UNDERLOADED_RESEARCHER":
        return (
          <Button variant="outline" size="sm" render={<Link href="/projects/new" />}>
            File a proposal
          </Button>
        );
      case "MISSED_MILESTONE": {
        const milestone = milestoneById.get(item.entityId);
        if (!milestone) return null;
        return (
          <div className="flex items-center gap-2">
            {/* Due dates feed the scoring — only manager rank moves them. */}
            {isManagerOrAbove(me!) && (
            <FormDialog
              trigger={<Button variant="outline" size="sm">Push date</Button>}
              title="Push the due date"
              description="Deliberately, with a new date — not by letting it rot."
              submitLabel="Push it"
              action={pushMilestoneDueDate.bind(null, item.entityId)}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor={`due-${item.entityId}`}>New due date</Label>
                <Input id={`due-${item.entityId}`} name="dueDate" type="date" required />
              </div>
            </FormDialog>
            )}
            <MilestoneStatusButtons milestoneId={milestone.id} status={milestone.status} />
          </div>
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {me.onboardedAt === null && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-300">
              New here? Get set up.
            </p>
            <p className="text-sm text-amber-700/80 dark:text-amber-300/80">
              Read the handbook and the guide, set your password, and
              acknowledge — three minutes.
            </p>
          </div>
          <Button size="sm" render={<Link href="/welcome" />}>
            Start onboarding
          </Button>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fight List</h1>
        <p className="text-sm text-muted-foreground">
          Everything that&apos;s sitting still, sorted by how long it&apos;s been
          getting away with it.
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <PartyPopper className="size-10 text-green-600 dark:text-green-400" />
            <p className="text-xl font-medium">Nothing to fight today.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              No stalls, no overdue blockers, no waiting decisions. This is what
              a healthy lab looks like — go do research.
            </p>
          </CardContent>
        </Card>
      ) : (
        settings.fightSectionOrder.map((type) => {
          const sectionItems = items.filter((i) => i.type === type);
          if (sectionItems.length === 0) return null;
          const section = settings.fightRules[type];
          return (
            <section key={type} className="flex flex-col gap-3">
              <div>
                <h2 className="text-base font-medium">
                  {section.title}{" "}
                  <span className="text-muted-foreground">({sectionItems.length})</span>
                </h2>
                <p className="text-xs text-muted-foreground">{section.blurb}</p>
              </div>
              {sectionItems.map((item) => (
                <FightItemCard
                  key={`${item.type}-${item.entityId}`}
                  item={item}
                  help={fightTypeHelpCopy(item.type, helpCtx)}
                  remind={isLabLeadership(me)}
                >
                  {actionFor(item)}
                </FightItemCard>
              ))}
            </section>
          );
        })
      )}

      {pareto.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>What keeps blocking us</CardTitle>
            <CardDescription>
              Every blocker ever raised, by cause. The tallest bar is the
              systemic fight worth picking at the monthly review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ParetoChart
              data={pareto}
              labels={Object.fromEntries(settings.causeTags.map((t) => [t.key, t.label]))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
