import { PartyPopper } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { expireOverdueDecisions } from "@/lib/maintenance";
import { loadLabSnapshot, loadAllBlockerCauses } from "@/lib/fight-data";
import {
  computeFightList,
  computeParetoData,
  type FightItem,
  type FightType,
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
import { MilestoneStatusButtons } from "@/components/milestone-status-buttons";
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

const SECTIONS: Record<FightType, { title: string; blurb: string }> = {
  STALLED_PROJECT: {
    title: "Stalled projects",
    blurb: "No update in two weeks. One update ends the fight.",
  },
  PAST_REVIVE: {
    title: "Past their revive date",
    blurb: "Paused is a promise with a date. The date passed.",
  },
  OVERDUE_BLOCKER: {
    title: "Overdue blockers",
    blurb: "These had deadlines. The deadlines lost.",
  },
  UNOWNED_BLOCKER: {
    title: "Unowned blockers",
    blurb: "Nobody's job = nobody does it. Assign an owner.",
  },
  PENDING_DECISION: {
    title: "Decisions waiting",
    blurb: "Answer them, or the engineer proceeds with their recommendation.",
  },
  MISSED_MILESTONE: {
    title: "Missed milestones",
    blurb: "Close them, or push the date deliberately.",
  },
  OVERDUE_DATA_REQUEST: {
    title: "Overdue data requests",
    blurb: "The needed-by date passed. The analyst delivers, or the advisor fights.",
  },
  UNOWNED_DATA_REQUEST: {
    title: "Unowned data requests",
    blurb: "No analyst has claimed these. Assign one.",
  },
  PENDING_COMPUTE_REQUEST: {
    title: "Compute requests waiting",
    blurb: "These never auto-proceed. The coordinator approves or denies — with a reason.",
  },
  OVERDUE_COMPUTE_RESULTS: {
    title: "Compute results owed",
    blurb: "The window closed. Where are the results, and did you retrieve your data?",
  },
};

const SECTION_ORDER: FightType[] = [
  "STALLED_PROJECT",
  "PAST_REVIVE",
  "OVERDUE_BLOCKER",
  "OVERDUE_DATA_REQUEST",
  "OVERDUE_COMPUTE_RESULTS",
  "UNOWNED_BLOCKER",
  "UNOWNED_DATA_REQUEST",
  "PENDING_COMPUTE_REQUEST",
  "PENDING_DECISION",
  "MISSED_MILESTONE",
];

export default async function FightListPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  expireOverdueDecisions();

  const [snapshot, causes, allPeople] = await Promise.all([
    loadLabSnapshot(),
    loadAllBlockerCauses(),
    db
      .select({ id: user.id, name: user.name, isDataAnalyst: user.isDataAnalyst })
      .from(user)
      .where(ne(user.banned, true)),
  ]);

  const people = allPeople.map(({ id, name }) => ({ id, name }));
  const analysts = allPeople
    .filter((p) => p.isDataAnalyst)
    .map(({ id, name }) => ({ id, name }));

  const now = new Date();
  const items = computeFightList(snapshot, now);
  const pareto = computeParetoData(causes);
  const blockerById = new Map(snapshot.openBlockers.map((b) => [b.id, b]));
  const milestoneById = new Map(snapshot.openMilestones.map((m) => [m.id, m]));
  const dataRequestById = new Map(snapshot.openDataRequests.map((dr) => [dr.id, dr]));
  const computeRequestById = new Map(snapshot.activeComputeRequests.map((cr) => [cr.id, cr]));

  function actionFor(item: FightItem) {
    switch (item.type) {
      case "STALLED_PROJECT":
        return (
          <UpdateDialog
            projectId={item.projectId}
            trigger={<Button size="sm">Add update</Button>}
          />
        );
      case "PAST_REVIVE":
        return (
          <TransitionButtons projectId={item.projectId} state="PAUSED" role={me!.role} />
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
        if (me!.id !== request.requester.id && me!.role !== "MANAGER") {
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
        if (me!.role !== "MANAGER") {
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
      case "MISSED_MILESTONE": {
        const milestone = milestoneById.get(item.entityId);
        if (!milestone) return null;
        return (
          <div className="flex items-center gap-2">
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
            <MilestoneStatusButtons milestoneId={milestone.id} status={milestone.status} />
          </div>
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-8">
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
            <PartyPopper className="size-10 text-green-400" />
            <p className="text-xl font-medium">Nothing to fight today.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              No stalls, no overdue blockers, no waiting decisions. This is what
              a healthy lab looks like — go do research.
            </p>
          </CardContent>
        </Card>
      ) : (
        SECTION_ORDER.map((type) => {
          const sectionItems = items.filter((i) => i.type === type);
          if (sectionItems.length === 0) return null;
          const section = SECTIONS[type];
          return (
            <section key={type} className="flex flex-col gap-3">
              <div>
                <h2 className="font-medium">
                  {section.title}{" "}
                  <span className="text-muted-foreground">({sectionItems.length})</span>
                </h2>
                <p className="text-xs text-muted-foreground">{section.blurb}</p>
              </div>
              {sectionItems.map((item) => (
                <FightItemCard key={`${item.type}-${item.entityId}`} item={item}>
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
            <ParetoChart data={pareto} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
