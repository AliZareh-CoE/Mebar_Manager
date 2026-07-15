import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, ne } from "drizzle-orm";
import { format, formatDistanceStrict, addHours } from "date-fns";
import { isOverdue, projectAgeDays } from "@/lib/fight-engine";
import { availableEvents } from "@/lib/state-machine";
import { getPolicy, projectEventGate } from "@/lib/policy-server";
import { visibleProjectIds, isVisible } from "@/lib/visibility";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { expireOverdueDecisions } from "@/lib/maintenance";
import { getSettings } from "@/lib/settings";
import { CAUSE_TAG_LABELS } from "@/lib/labels";
import { editProject } from "@/actions/projects";
import { addUpdate } from "@/actions/updates";
import { raiseBlocker } from "@/actions/blockers";
import { addMilestone } from "@/actions/milestones";
import { fileDataRequest } from "@/actions/data-requests";
import { requestDecision } from "@/actions/decisions";
import { decideDecision } from "@/actions/decisions";
import { StateBadge } from "@/components/state-badge";
import { AgePill } from "@/components/age-pill";
import { Initials } from "@/components/initials";
import { TransitionButtons } from "@/components/transition-buttons";
import { FormDialog } from "@/components/form-dialog";
import { BlockerRowActions } from "@/components/blocker-row-actions";
import { ComputeRequestCard } from "@/components/compute-request-card";
import { DataRequestRowActions } from "@/components/data-request-row-actions";
import { MilestoneStatusButtons } from "@/components/milestone-status-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CauseSelect, PersonSelect } from "@/components/forms/labeled-selects";

export const dynamic = "force-dynamic";

const HEILMEIER_FIELDS = [
  ["objective", "What are we trying to do? (no jargon)"],
  ["howItsDoneToday", "How is it done today?"],
  ["whatsNew", "What's new in our approach?"],
  ["whoCares", "Who cares if we succeed?"],
  ["risks", "What are the risks?"],
  ["killCriteria", "Kill criteria — when do we stop?"],
  ["successCriteria", "Success criteria — what are the exams?"],
] as const;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) notFound();

  const settings = await getSettings();
  const policy = await getPolicy(me);
  expireOverdueDecisions(new Date(), settings.thresholds.decisionTimeoutHours);

  const project = await db.query.projects.findFirst({
    where: (p, { eq }) => eq(p.id, id),
    with: {
      owner: true,
      advisor: true,
      milestones: { orderBy: (m) => asc(m.dueDate) },
      blockers: { with: { owner: true }, orderBy: (b) => desc(b.createdAt) },
      updates: { with: { author: true }, orderBy: (u) => desc(u.createdAt) },
      decisions: { orderBy: (d) => desc(d.createdAt) },
      transitions: { with: { byUser: true }, orderBy: (t) => desc(t.createdAt) },
      dataRequests: {
        with: {
          assignee: { columns: { id: true, name: true } },
          requester: { columns: { id: true, name: true } },
        },
        orderBy: (dr) => desc(dr.createdAt),
      },
      computeRequests: {
        with: { requester: { columns: { id: true, name: true } } },
        orderBy: (cr) => desc(cr.createdAt),
      },
    },
  });
  if (!project) notFound();
  const visibleIds = await visibleProjectIds(me, settings);
  if (!isVisible(visibleIds, project.id)) notFound();

  const allPeople = await db
    .select({ id: user.id, name: user.name, isDataAnalyst: user.isDataAnalyst })
    .from(user)
    .where(ne(user.banned, true));
  const people = allPeople.map(({ id, name }) => ({ id, name }));
  const analysts = allPeople
    .filter((p) => p.isDataAnalyst)
    .map(({ id, name }) => ({ id, name }));

  const now = new Date();
  const ageDays = projectAgeDays(
    {
      lastUpdateAt: project.updates[0]?.createdAt ?? null,
      lastActivatedAt:
        project.transitions.find((t) => t.toState === "ACTIVE")?.createdAt ?? null,
      createdAt: project.createdAt,
    },
    now
  );
  const openBlockers = project.blockers.filter((b) => b.status !== "RESOLVED");
  const pendingDecisions = project.decisions.filter((d) => d.status === "PENDING");
  const openDataRequests = project.dataRequests.filter((dr) => dr.status === "OPEN");

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <StateBadge state={project.state} />
          {(project.state === "ACTIVE" || project.state === "BLOCKED") && (
            <AgePill
              ageDays={ageDays}
              freshDays={settings.thresholds.ageFreshDays}
              agingDays={settings.thresholds.ageAgingDays}
            />
          )}
        </div>
        {project.description && (
          <p className="max-w-3xl text-sm text-muted-foreground">{project.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Initials name={project.owner.name} /> {project.owner.name} (owner)
          </span>
          <span className="flex items-center gap-1.5">
            <Initials name={project.advisor.name} /> {project.advisor.name} (advisor)
          </span>
          <span>started {format(project.createdAt, "MMM d, yyyy")}</span>
        </div>
        {project.state === "PAUSED" && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <span className="font-medium text-amber-600 dark:text-amber-400">Paused:</span>{" "}
            {project.pauseReason}
            {project.reviveDate && (
              <span className="text-muted-foreground">
                {" "}
                — revives {format(project.reviveDate, "MMM d, yyyy")}
              </span>
            )}
          </div>
        )}
        <TransitionButtons
          projectId={project.id}
          events={availableEvents(project.state, projectEventGate(policy))}
        />
      </div>

      {/* Heilmeier */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>The Heilmeier questions</CardTitle>
          {policy.can("project.editAny", { involvedUserIds: [project.ownerId, project.advisorId] }) && (
            <FormDialog
              trigger={<Button variant="outline" size="sm">Edit</Button>}
              title="Edit project"
              submitLabel="Save changes"
              action={editProject.bind(null, project.id)}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" defaultValue={project.title} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" defaultValue={project.description} />
              </div>
              {HEILMEIER_FIELDS.map(([field, label]) => (
                <div key={field} className="flex flex-col gap-2">
                  <Label htmlFor={field}>{label}</Label>
                  <Textarea id={field} name={field} defaultValue={project[field]} rows={2} />
                </div>
              ))}
            </FormDialog>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {HEILMEIER_FIELDS.map(([field, label]) => (
              <div key={field}>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 text-sm">
                  {project[field] || <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="updates">
        <TabsList>
          <TabsTrigger value="updates">Updates ({project.updates.length})</TabsTrigger>
          <TabsTrigger value="blockers">
            Blockers ({openBlockers.length} open)
          </TabsTrigger>
          <TabsTrigger value="decisions">
            Decisions ({pendingDecisions.length} pending)
          </TabsTrigger>
          <TabsTrigger value="milestones">Milestones ({project.milestones.length})</TabsTrigger>
          <TabsTrigger value="data">Data ({openDataRequests.length} open)</TabsTrigger>
          <TabsTrigger value="compute">
            Compute ({project.computeRequests.filter((cr) => cr.status === "PENDING").length} pending)
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Updates */}
        <TabsContent value="updates" className="flex flex-col gap-4 pt-4">
          <FormDialog
            trigger={<Button className="self-start">Add update</Button>}
            title="Weekly update"
            description="Three bullets. Five minutes. Keeps the project off the Fight List."
            submitLabel="Post update"
            successMessage="Update posted. The clock resets."
            action={addUpdate.bind(null, project.id)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="whatMoved">What moved</Label>
              <Textarea id="whatMoved" name="whatMoved" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="whatsBlocked">What&apos;s blocked</Label>
              <Textarea id="whatsBlocked" name="whatsBlocked" placeholder="Nothing? Great." />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="whatsNext">What&apos;s next</Label>
              <Textarea id="whatsNext" name="whatsNext" required />
            </div>
          </FormDialog>

          {project.updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No updates yet. Silence is how projects die.
            </p>
          ) : (
            <ol className="relative flex flex-col gap-4 border-l pl-5">
              {project.updates.map((u) => (
                <li key={u.id} className="relative">
                  <span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-primary/60" />
                  <div className="text-xs text-muted-foreground">
                    {u.author.name} · {format(u.createdAt, "MMM d, yyyy")}
                  </div>
                  <div className="mt-1 grid gap-1 text-sm">
                    <p><span className="font-medium text-green-600 dark:text-green-400">Moved:</span> {u.whatMoved}</p>
                    {u.whatsBlocked && (
                      <p><span className="font-medium text-red-600 dark:text-red-400">Blocked:</span> {u.whatsBlocked}</p>
                    )}
                    <p><span className="font-medium text-blue-600 dark:text-blue-400">Next:</span> {u.whatsNext}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        {/* Blockers */}
        <TabsContent value="blockers" className="flex flex-col gap-4 pt-4">
          <FormDialog
            trigger={<Button className="self-start">Raise blocker</Button>}
            title="Raise a blocker"
            description="Stuck for more than two days? That's a blocker. Raising it is professionalism, not failure."
            submitLabel="Raise it"
            successMessage="Blocker raised. Now it can be fought."
            action={raiseBlocker.bind(null, project.id)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="b-description">What&apos;s stuck?</Label>
              <Textarea
                id="b-description"
                name="description"
                placeholder="What's stuck, what you tried, what you need."
                rows={3}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Cause</Label>
              <CauseSelect />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Owner (who kills it)</Label>
              <PersonSelect
                name="ownerId"
                people={people}
                placeholder="Unassigned (escalates in 2 days)"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="b-deadline">Deadline</Label>
              <Input id="b-deadline" name="deadline" type="date" required />
            </div>
          </FormDialog>

          {project.blockers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No blockers. Suspicious… or excellent.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Blocker</TableHead>
                  <TableHead>Cause</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.blockers.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="max-w-xs">
                      <p className="truncate font-medium" title={b.description}>
                        {b.description}
                      </p>
                      {b.resolutionNote && (
                        <p className="truncate text-xs text-muted-foreground" title={b.resolutionNote}>
                          ✓ {b.resolutionNote}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{CAUSE_TAG_LABELS[b.causeTag]}</Badge>
                    </TableCell>
                    <TableCell
                      className={
                        b.status !== "RESOLVED" && isOverdue(b.deadline, now)
                          ? "font-medium text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }
                    >
                      {format(b.deadline, "MMM d")}
                    </TableCell>
                    <TableCell>
                      {b.status === "RESOLVED" ? (
                        <Badge variant="outline" className="text-emerald-500">Resolved</Badge>
                      ) : b.status === "ESCALATED" ? (
                        <Badge variant="destructive">Escalated</Badge>
                      ) : (
                        <Badge variant="outline">Open</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <BlockerRowActions
                        blockerId={b.id}
                        status={b.status}
                        ownerId={b.ownerId}
                        people={people}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Decisions */}
        <TabsContent value="decisions" className="flex flex-col gap-4 pt-4">
          <FormDialog
            trigger={<Button className="self-start">Request decision</Button>}
            title="Request a decision"
            description={`If ${project.advisor.name} doesn't answer within ${settings.thresholds.decisionTimeoutHours} hours, you proceed with your recommendation. Default to action.`}
            submitLabel="Request it"
            successMessage="Decision requested. The 48-hour clock is running."
            action={requestDecision.bind(null, project.id)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="d-question">The fork in the road</Label>
              <Textarea id="d-question" name="question" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="d-options">Options (one per line)</Label>
              <Textarea id="d-options" name="options" rows={3} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="d-recommendation">Your recommendation</Label>
              <Textarea id="d-recommendation" name="recommendation" required />
            </div>
          </FormDialog>

          {project.decisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions requested yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {project.decisions.map((d) => {
                const deadline = addHours(d.createdAt, settings.thresholds.decisionTimeoutHours);
                return (
                  <Card key={d.id}>
                    <CardContent className="flex flex-col gap-2 pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{d.question}</p>
                        {d.status === "PENDING" ? (
                          <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                            auto-proceeds in {formatDistanceStrict(deadline, now)}
                          </Badge>
                        ) : d.status === "DECIDED" ? (
                          <Badge variant="outline" className="text-emerald-500">Decided</Badge>
                        ) : (
                          <Badge variant="outline" className="text-blue-600 dark:text-blue-400">
                            Auto-proceeded with recommendation
                          </Badge>
                        )}
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
                        {d.options}
                      </pre>
                      <p className="text-sm">
                        <span className="font-medium text-blue-600 dark:text-blue-400">Recommendation:</span>{" "}
                        {d.recommendation}
                      </p>
                      {d.decisionNote && (
                        <p className="text-sm">
                          <span className="font-medium text-emerald-500">Decision:</span>{" "}
                          {d.decisionNote}
                        </p>
                      )}
                      {d.status === "PENDING" && me.role === "MANAGER" && (
                        <FormDialog
                          trigger={<Button size="sm" className="self-start">Decide now</Button>}
                          title="Decide"
                          description={d.question}
                          submitLabel="Decide"
                          successMessage="Decided. That's the job."
                          action={decideDecision.bind(null, d.id)}
                        >
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`dn-${d.id}`}>The decision</Label>
                            <Textarea id={`dn-${d.id}`} name="decisionNote" required />
                          </div>
                        </FormDialog>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Milestones */}
        <TabsContent value="milestones" className="flex flex-col gap-4 pt-4">
          <FormDialog
            trigger={<Button className="self-start">Add milestone</Button>}
            title="Add milestone"
            description="Timebox it: one to two weeks, with a concrete deliverable."
            submitLabel="Add"
            action={addMilestone.bind(null, project.id)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-title">Title</Label>
              <Input id="m-title" name="title" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-deliverable">What will exist when it&apos;s done?</Label>
              <Textarea
                id="m-deliverable"
                name="deliverable"
                placeholder="A plot, a table, a working script, a written answer…"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="m-start">Start</Label>
                <Input id="m-start" name="startDate" type="date" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="m-due">Due</Label>
                <Input id="m-due" name="dueDate" type="date" required />
              </div>
            </div>
          </FormDialog>

          {project.milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No milestones. What will exist in two weeks?
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Milestone</TableHead>
                  <TableHead>Deliverable</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.milestones.map((m) => {
                  // Same overdue semantics as the fight engine — the two
                  // surfaces must never disagree about "missed".
                  const missed = m.status !== "DONE" && isOverdue(m.dueDate, now);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.title}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground" title={m.deliverable}>
                        {m.deliverable}
                      </TableCell>
                      <TableCell className={missed ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                        {format(m.dueDate, "MMM d")}
                      </TableCell>
                      <TableCell>
                        {m.status === "DONE" ? (
                          <Badge variant="outline" className="text-emerald-500">Done</Badge>
                        ) : missed ? (
                          <Badge variant="destructive">Missed</Badge>
                        ) : m.status === "IN_PROGRESS" ? (
                          <Badge variant="outline" className="text-blue-600 dark:text-blue-400">In progress</Badge>
                        ) : (
                          <Badge variant="outline">Planned</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <MilestoneStatusButtons milestoneId={m.id} status={m.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Data requests */}
        <TabsContent value="data" className="flex flex-col gap-4 pt-4">
          <FormDialog
            trigger={<Button className="self-start">Request data</Button>}
            title="Request data"
            description="The assigned analyst is responsible for delivering it. Unassigned requests escalate to the advisor after 2 days."
            submitLabel="Request it"
            successMessage="Data request filed."
            action={fileDataRequest.bind(null, project.id)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="dr-title">What data do you need?</Label>
              <Input id="dr-title" name="title" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dr-description">Details</Label>
              <Textarea
                id="dr-description"
                name="description"
                placeholder="Format, source, time range, granularity, labels…"
                rows={3}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Analyst</Label>
              <PersonSelect
                name="assigneeId"
                people={analysts}
                placeholder="Unassigned (any analyst can claim; escalates in 2 days)"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dr-neededBy">Needed by</Label>
              <Input id="dr-neededBy" name="neededBy" type="date" required />
            </div>
          </FormDialog>

          {analysts.length === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              No data analysts yet — a coordinator can grant the analyst role on
              the People page.
            </p>
          )}

          {project.dataRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No data requests. When a project needs data, ask for it here —
              not in a hallway.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>What&apos;s needed</TableHead>
                  <TableHead>Needed by</TableHead>
                  <TableHead>Analyst</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.dataRequests.map((dr) => (
                  <TableRow key={dr.id}>
                    <TableCell className="max-w-xs">
                      <p className="truncate font-medium" title={dr.title}>
                        {dr.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={dr.description}>
                        {dr.status === "DELIVERED" && dr.deliveryNote
                          ? `✓ ${dr.deliveryNote}`
                          : dr.description}
                      </p>
                    </TableCell>
                    <TableCell
                      className={
                        dr.status === "OPEN" && isOverdue(dr.neededBy, now)
                          ? "font-medium text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }
                    >
                      {format(dr.neededBy, "MMM d")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dr.assignee?.name ?? <span className="text-amber-600 dark:text-amber-400">Unassigned</span>}
                    </TableCell>
                    <TableCell>
                      {dr.status === "DELIVERED" ? (
                        <Badge variant="outline" className="text-emerald-500">Delivered</Badge>
                      ) : (
                        <Badge variant="outline">Open</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DataRequestRowActions
                        requestId={dr.id}
                        status={dr.status}
                        assigneeId={dr.assigneeId}
                        analysts={analysts}
                        meId={me.id}
                        meIsAnalyst={me.isDataAnalyst}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Compute requests */}
        <TabsContent value="compute" className="flex flex-col gap-4 pt-4">
          <Button
            className="self-start"
            nativeButton={false}
            render={<Link href={`/projects/${project.id}/compute/new`}>Request compute</Link>}
          />
          {project.computeRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No compute requests. When this project needs hours, request them
              with a plan — dry run first.
            </p>
          ) : (
            project.computeRequests.map((cr) => (
              <ComputeRequestCard
                key={cr.id}
                request={cr}
                requesterName={cr.requester.name}
                me={me}
              />
            ))
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="pt-4">
          {project.transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No state changes yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {project.transitions.map((t) => (
                <li key={t.id} className="flex items-baseline gap-3 text-sm">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {format(t.createdAt, "MMM d, yyyy")}
                  </span>
                  <span>
                    <span className="font-medium">{t.byUser.name}</span> moved it from{" "}
                    <StateBadge state={t.fromState as never} className="mx-1" /> to{" "}
                    <StateBadge state={t.toState as never} className="mx-1" />
                    {t.reason && <span className="text-muted-foreground"> — {t.reason}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
