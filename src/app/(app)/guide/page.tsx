import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { FIGHT_TYPE_HELP, MECHANISM_HELP, type HelpContext } from "@/lib/help-copy";
import {
  PERFORMANCE_METRICS,
  PERFORMANCE_CATEGORIES,
  CATEGORY_LABELS,
  METRIC_CATEGORY,
  METRIC_LABELS,
} from "@/lib/performance-metrics";
import { StateBadge } from "@/components/state-badge";
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

const GATE_LABELS: Record<string, string> = {
  everyone: "anyone on the project",
  manager: "leadership",
  "project.approve": "whoever may approve proposals",
  "project.kill": "whoever may kill projects",
};

export default async function GuidePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const settings = await getSettings();
  const ctx: HelpContext = {
    thresholds: settings.thresholds,
    performance: settings.performance,
  };
  const t = settings.thresholds;
  const mech = (id: keyof typeof MECHANISM_HELP) => {
    const { title, body } = MECHANISM_HELP[id](ctx);
    return { title, paragraphs: Array.isArray(body) ? body : [body] };
  };
  const activeStates = settings.workflow.states.filter((s) => !s.archived);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          How {settings.labName} runs
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          No hidden rules. Every number on this page is the lab&apos;s live
          configuration — when the admin changes a threshold in Settings, this
          page changes with it. Each rule comes with how to win, not just how
          to stop losing.
        </p>
      </div>

      {/* The Fight List */}
      <Card id="fight-list">
        <CardHeader>
          <CardTitle>The Fight List</CardTitle>
          <CardDescription>
            The home page shows everything that&apos;s sitting still, sorted by
            how long it&apos;s been getting away with it. A red stripe means
            fight today; amber means fight this week. An empty Fight List is
            the goal state — here is every rule that can put something on it,
            and how to win against each one.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>What trips it</TableHead>
                <TableHead>Yells at</TableHead>
                <TableHead>How to clear it</TableHead>
                <TableHead>How to win</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.fightSectionOrder.map((type) => {
                const rule = settings.fightRules[type];
                const help = FIGHT_TYPE_HELP[type](ctx);
                return (
                  <TableRow key={type}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {rule.title}
                      {!rule.enabled && (
                        <Badge variant="outline" className="ml-1.5 text-muted-foreground">
                          off
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="min-w-48 text-muted-foreground">{help.what}</TableCell>
                    <TableCell className="min-w-32 text-muted-foreground">{help.who}</TableCell>
                    <TableCell className="min-w-44 text-muted-foreground">{help.clear}</TableCell>
                    <TableCell className="min-w-56 text-muted-foreground">{help.advice}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Lifecycle */}
      <Card id="lifecycle">
        <CardHeader>
          <CardTitle>The project lifecycle</CardTitle>
          <CardDescription>
            {mech("transitions").paragraphs.join(" ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {activeStates.map((s) => (
              <div key={s.key} className="flex flex-wrap items-center gap-2 text-sm">
                <StateBadge label={s.label} color={s.color} />
                <span className="text-muted-foreground">
                  {[
                    s.description,
                    s.flags.initial && "new projects start here",
                    s.flags.countsForStall && `the ${t.stallDays}-day stall clock runs here`,
                    s.flags.paused && "entering needs a reason + revive date",
                    s.flags.terminal && "final — no way out",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">The activation checkpoint: </span>
            {mech("lineupLock").paragraphs.join(" ")}
          </div>
          <p className="text-xs text-muted-foreground">
            Who may fire which transition:{" "}
            {settings.workflow.transitions
              .filter((tr) => activeStates.some((s) => s.key === tr.from))
              .map((tr) => `${tr.label} (${GATE_LABELS[tr.gate] ?? tr.gate})`)
              .join(" · ")}
            . Every transition lands in the project&apos;s History tab.
          </p>
        </CardContent>
      </Card>

      {/* Decisions & escalation */}
      <Card id="decisions">
        <CardHeader>
          <CardTitle>Decisions &amp; escalation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Decisions: </span>
            {mech("autoProceed").paragraphs.join(" ")}
          </p>
          <p>
            <span className="font-medium text-foreground">Escalation: </span>
            {mech("escalate").paragraphs.join(" ")}
          </p>
          <p>
            <span className="font-medium text-foreground">Cause tags: </span>
            {mech("paretoCause").paragraphs.join(" ")}
          </p>
        </CardContent>
      </Card>

      {/* Papers */}
      <Card id="papers">
        <CardHeader>
          <CardTitle>Papers</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          {mech("papers").paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p>
            Lifecycle: Drafting → Submitted (venue required) → Accepted 🎉 /
            Rejected / Withdrawn. Rejected and withdrawn papers resubmit on the
            same row — the reason stays on the record. Accepted is terminal.
            That&apos;s the whole point.
          </p>
        </CardContent>
      </Card>

      {/* Compute */}
      <Card id="compute">
        <CardHeader>
          <CardTitle>Compute</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>{mech("computeBar").paragraphs.join(" ")}</p>
          <p>{mech("computeResultsOwed").paragraphs.join(" ")}</p>
          <p>
            Mandatory practices by server type:{" "}
            {settings.serverTypes
              .filter((s) => !s.archived)
              .map((s) => {
                const practices = s.mandatoryPractices
                  .map(
                    (key) => settings.practices.find((p) => p.key === key)?.label ?? key
                  )
                  .join(", ");
                return `${s.label}${practices ? ` (requires: ${practices})` : ""}`;
              })
              .join(" · ")}
            .
          </p>
        </CardContent>
      </Card>

      {/* Scoring */}
      <Card id="scoring">
        <CardHeader>
          <CardTitle>Scoring</CardTitle>
          <CardDescription>{mech("perfTotal").paragraphs.join(" ")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            <p>
              <span className="font-medium text-foreground">Delivery. </span>
              {mech("perfDelivery").paragraphs.join(" ")}
            </p>
            <p>
              <span className="font-medium text-foreground">Discipline. </span>
              {mech("perfDiscipline").paragraphs.join(" ")}
            </p>
            <p>
              <span className="font-medium text-foreground">Initiative-taking. </span>
              {mech("perfInitiative").paragraphs.join(" ")}
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>What counts</TableHead>
                  <TableHead className="text-right">Points each</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PERFORMANCE_CATEGORIES.flatMap((cat) =>
                  PERFORMANCE_METRICS.filter((m) => METRIC_CATEGORY[m] === cat).map(
                    (m, i) => (
                      <TableRow key={m}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {i === 0 ? CATEGORY_LABELS[cat] : ""}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {METRIC_LABELS[m]}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${settings.performance.weights[m] < 0 ? "text-red-500" : ""}`}
                        >
                          {settings.performance.weights[m] > 0 ? "+" : ""}
                          {settings.performance.weights[m]}
                        </TableCell>
                      </TableRow>
                    )
                  )
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">The anti-gaming locks: </span>
            {mech("dateLock").paragraphs.join(" ")} PI and first author freeze
            once a project activates, and a paper acceptance is confirmed by a
            coordinator — never by the person earning the points.
          </p>
        </CardContent>
      </Card>

      {/* Age pill */}
      <Card id="age">
        <CardHeader>
          <CardTitle>The age pill</CardTitle>
          <CardDescription>{mech("agePill").paragraphs.join(" ")}</CardDescription>
        </CardHeader>
      </Card>

      {/* Roles */}
      <Card id="roles">
        <CardHeader>
          <CardTitle>Who can do what</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Admin — </span>
            one person owns the dangerous stuff: accounts, every settings tab,
            feedback triage. Full leadership powers everywhere else.
          </p>
          <p>
            <span className="font-medium text-foreground">Managers (coordinators) — </span>
            activate, pause and kill projects; decide decisions; run
            initiatives; confirm paper acceptances; move locked dates; see
            everything and everyone, including the standings.
          </p>
          <p>
            <span className="font-medium text-foreground">Researchers — </span>
            file proposals, run their projects, raise blockers, request data
            and compute, file papers. See their own involvement (and their own
            fights and score).
          </p>
          <p>
            <span className="font-medium text-foreground">Secretary — </span>
            receives tasks with deadlines; sees only their own task list. The
            same anti-stall rules apply.
          </p>
          <p>
            <span className="font-medium text-foreground">Add-ons — </span>
            data analysts deliver data requests; the one compute coordinator
            decides all compute. Add-ons stack on any role — hats compose.
          </p>
        </CardContent>
      </Card>

      {/* Playbook */}
      <Card id="playbook">
        <CardHeader>
          <CardTitle>
            The playbook: running {t.minActiveProjects} projects at once (and winning)
          </CardTitle>
          <CardDescription>
            The rules above are the whip. This is the technique — how good
            researchers actually carry {t.minActiveProjects} active projects
            without drowning.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Stagger the stages. </span>
            {`Never run ${t.minActiveProjects} projects at the same maturity: keep
            1–2 being scoped, 2–3 in active experiments, and one in writing.`}
            Staggered projects queue behind each other&apos;s dead time —
            reviews, data deliveries, compute windows — instead of competing
            for the same afternoon.
          </p>
          <p>
            <span className="font-medium text-foreground">Block time, don&apos;t multitask. </span>
            Give each project dedicated blocks — half-days, or multi-day focus
            bursts for writing — and never task-switch inside a block. Context
            switching is where multi-project time actually disappears; the
            block is the unit of progress.
          </p>
          <p>
            <span className="font-medium text-foreground">Keep a proposal in the pipeline. </span>
            Activation goes through leadership, so file the next proposal
            before you&apos;re under the bar — a proposal waiting for
            activation costs you nothing and covers your count the moment it
            goes live.
          </p>
          <p>
            <span className="font-medium text-foreground">Ask early, loudly, in writing. </span>
            The board rewards raising blockers and escalating — that&apos;s
            deliberate. The researchers who compound fastest are the ones who
            surface problems while they&apos;re still small; the write-up
            itself solves half of them.
          </p>
          <p>
            <span className="font-medium text-foreground">Write toward a target. </span>
            Pick the top-3 journal list before the first experiment finishes,
            draft methods while the runs execute, and treat every rejection as
            reviewer data for the resubmission — two weeks, next venue, same
            row.
          </p>
          <p>
            <span className="font-medium text-foreground">Let the meeting work for you. </span>
            The weekly update is five minutes that keeps your projects off the
            Fight List, resets the stall clock, and earns points. Post it
            before the meeting, and the meeting becomes about the science
            instead of the status.
          </p>
          <p className="border-t pt-3 text-xs">
            Further reading:{" "}
            <a
              href="https://www.cs.virginia.edu/~robins/YouAndYourResearch.html"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              Hamming, “You and Your Research”
            </a>
            {" · "}
            <a
              href="https://www.raulpacheco.org/2020/09/project-management-for-academics-iii-juggling-multiple-writing-research-projects/"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              Pacheco-Vega, “Juggling multiple research projects”
            </a>
            {" · "}
            <a
              href="https://www.springer.com/gp/authors-editors/journal-author/how-to-choose-a-target-journal/1396"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              Springer, “How to choose a target journal”
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
