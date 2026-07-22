import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { isLabLeadership } from "@/lib/policy";
import { loadStatsInput } from "@/lib/stats-data";
import { computeStats, STATS_WINDOW_DAYS } from "@/lib/stats";
import { computeParetoData } from "@/lib/fight-engine";
import type { StateColor } from "@/lib/workflow";
import { StatTile } from "@/components/stat-tile";
import { StateBadge } from "@/components/state-badge";
import { ParetoChart } from "@/components/pareto-chart";
import { WeeklyThroughputChart } from "@/components/weekly-throughput-chart";
import { ProjectsOverTimeChart } from "@/components/projects-over-time-chart";
import { PapersTimelineChart } from "@/components/papers-timeline-chart";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const PAPER_STATUS_TILES: [string, string][] = [
  ["DRAFTING", "Drafting"],
  ["SUBMITTED", "Submitted"],
  ["ACCEPTED", "Accepted"],
  ["REJECTED", "Rejected"],
  ["WITHDRAWN", "Withdrawn"],
];

export default async function StatsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isLabLeadership(me)) redirect("/");

  const settings = await getSettings();
  const now = new Date();
  const input = await loadStatsInput();
  const stats = computeStats(input, settings.workflow.states, now);
  const pareto = computeParetoData(
    input.blockers.filter((b) => b.status !== "CANCELLED")
  );
  const causeLabels = Object.fromEntries(settings.causeTags.map((t) => [t.key, t.label]));
  const maxStateCount = Math.max(1, ...stats.projectsByState.map((s) => s.count));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lab statistics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {`The whole record, live — all-time plus the last ${STATS_WINDOW_DAYS} days. Counts from the record, nothing else.`}
        </p>
      </div>

      {/* 1 — At a glance */}
      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Projects"
            value={stats.headline.projectsTotal}
            sub={`${stats.headline.projectsRunning} running`}
          />
          <StatTile
            label="Papers accepted"
            value={stats.headline.papersAccepted}
            sub={`${stats.headline.papersInFlight} under review`}
          />
          <StatTile label="Open blockers" value={stats.headline.openBlockers} />
          <StatTile label="Pending decisions" value={stats.headline.pendingDecisions} />
          <StatTile label="Members" value={stats.headline.activeMembers} />
          <StatTile label="UTF students" value={stats.headline.utfActive} />
          <StatTile
            label="Median days to submit"
            value={stats.cycle.medianDaysToSubmit ?? "—"}
            sub="project start → submission"
          />
          <StatTile
            label="Median days to accept"
            value={stats.cycle.medianDaysToAccept ?? "—"}
            sub="submission → acceptance"
          />
        </div>
      </section>

      {/* 2 — Portfolio */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Portfolio</h2>
          <p className="text-xs text-muted-foreground">
            What state is every project in — and are new ones still being started?
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Projects by state</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {stats.projectsByState.map((s) => (
                <div key={s.key} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0">
                    <StateBadge label={s.label} color={s.color as StateColor} />
                  </span>
                  <span className="h-2 rounded-full bg-primary/70" style={{ width: `${Math.round((s.count / maxStateCount) * 100)}%`, minWidth: s.count > 0 ? "0.5rem" : "0" }} />
                  <span className="tabular-nums text-muted-foreground">{s.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Projects started per month</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectsOverTimeChart data={stats.projectsCreatedByMonth} />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 3 — Output */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Papers</h2>
          <p className="text-xs text-muted-foreground">
            What has the lab produced — and is output growing quarter over quarter?
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {PAPER_STATUS_TILES.map(([key, label]) => (
            <StatTile key={key} label={label} value={stats.papersPipeline[key] ?? 0} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Submissions and acceptances</CardTitle>
              <CardDescription>Per month, last 12 months.</CardDescription>
            </CardHeader>
            <CardContent>
              <PapersTimelineChart data={stats.papersByMonth} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Venues</CardTitle>
              <CardDescription>Where the lab publishes.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.perVenue.length === 0 ? (
                <p className="text-sm text-muted-foreground">No papers on record yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Venue</TableHead>
                      <TableHead className="text-right">Drafting</TableHead>
                      <TableHead className="text-right">Submitted</TableHead>
                      <TableHead className="text-right">Accepted</TableHead>
                      <TableHead className="text-right">Closed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.perVenue.map((v) => (
                      <TableRow key={v.venue}>
                        <TableCell className="font-medium">{v.venue}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.drafting}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.submitted}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.accepted}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.closed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 4 — Flow */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Throughput</h2>
          <p className="text-xs text-muted-foreground">
            Is work flowing? Updates posted, milestones closed, and blockers
            resolved — per ISO week, last 12 weeks.
          </p>
        </div>
        <Card>
          <CardContent className="pt-4">
            <WeeklyThroughputChart data={stats.weeklyThroughput} />
          </CardContent>
        </Card>
      </section>

      {/* 5 — Bottlenecks */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Where work gets stuck</h2>
          <p className="text-xs text-muted-foreground">
            The systemic bottlenecks: what blocks projects, how long blockers
            live, and how fast decisions land.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            label="Median blocker life"
            value={stats.bottlenecks.medianBlockerDays ?? "—"}
            sub="days to resolution"
          />
          <StatTile
            label="Median decision time"
            value={stats.bottlenecks.medianDecisionHours ?? "—"}
            sub={`hours (auto-proceeds at ${settings.thresholds.decisionTimeoutHours}h)`}
          />
          <StatTile
            label="Auto-proceeded"
            value={stats.bottlenecks.autoProceeded}
            sub="decisions nobody answered"
          />
        </div>
        {pareto.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>What keeps blocking us</CardTitle>
              <CardDescription>All-time blocker causes, tallest bar first.</CardDescription>
            </CardHeader>
            <CardContent>
              <ParetoChart data={pareto} labels={causeLabels} />
            </CardContent>
          </Card>
        )}
      </section>

      {/* 6 — Services */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Internal services</h2>
          <p className="text-xs text-muted-foreground">
            Are data, compute, and admin requests keeping up with the science?
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Data requests"
            value={stats.requests.data.delivered}
            sub={`delivered · ${stats.requests.data.open} open`}
          />
          <StatTile
            label="Data on time"
            value={stats.requests.data.onTimePct !== null ? `${stats.requests.data.onTimePct}%` : "—"}
            sub={`${stats.requests.data.external} external requests`}
          />
          <StatTile
            label="Compute hours approved"
            value={stats.requests.compute.hoursApproved}
            sub={`${stats.requests.compute.pending} pending requests`}
          />
          <StatTile
            label="Tasks done"
            value={stats.requests.tasksDone}
            sub={`${stats.requests.tasksOpen} open`}
          />
        </div>
      </section>

      {/* 7 — People */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Member contributions</h2>
          <p className="text-xs text-muted-foreground">
            {`Who contributes what — running projects owned, updates (last ${STATS_WINDOW_DAYS} days and all-time), and closed work. Counts, not grades.`}
          </p>
        </div>
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="text-right">Running owned</TableHead>
                  <TableHead className="text-right">{`Updates ${STATS_WINDOW_DAYS}d / all`}</TableHead>
                  <TableHead className="text-right">Milestones done</TableHead>
                  <TableHead className="text-right">Papers sub / acc</TableHead>
                  <TableHead className="text-right">Blockers resolved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.name}
                      {m.role === "MANAGER" || m.role === "ADMIN" ? (
                        <Badge variant="outline" className="ml-1.5 text-muted-foreground">
                          leadership
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.runningOwned}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.updatesWindow} / {m.updatesAll}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.milestonesDone}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.papersSubmitted} / {m.papersAccepted}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.blockersResolved}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* 8 — Students */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-medium">Students</h2>
          <p className="text-xs text-muted-foreground">
            Thesis-track progress, and what UTF students are involved in.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Thesis milestones on track" value={stats.students.planned} />
          <StatTile label="Overdue" value={stats.students.overdue} />
          <StatTile label="Completed" value={stats.students.done} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>UTF student contributions</CardTitle>
            <CardDescription>
              Projects they&apos;re tagged on, and the papers those projects produced.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.utf.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {`No UTF students tagged yet — add them on a project's People tab.`}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-right">Projects</TableHead>
                    <TableHead className="text-right">Running</TableHead>
                    <TableHead className="text-right">Done</TableHead>
                    <TableHead className="text-right">Papers sub / acc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.utf.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.name}
                        {s.archived && (
                          <Badge variant="outline" className="ml-1.5 text-muted-foreground">
                            archived
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.projectsTagged}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.running}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.done}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.papersSubmitted} / {s.papersAccepted}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
