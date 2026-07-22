import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { canAccessProject, visibleProjectIds, isVisible } from "@/lib/visibility";
import { resolveStateDisplay } from "@/lib/workflow";
import { loadProjectReport } from "@/lib/report-data";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  PI: "PI",
  FIRST_AUTHOR: "First author",
  CONTRIBUTOR: "Contributor",
  UTF_STUDENT: "UTF student",
};

/** Printable per-project report — same visibility as the project page. */
export default async function ProjectReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { id } = await params;
  if (!(await canAccessProject(me, id))) notFound();

  const settings = await getSettings();
  const visibleIds = await visibleProjectIds(me, settings);
  if (!isVisible(visibleIds, id)) notFound();

  const data = await loadProjectReport(id);
  if (!data) notFound();
  const now = new Date();
  const stateLabel = resolveStateDisplay(settings.workflow, data.project.state).label;
  const causeLabels = Object.fromEntries(settings.causeTags.map((t) => [t.key, t.label]));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 print:max-w-none print:gap-6">
      <style>{`@media print { header, nav, [data-slot=feedback] { display: none !important; } main { padding: 0 !important; } }`}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.project.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {`Project report · ${stateLabel} · generated ${format(now, "MMMM d, yyyy")}`}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button
            variant="outline"
            render={<a href={`/api/reports/project/${data.project.id}`} />}
          >
            Download Word
          </Button>
          <PrintButton />
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">Overview</h2>
        <p className="text-sm">{data.project.description || "No description on record."}</p>
        <p className="text-sm text-muted-foreground">
          {`Owner: ${data.project.owner.name} · Advisor: ${data.project.advisor.name} · Started ${format(data.project.createdAt, "MMM d, yyyy")}`}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">Lineup</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Affiliation / note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.lineup.map((pp) => (
              <TableRow key={pp.id}>
                <TableCell>
                  {pp.user?.name ?? pp.utfStudent?.name ?? pp.externalName ?? "—"}
                </TableCell>
                <TableCell>{ROLE_LABEL[pp.role] ?? pp.role}</TableCell>
                <TableCell className="text-muted-foreground">
                  {[pp.affiliation, pp.title].filter(Boolean).join(" — ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">Milestones</h2>
        {data.milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No milestones on record.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Milestone</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.milestones.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.title}</TableCell>
                  <TableCell>{format(m.dueDate, "MMM d, yyyy")}</TableCell>
                  <TableCell>{m.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">Papers</h2>
        {data.papers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No paper on record yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.papers.map((pp) => (
                <TableRow key={pp.id}>
                  <TableCell>{pp.title}</TableCell>
                  <TableCell>{pp.venue ?? "—"}</TableCell>
                  <TableCell>{pp.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">Blockers</h2>
        {data.blockers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blockers on record.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Blocker</TableHead>
                <TableHead>Cause</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.blockers.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.description}</TableCell>
                  <TableCell>{causeLabels[b.causeTag] ?? b.causeTag}</TableCell>
                  <TableCell>{b.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">Recent updates</h2>
        {data.updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates posted.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {data.updates.slice(0, 15).map((u, i) => (
              <li key={i}>
                <span className="text-muted-foreground">
                  {format(u.createdAt, "MMM d, yyyy")} — {u.authorName ?? "Unknown"}:{" "}
                </span>
                {u.whatMoved}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b pb-1 text-base font-medium">History</h2>
        {data.transitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transitions on record.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {data.transitions.map((t, i) => (
              <li key={i}>
                <span className="text-muted-foreground">
                  {format(t.createdAt, "MMM d, yyyy")} —{" "}
                </span>
                {t.fromState} → {t.toState}
                {t.byName ? ` (${t.byName})` : ""}
                {t.reason ? `: ${t.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="print:hidden">
        <Link
          href={`/projects/${data.project.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to the project
        </Link>
      </p>
    </div>
  );
}
