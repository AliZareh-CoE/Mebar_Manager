import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, ne } from "drizzle-orm";
import { format, formatDistanceStrict, addHours, differenceInDays } from "date-fns";
import { isOverdue, projectAgeDays } from "@/lib/fight-engine";
import {
  activationStateKeys,
  frozenStateKeys,
  resolveStateDisplay,
  stateByKey,
  transitionDescriptors,
} from "@/lib/workflow";
import { getPolicy, transitionGate } from "@/lib/policy-server";
import { isLabLeadership, isManagerOrAbove } from "@/lib/policy";
import { MECHANISM_HELP, type HelpContext } from "@/lib/help-copy";
import { InfoHint } from "@/components/info-hint";
import { visibleProjectIds, isVisible } from "@/lib/visibility";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { expireOverdueDecisions } from "@/lib/maintenance";
import { getSettings } from "@/lib/settings";
import { proposalFieldName, type HeilmeierColumn } from "@/lib/proposal";
import { editProject } from "@/actions/projects";
import { addUpdate, editUpdate } from "@/actions/updates";
import { addContributor } from "@/actions/project-people";
import { filePaper } from "@/actions/papers";
import { PAPER_STATUS_LABELS } from "@/lib/papers";
import { PersonPicker } from "@/components/forms/person-picker";
import { ProjectPersonRowActions } from "@/components/project-person-row-actions";
import { PaperRowActions } from "@/components/paper-row-actions";
import { raiseBlocker } from "@/actions/blockers";
import { addMilestone, editMilestone } from "@/actions/milestones";
import { fileDataRequest } from "@/actions/data-requests";
import { requestDecision, decideDecision, editDecision, cancelDecision } from "@/actions/decisions";
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
  expireOverdueDecisions(
    new Date(),
    settings.thresholds.decisionTimeoutHours,
    frozenStateKeys(settings.workflow)
  );

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
      people: {
        with: { user: { columns: { id: true, name: true, email: true } } },
        orderBy: (pp) => asc(pp.createdAt),
      },
      papers: { orderBy: (pp) => desc(pp.createdAt) },
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
  const workflow = settings.workflow;
  const causeLabels = Object.fromEntries(settings.causeTags.map((t) => [t.key, t.label]));
  const activeCauseOptions = settings.causeTags
    .filter((t) => !t.archived)
    .map((t) => ({ value: t.key, label: t.label }));
  const serverTypeLabels = Object.fromEntries(
    settings.serverTypes.map((s) => [s.key, s.label])
  );
  const practiceLabels = Object.fromEntries(
    settings.practices.map((p) => [p.key, p.label])
  );
  const answerFor = (q: { key: string; builtin: boolean }): string =>
    q.builtin
      ? project[q.key as HeilmeierColumn]
      : (project.extraAnswers[q.key] ?? "");
  // Archived questions keep rendering wherever an answer exists.
  const visibleQuestions = settings.proposalQuestions.filter(
    (q) => !q.archived || answerFor(q).length > 0
  );
  const editableQuestions = settings.proposalQuestions.filter((q) => !q.archived);
  const activationKeys = activationStateKeys(workflow);
  const stateFlags = stateByKey(workflow, project.state)?.flags;
  const stateDisplay = resolveStateDisplay(workflow, project.state);
  const ageDays = projectAgeDays(
    {
      lastUpdateAt: project.updates[0]?.createdAt ?? null,
      lastActivatedAt:
        project.transitions.find((t) => activationKeys.includes(t.toState))?.createdAt ??
        null,
      createdAt: project.createdAt,
    },
    now
  );
  const openBlockers = project.blockers.filter(
    (b) => b.status !== "RESOLVED" && b.status !== "CANCELLED"
  );
  const pendingDecisions = project.decisions.filter((d) => d.status === "PENDING");
  const openDataRequests = project.dataRequests.filter((dr) => dr.status === "OPEN");
  const personName = (pp: (typeof project.people)[number]) =>
    pp.user?.name ?? pp.externalName ?? "—";
  const pi = project.people.find((pp) => pp.role === "PI");
  const firstAuthor = project.people.find((pp) => pp.role === "FIRST_AUTHOR");
  const ROLE_LABEL = { PI: "PI", FIRST_AUTHOR: "First author", CONTRIBUTOR: "Contributor" } as const;
  const latestPaper = project.papers[0];
  // A DRAFTING paper whose target submission date is inside the lead window
  // (or past) renders red — the same condition the fight engine uses.
  const leadDays = settings.thresholds.submissionLeadDays;
  const paperAtRisk = (p: (typeof project.papers)[number]) =>
    p.status === "DRAFTING" &&
    !!p.targetSubmissionAt &&
    leadDays > 0 &&
    differenceInDays(p.targetSubmissionAt, new Date()) <= leadDays;
  // Scoring-input locks: once the project has left the drafting phase, only
  // manager rank may change PI/first author or confirm an acceptance.
  const projectActivated =
    (stateFlags?.countsForStall || stateFlags?.paused || stateFlags?.terminal) ?? true;
  const rolesLocked = projectActivated && !isManagerOrAbove(me);
  const helpCtx: HelpContext = {
    thresholds: settings.thresholds,
    performance: settings.performance,
    viewerSeesScores: isLabLeadership(me),
  };
  const hint = (id: keyof typeof MECHANISM_HELP) => (
    <InfoHint {...MECHANISM_HELP[id](helpCtx)} />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <StateBadge label={stateDisplay.label} color={stateDisplay.color} />
          {stateFlags?.countsForStall && (
            <>
              <AgePill
                ageDays={ageDays}
                freshDays={settings.thresholds.ageFreshDays}
                agingDays={settings.thresholds.ageAgingDays}
              />
              {hint("agePill")}
            </>
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
          {pi ? (
            <span className="flex items-center gap-1.5">
              <Initials name={personName(pi)} /> {personName(pi)} (PI)
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">no PI set</span>
          )}
          {firstAuthor ? (
            <span className="flex items-center gap-1.5">
              <Initials name={personName(firstAuthor)} /> {personName(firstAuthor)} (first author)
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">no first author set</span>
          )}
          {latestPaper ? (
            <Badge
              variant={latestPaper.status === "ACCEPTED" ? "default" : "secondary"}
              className={
                latestPaper.status === "ACCEPTED"
                  ? "bg-emerald-600 text-white dark:bg-emerald-500"
                  : undefined
              }
            >
              Paper: {PAPER_STATUS_LABELS[latestPaper.status]}
              {latestPaper.venue ? ` — ${latestPaper.venue}` : ""}
            </Badge>
          ) : (
            <span className="text-muted-foreground">no paper yet</span>
          )}
          <span>started {format(project.createdAt, "MMM d, yyyy")}</span>
        </div>
        {stateFlags?.paused && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {stateDisplay.label}:
            </span>{" "}
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
          transitions={transitionDescriptors(
            workflow,
            project.state,
            transitionGate(me, policy),
            isLabLeadership(me)
          )}
          help={MECHANISM_HELP.transitions(helpCtx)}
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
              {editableQuestions.map((q) => {
                const field = proposalFieldName(q);
                return (
                  <div key={q.key} className="flex flex-col gap-2">
                    <Label htmlFor={field}>{q.label}</Label>
                    <Textarea id={field} name={field} defaultValue={answerFor(q)} rows={2} />
                  </div>
                );
              })}
            </FormDialog>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {visibleQuestions.map((q) => (
              <div key={q.key}>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {q.label}
                </dt>
                <dd className="mt-1 text-sm">
                  {answerFor(q) || <span className="text-muted-foreground">—</span>}
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
          <TabsTrigger value="people">People ({project.people.length})</TabsTrigger>
          <TabsTrigger value="papers">Papers ({project.papers.length})</TabsTrigger>
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {u.author.name} · {format(u.createdAt, "MMM d, yyyy")}
                    {(policy.can("update.edit", { involvedUserIds: [u.authorId] })) && (
                      <FormDialog
                        trigger={
                          <button className="underline-offset-4 hover:underline" type="button">
                            edit
                          </button>
                        }
                        title="Edit update"
                        submitLabel="Save"
                        action={editUpdate.bind(null, u.id)}
                      >
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`eu-m-${u.id}`}>What moved</Label>
                          <Textarea id={`eu-m-${u.id}`} name="whatMoved" defaultValue={u.whatMoved} required />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`eu-b-${u.id}`}>What&apos;s blocked</Label>
                          <Textarea id={`eu-b-${u.id}`} name="whatsBlocked" defaultValue={u.whatsBlocked} />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`eu-n-${u.id}`}>What&apos;s next</Label>
                          <Textarea id={`eu-n-${u.id}`} name="whatsNext" defaultValue={u.whatsNext} required />
                        </div>
                      </FormDialog>
                    )}
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
              <CauseSelect options={activeCauseOptions} />
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
                  <TableHead>
                    <span className="flex items-center gap-1">Cause {hint("paretoCause")}</span>
                  </TableHead>
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
                      <Badge variant="secondary">{causeLabels[b.causeTag] ?? b.causeTag}</Badge>
                    </TableCell>
                    <TableCell
                      className={
                        b.status !== "RESOLVED" &&
                        b.status !== "CANCELLED" &&
                        isOverdue(b.deadline, now)
                          ? "font-medium text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }
                    >
                      {format(b.deadline, "MMM d")}
                    </TableCell>
                    <TableCell>
                      {b.status === "CANCELLED" ? (
                        <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>
                      ) : b.status === "RESOLVED" ? (
                        <Badge variant="outline" className="text-emerald-500">Resolved</Badge>
                      ) : b.status === "ESCALATED" ? (
                        <Badge variant="destructive">Escalated</Badge>
                      ) : (
                        <Badge variant="outline">Open</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <BlockerRowActions
                        escalateHelp={MECHANISM_HELP.escalate(helpCtx)}
                        blockerId={b.id}
                        status={b.status}
                        ownerId={b.ownerId}
                        people={people}
                        edit={{
                          description: b.description,
                          causeTag: b.causeTag,
                          deadlineISO: format(b.deadline, "yyyy-MM-dd"),
                          causeOptions: settings.causeTags
                            .filter((t) => !t.archived || t.key === b.causeTag)
                            .map((t) => ({ value: t.key, label: t.label })),
                        }}
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            How decisions work {hint("autoProceed")}
          </div>
          <FormDialog
            trigger={<Button className="self-start">Request decision</Button>}
            title="Request a decision"
            description={`If ${project.advisor.name} doesn't answer within ${settings.thresholds.decisionTimeoutHours} hours, you proceed with your recommendation. Default to action.`}
            submitLabel="Request it"
            successMessage={`Decision requested. The ${settings.thresholds.decisionTimeoutHours}-hour clock is running.`}
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
                        ) : d.status === "CANCELLED" ? (
                          <Badge variant="outline" className="text-muted-foreground">Withdrawn</Badge>
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
                      {d.status === "PENDING" && (
                        <div className="flex items-center gap-2 self-start">
                          <FormDialog
                            trigger={<Button variant="ghost" size="sm">Edit</Button>}
                            title="Edit decision request"
                            submitLabel="Save"
                            action={editDecision.bind(null, d.id)}
                          >
                            <div className="flex flex-col gap-2">
                              <Label htmlFor={`ed-q-${d.id}`}>The fork in the road</Label>
                              <Textarea id={`ed-q-${d.id}`} name="question" defaultValue={d.question} required />
                            </div>
                            <div className="flex flex-col gap-2">
                              <Label htmlFor={`ed-o-${d.id}`}>Options (one per line)</Label>
                              <Textarea id={`ed-o-${d.id}`} name="options" defaultValue={d.options} rows={3} required />
                            </div>
                            <div className="flex flex-col gap-2">
                              <Label htmlFor={`ed-r-${d.id}`}>Your recommendation</Label>
                              <Textarea id={`ed-r-${d.id}`} name="recommendation" defaultValue={d.recommendation} required />
                            </div>
                          </FormDialog>
                          <FormDialog
                            trigger={<Button variant="ghost" size="sm">Withdraw…</Button>}
                            title="Withdraw decision request"
                            description="The question no longer needs an answer? Say why."
                            submitLabel="Withdraw"
                            successMessage="Decision withdrawn."
                            action={cancelDecision.bind(null, d.id)}
                          >
                            <div className="flex flex-col gap-2">
                              <Label htmlFor={`cd-${d.id}`}>Why?</Label>
                              <Textarea id={`cd-${d.id}`} name="reason" required />
                            </div>
                          </FormDialog>
                        </div>
                      )}
                      {d.status === "PENDING" && isManagerOrAbove(me) && (
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
                  <TableHead>
                    <span className="flex items-center gap-1">Due {hint("dateLock")}</span>
                  </TableHead>
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
                        {m.status === "CANCELLED" ? (
                          <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>
                        ) : m.status === "DONE" ? (
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
                        <div className="flex items-center justify-end gap-2">
                          {m.status !== "DONE" && m.status !== "CANCELLED" && (
                            <FormDialog
                              trigger={<Button variant="ghost" size="sm">Edit</Button>}
                              title="Edit milestone"
                              submitLabel="Save"
                              action={editMilestone.bind(null, m.id)}
                            >
                              <div className="flex flex-col gap-2">
                                <Label htmlFor={`em-title-${m.id}`}>Title</Label>
                                <Input id={`em-title-${m.id}`} name="title" defaultValue={m.title} required />
                              </div>
                              <div className="flex flex-col gap-2">
                                <Label htmlFor={`em-del-${m.id}`}>Deliverable</Label>
                                <Textarea
                                  id={`em-del-${m.id}`}
                                  name="deliverable"
                                  defaultValue={m.deliverable}
                                  required
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                  <Label htmlFor={`em-start-${m.id}`}>Start</Label>
                                  <Input
                                    id={`em-start-${m.id}`}
                                    name="startDate"
                                    type="date"
                                    defaultValue={format(m.startDate, "yyyy-MM-dd")}
                                    required
                                  />
                                </div>
                                <div className="flex flex-col gap-2">
                                  <Label htmlFor={`em-due-${m.id}`}>Due</Label>
                                  <Input
                                    id={`em-due-${m.id}`}
                                    name="dueDate"
                                    type="date"
                                    defaultValue={format(m.dueDate, "yyyy-MM-dd")}
                                    required
                                  />
                                </div>
                              </div>
                            </FormDialog>
                          )}
                          <MilestoneStatusButtons milestoneId={m.id} status={m.status} />
                        </div>
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
                      ) : dr.status === "CANCELLED" ? (
                        <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>
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
                        edit={{
                          title: dr.title,
                          description: dr.description,
                          neededByISO: format(dr.neededBy, "yyyy-MM-dd"),
                        }}
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
                serverTypeLabel={serverTypeLabels[cr.serverType] ?? cr.serverType}
                practiceLabels={practiceLabels}
              />
            ))
          )}
        </TabsContent>

        {/* People */}
        <TabsContent value="people" className="flex flex-col gap-4 pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            How the lineup works {hint("lineupLock")}
          </div>
          <FormDialog
            trigger={<Button className="self-start">Add person</Button>}
            title="Add someone to this project"
            description="Lab members, or people who never touch this app — students, external PIs, assistants."
            submitLabel="Add"
            successMessage="Added to the lineup."
            action={addContributor.bind(null, project.id)}
          >
            <PersonPicker members={people} />
          </FormDialog>

          {(!pi || !firstAuthor) && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              This project can&apos;t be activated until{" "}
              {[!pi && "a PI", !firstAuthor && "a first author"].filter(Boolean).join(" and ")}{" "}
              {!pi && !firstAuthor ? "are" : "is"} set — use &quot;Make PI&quot; / &quot;Make
              first author&quot; on a row below.
            </p>
          )}

          {project.people.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody on the lineup yet. Every project needs a PI and a first author.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Affiliation / note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.people.map((pp) => (
                  <TableRow key={pp.id}>
                    <TableCell>
                      <span className="flex items-center gap-1.5 font-medium">
                        <Initials name={personName(pp)} /> {personName(pp)}
                        {!pp.userId && (
                          <Badge variant="outline" className="text-muted-foreground">
                            external
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      {pp.role === "PI" || pp.role === "FIRST_AUTHOR" ? (
                        <Badge>{ROLE_LABEL[pp.role]}</Badge>
                      ) : (
                        <span className="text-muted-foreground">{ROLE_LABEL[pp.role]}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[pp.affiliation, pp.title].filter(Boolean).join(" — ") || "—"}
                    </TableCell>
                    <TableCell>
                      <ProjectPersonRowActions
                        projectId={project.id}
                        personId={pp.id}
                        role={pp.role}
                        userId={pp.userId}
                        externalName={pp.externalName}
                        hasEmail={!!(pp.email ?? pp.user?.email)}
                        notify={pp.notify}
                        rolesLocked={rolesLocked}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Papers */}
        <TabsContent value="papers" className="flex flex-col gap-4 pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            How the paper track works {hint("papers")}
          </div>
          <FormDialog
            trigger={<Button className="self-start">File paper</Button>}
            title="File a paper"
            description="Every project must lead to a Q1 paper. A draft counts — filing it is the commitment."
            submitLabel="File it"
            successMessage="Paper on the record."
            action={filePaper.bind(null, project.id)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="paper-title">Working title</Label>
              <Input id="paper-title" name="title" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="paper-venue">Target venue / journal</Label>
              <Input id="paper-venue" name="venue" placeholder="IEEE TII" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="paper-quartile">Quartile note</Label>
              <Input id="paper-quartile" name="quartileNote" placeholder="Q1 — target" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="paper-link">Link / DOI (optional)</Label>
              <Input id="paper-link" name="link" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="paper-target">Target submission date (optional)</Label>
              <Input id="paper-target" name="targetSubmissionAt" type="date" />
              <p className="text-xs text-muted-foreground">
                {`The Fight List warns you as this date approaches (within ${leadDays} days) if it's still a draft.`}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Journal shortlist (ranked, optional)</Label>
              <Input name="venueShortlist" placeholder="Target 1 — best fit" />
              <Input name="venueShortlist" placeholder="Target 2 — strong alternative" />
              <Input name="venueShortlist" placeholder="Target 3 — reliable fallback" />
            </div>
          </FormDialog>

          {project.papers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No paper on record. This project exists to produce one — file it, even as a draft.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paper</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.papers.map((paper) => (
                  <TableRow key={paper.id}>
                    <TableCell>
                      <div className="font-medium">
                        {paper.link ? (
                          <a
                            href={paper.link}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-4 hover:underline"
                          >
                            {paper.title}
                          </a>
                        ) : (
                          paper.title
                        )}
                      </div>
                      {(paper.status === "REJECTED" || paper.status === "WITHDRAWN") &&
                        paper.closureNote && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            ↳ {paper.closureNote}
                          </div>
                        )}
                      {paper.targetSubmissionAt && (
                        <div
                          className={
                            paperAtRisk(paper)
                              ? "mt-0.5 text-xs font-medium text-red-600 dark:text-red-400"
                              : "mt-0.5 text-xs text-muted-foreground"
                          }
                        >
                          {`Target: ${format(paper.targetSubmissionAt, "MMM d, yyyy")}`}
                          {paperAtRisk(paper) ? " — at risk" : ""}
                        </div>
                      )}
                      {paper.venueShortlist.length > 0 && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {`Shortlist: ${paper.venueShortlist.join(" → ")}`}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[paper.venue, paper.quartileNote].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          paper.status === "ACCEPTED"
                            ? "default"
                            : paper.status === "REJECTED"
                              ? "destructive"
                              : "secondary"
                        }
                        className={
                          paper.status === "ACCEPTED"
                            ? "bg-emerald-600 text-white dark:bg-emerald-500"
                            : undefined
                        }
                      >
                        {PAPER_STATUS_LABELS[paper.status]}
                      </Badge>
                      {paper.submittedAt && paper.status === "SUBMITTED" && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {format(paper.submittedAt, "MMM d")}
                        </span>
                      )}
                      {paper.acceptedAt && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {format(paper.acceptedAt, "MMM d, yyyy")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <PaperRowActions
                        paperId={paper.id}
                        status={paper.status}
                        venue={paper.venue}
                        venueShortlist={paper.venueShortlist}
                        canConfirmAccept={isManagerOrAbove(me)}
                        edit={{
                          title: paper.title,
                          venue: paper.venue,
                          quartileNote: paper.quartileNote,
                          link: paper.link,
                          targetSubmissionAt: paper.targetSubmissionAt,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="pt-4">
          {project.transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No state changes yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {project.transitions.map((t) => {
                const from = resolveStateDisplay(workflow, t.fromState);
                const to = resolveStateDisplay(workflow, t.toState);
                return (
                  <li key={t.id} className="flex items-baseline gap-3 text-sm">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">
                      {format(t.createdAt, "MMM d, yyyy")}
                    </span>
                    <span>
                      <span className="font-medium">{t.byUser.name}</span> moved it from{" "}
                      <StateBadge label={from.label} color={from.color} className="mx-1" /> to{" "}
                      <StateBadge label={to.label} color={to.color} className="mx-1" />
                      {t.reason && <span className="text-muted-foreground"> — {t.reason}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
