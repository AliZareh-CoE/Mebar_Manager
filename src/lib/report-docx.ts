import "server-only";
import { format } from "date-fns";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { LabStats } from "@/lib/stats";
import { STATS_WINDOW_DAYS } from "@/lib/stats";
import type { ProjectReport } from "@/lib/report-data";

/**
 * Word-report builders. Shape follows the RPPR conventions a PI forwards
 * upward: outputs → portfolio → throughput/problems → personnel. Counts
 * only — nothing scoring-flavored leaves the app.
 */

const cell = (text: string, bold = false) =>
  new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
  });

function table(headers: string[], rows: (string | number)[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map((h) => cell(h, true)) }),
      ...rows.map(
        (r) => new TableRow({ children: r.map((v) => cell(String(v))) })
      ),
    ],
  });
}

const h1 = (text: string) =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } });
const h2 = (text: string) =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } });
const p = (text: string) => new Paragraph({ text, spacing: { after: 80 } });

export async function buildLabReportDocx(
  stats: LabStats,
  labName: string,
  now: Date
): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `${labName} — Lab Report`,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `Generated ${format(now, "MMMM d, yyyy")} · all-time plus the last ${STATS_WINDOW_DAYS} days`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),

          h1("Outputs"),
          p(
            `Papers: ${stats.headline.papersAccepted} accepted all-time, ${stats.headline.papersInFlight} under review. Median ${stats.cycle.medianDaysToSubmit ?? "—"} days from project start to submission; median ${stats.cycle.medianDaysToAccept ?? "—"} days from submission to acceptance.`
          ),
          table(
            ["Venue", "Drafting", "Submitted", "Accepted", "Closed"],
            stats.perVenue.map((v) => [v.venue, v.drafting, v.submitted, v.accepted, v.closed])
          ),

          h1("Portfolio"),
          p(
            `${stats.headline.projectsTotal} projects on record, ${stats.headline.projectsRunning} currently running.`
          ),
          table(
            ["State", "Projects"],
            stats.projectsByState.filter((s) => s.count > 0).map((s) => [s.label, s.count])
          ),

          h1("Throughput and problems"),
          p(
            `Open blockers: ${stats.headline.openBlockers}; median blocker life ${stats.bottlenecks.medianBlockerDays ?? "—"} days. Pending decisions: ${stats.headline.pendingDecisions}; median decision time ${stats.bottlenecks.medianDecisionHours ?? "—"} hours; ${stats.bottlenecks.autoProceeded} decisions auto-proceeded unanswered.`
          ),
          p(
            `Data requests: ${stats.requests.data.delivered} delivered (${stats.requests.data.onTimePct ?? "—"}% on time), ${stats.requests.data.open} open, ${stats.requests.data.external} external. Compute: ${stats.requests.compute.hoursApproved} hours approved, ${stats.requests.compute.pending} pending requests. Tasks: ${stats.requests.tasksDone} done, ${stats.requests.tasksOpen} open.`
          ),

          h1("Personnel"),
          h2("Members"),
          table(
            [
              "Person",
              "Running owned",
              `Updates ${STATS_WINDOW_DAYS}d/all`,
              "Milestones done",
              "Papers sub/acc",
              "Blockers resolved",
            ],
            stats.members.map((m) => [
              m.name,
              m.runningOwned,
              `${m.updatesWindow} / ${m.updatesAll}`,
              m.milestonesDone,
              `${m.papersSubmitted} / ${m.papersAccepted}`,
              m.blockersResolved,
            ])
          ),
          h2("UTF students"),
          ...(stats.utf.length === 0
            ? [p("No UTF students tagged on projects yet.")]
            : [
                table(
                  ["Student", "Projects", "Running", "Done", "Papers sub/acc"],
                  stats.utf.map((s) => [
                    s.name + (s.archived ? " (archived)" : ""),
                    s.projectsTagged,
                    s.running,
                    s.done,
                    `${s.papersSubmitted} / ${s.papersAccepted}`,
                  ])
                ),
              ]),
          h2("Thesis milestones"),
          p(
            `${stats.students.planned} on track, ${stats.students.overdue} overdue, ${stats.students.done} completed.`
          ),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export async function buildProjectReportDocx(
  data: ProjectReport,
  stateLabel: string,
  causeLabels: Record<string, string>,
  now: Date
): Promise<Buffer> {
  const { project } = data;
  const roleLabel: Record<string, string> = {
    PI: "PI",
    FIRST_AUTHOR: "First author",
    CONTRIBUTOR: "Contributor",
    UTF_STUDENT: "UTF student",
  };
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: project.title,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `Project report · ${stateLabel} · generated ${format(now, "MMMM d, yyyy")}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),

          h1("Overview"),
          p(project.description || "No description on record."),
          p(`Owner: ${data.project.owner.name} · Advisor: ${data.project.advisor.name} · Started ${format(project.createdAt, "MMM d, yyyy")}`),

          h1("Lineup"),
          table(
            ["Person", "Role", "Affiliation / note"],
            data.lineup.map((pp) => [
              pp.user?.name ?? pp.utfStudent?.name ?? pp.externalName ?? "—",
              roleLabel[pp.role] ?? pp.role,
              [pp.affiliation, pp.title].filter(Boolean).join(" — ") || "—",
            ])
          ),

          h1("Milestones"),
          ...(data.milestones.length === 0
            ? [p("No milestones on record.")]
            : [
                table(
                  ["Milestone", "Due", "Status"],
                  data.milestones.map((m) => [
                    m.title,
                    format(m.dueDate, "MMM d, yyyy"),
                    m.status,
                  ])
                ),
              ]),

          h1("Papers"),
          ...(data.papers.length === 0
            ? [p("No paper on record yet.")]
            : [
                table(
                  ["Title", "Venue", "Status"],
                  data.papers.map((pp) => [pp.title, pp.venue ?? "—", pp.status])
                ),
              ]),

          h1("Blockers"),
          ...(data.blockers.length === 0
            ? [p("No blockers on record.")]
            : [
                table(
                  ["Blocker", "Cause", "Status"],
                  data.blockers.map((b) => [
                    b.description,
                    causeLabels[b.causeTag] ?? b.causeTag,
                    b.status,
                  ])
                ),
              ]),

          h1("Recent updates"),
          ...(data.updates.length === 0
            ? [p("No updates posted.")]
            : data.updates
                .slice(0, 15)
                .flatMap((u) => [
                  p(
                    `${format(u.createdAt, "MMM d, yyyy")} — ${u.authorName ?? "Unknown"}: ${u.whatMoved}`
                  ),
                ])),

          h1("History"),
          ...(data.transitions.length === 0
            ? [p("No transitions on record.")]
            : data.transitions.map((t) =>
                p(
                  `${format(t.createdAt, "MMM d, yyyy")} — ${t.fromState} → ${t.toState}${t.byName ? ` (${t.byName})` : ""}${t.reason ? `: ${t.reason}` : ""}`
                )
              )),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
