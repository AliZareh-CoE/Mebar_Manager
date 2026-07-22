import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { isLabLeadership } from "@/lib/policy";
import { loadStatsInput } from "@/lib/stats-data";
import { computeStats, STATS_WINDOW_DAYS } from "@/lib/stats";
import { PrintButton } from "@/components/print-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

/**
 * The printable whole-lab report — RPPR-shaped (outputs → portfolio →
 * throughput/problems → personnel) so it forwards upward with minimal
 * editing. Print it via the button; "Save as PDF" is the browser's.
 */
export default async function LabReportPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isLabLeadership(me)) redirect("/");

  const settings = await getSettings();
  const now = new Date();
  const stats = computeStats(await loadStatsInput(), settings.workflow.states, now);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 print:max-w-none print:gap-6">
      <style>{`@media print { header, nav, [data-slot=feedback] { display: none !important; } main { padding: 0 !important; } }`}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {`${settings.labName} — Lab report`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {`Generated ${format(now, "MMMM d, yyyy")} · all-time plus the last ${STATS_WINDOW_DAYS} days · counts from the record`}
          </p>
        </div>
        <PrintButton />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">Outputs</h2>
        <p className="text-sm">
          {`${stats.headline.papersAccepted} papers accepted all-time; ${stats.headline.papersInFlight} under review. Median ${stats.cycle.medianDaysToSubmit ?? "—"} days from project start to submission, ${stats.cycle.medianDaysToAccept ?? "—"} days from submission to acceptance.`}
        </p>
        {stats.perVenue.length > 0 && (
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
                  <TableCell>{v.venue}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.drafting}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.submitted}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.accepted}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.closed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">Portfolio</h2>
        <p className="text-sm">
          {`${stats.headline.projectsTotal} projects on record, ${stats.headline.projectsRunning} currently running.`}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Projects</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.projectsByState
              .filter((s) => s.count > 0)
              .map((s) => (
                <TableRow key={s.key}>
                  <TableCell>{s.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">Throughput and problems</h2>
        <p className="text-sm">
          {`Open blockers: ${stats.headline.openBlockers} (median life ${stats.bottlenecks.medianBlockerDays ?? "—"} days). Pending decisions: ${stats.headline.pendingDecisions} (median ${stats.bottlenecks.medianDecisionHours ?? "—"} hours to decide; ${stats.bottlenecks.autoProceeded} auto-proceeded unanswered).`}
        </p>
        <p className="text-sm">
          {`Data requests: ${stats.requests.data.delivered} delivered, ${stats.requests.data.onTimePct ?? "—"}% on time, ${stats.requests.data.open} open, ${stats.requests.data.external} external. Compute: ${stats.requests.compute.hoursApproved} hours approved, ${stats.requests.compute.pending} pending. Tasks: ${stats.requests.tasksDone} done, ${stats.requests.tasksOpen} open.`}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">Personnel</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead className="text-right">Running owned</TableHead>
              <TableHead className="text-right">{`Updates ${STATS_WINDOW_DAYS}d / all`}</TableHead>
              <TableHead className="text-right">Milestones</TableHead>
              <TableHead className="text-right">Papers sub / acc</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.name}</TableCell>
                <TableCell className="text-right tabular-nums">{m.runningOwned}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.updatesWindow} / {m.updatesAll}
                </TableCell>
                <TableCell className="text-right tabular-nums">{m.milestonesDone}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.papersSubmitted} / {m.papersAccepted}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {stats.utf.length > 0 && (
          <>
            <h3 className="mt-2 text-sm font-medium">UTF students</h3>
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
                    <TableCell>{s.name}{s.archived ? " (archived)" : ""}</TableCell>
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
          </>
        )}
        <p className="text-sm">
          {`Thesis milestones: ${stats.students.planned} on track, ${stats.students.overdue} overdue, ${stats.students.done} completed.`}
        </p>
      </section>
    </div>
  );
}
