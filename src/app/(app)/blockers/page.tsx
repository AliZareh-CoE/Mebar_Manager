import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, ne } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { user, type BlockerStatus } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { visibleProjectIds, isVisible } from "@/lib/visibility";
import { isLabLeadership } from "@/lib/policy";
import { isOverdue } from "@/lib/fight-engine";
import { MECHANISM_HELP, type HelpContext } from "@/lib/help-copy";
import { matchesQuery } from "@/lib/search";
import { SearchBar } from "@/components/search-bar";
import { DetailDialog } from "@/components/detail-dialog";
import { RemindButton } from "@/components/remind-button";
import { BlockerRowActions } from "@/components/blocker-row-actions";
import { FormDialog } from "@/components/form-dialog";
import { disputeResolution } from "@/actions/blockers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const GROUP_ORDER: BlockerStatus[] = ["ESCALATED", "OPEN", "RESOLVED", "CANCELLED"];

const GROUPS: Record<BlockerStatus, { title: string; blurb: string }> = {
  ESCALATED: { title: "Escalated", blurb: "Past their deadline and raised to the advisor — the hottest fires first." },
  OPEN: { title: "Open", blurb: "Live blockers, on-track or not. Every one has (or needs) an owner who kills it." },
  RESOLVED: { title: "Resolved", blurb: "Killed, with the fix on the record." },
  CANCELLED: { title: "Cancelled", blurb: "No longer relevant, with reasons." },
};

/** Every blocker across every visible project — nothing hides here. */
export default async function BlockersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "SECRETARY") redirect("/tasks");

  const settings = await getSettings();
  const visibleIds = await visibleProjectIds(me, settings);

  const [allBlockers, allPeople] = await Promise.all([
    db.query.blockers.findMany({
      with: {
        project: { columns: { id: true, title: true } },
        owner: { columns: { id: true, name: true } },
      },
      orderBy: (b) => desc(b.createdAt),
    }),
    db.select({ id: user.id, name: user.name }).from(user).where(ne(user.banned, true)),
  ]);

  const visible = allBlockers
    .filter((b) => isVisible(visibleIds, b.projectId))
    .filter((b) =>
      matchesQuery(q, b.description, b.resolutionNote, b.project.title, b.owner?.name)
    );
  const now = new Date();
  const causeLabels = Object.fromEntries(settings.causeTags.map((t) => [t.key, t.label]));
  const helpCtx: HelpContext = {
    thresholds: settings.thresholds,
    performance: settings.performance,
    viewerSeesScores: isLabLeadership(me),
  };
  const statusBadge = (b: (typeof visible)[number]) =>
    b.status === "CANCELLED" ? (
      <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>
    ) : b.status === "RESOLVED" ? (
      <Badge variant="outline" className="text-emerald-500">Resolved</Badge>
    ) : b.status === "ESCALATED" ? (
      <Badge variant="destructive">Escalated</Badge>
    ) : (
      <Badge variant="outline">Open</Badge>
    );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Blockers</h1>
        <SearchBar placeholder="Search blockers…" className="mt-2" />
        <p className="text-sm text-muted-foreground">
          Every blocker on every project you can see — escalated or calm,
          yours or not. The Fight List shows only the ones breaking rules;
          this page hides nothing.
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {q ? "No blockers match the search." : "No blockers anywhere. Suspicious… or excellent."}
        </p>
      ) : (
        GROUP_ORDER.map((status) => {
          const group = visible.filter((b) => b.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} className="flex flex-col gap-3">
              <div>
                <h2 className="text-base font-medium">
                  {GROUPS[status].title}{" "}
                  <span className="text-muted-foreground">({group.length})</span>
                </h2>
                <p className="text-xs text-muted-foreground">{GROUPS[status].blurb}</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Blocker</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="max-w-xs">
                        <DetailDialog
                          title="Blocker"
                          fields={[
                            { label: "Status", value: GROUPS[b.status as BlockerStatus].title },
                            { label: "What's stuck", value: b.description },
                            { label: "Cause", value: causeLabels[b.causeTag] ?? b.causeTag },
                            { label: "Resolution note", value: b.resolutionNote },
                            {
                              label: "Project",
                              value: (
                                <Link
                                  href={`/projects/${b.project.id}`}
                                  className="underline underline-offset-4"
                                >
                                  {b.project.title}
                                </Link>
                              ),
                            },
                            { label: "Owner", value: b.owner?.name ?? "Unassigned" },
                            { label: "Deadline", value: format(b.deadline, "MMM d, yyyy") },
                            { label: "Raised", value: format(b.createdAt, "MMM d, yyyy") },
                          ]}
                          trigger={
                            <button type="button" className="block w-full min-w-0 cursor-pointer text-left">
                              <span className="block truncate font-medium underline-offset-4 hover:underline">
                                {b.description}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {b.resolutionNote
                                  ? `✓ ${b.resolutionNote}`
                                  : (causeLabels[b.causeTag] ?? b.causeTag)}
                              </span>
                            </button>
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/projects/${b.project.id}`}
                          className="text-sm underline-offset-4 hover:underline"
                        >
                          {b.project.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {b.owner?.name ?? (
                          <span className="text-amber-600 dark:text-amber-400">Unassigned</span>
                        )}
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
                        <div className="flex items-center justify-end gap-1">
                          {isLabLeadership(me) &&
                            b.owner &&
                            b.status !== "RESOLVED" &&
                            b.status !== "CANCELLED" && (
                              <RemindButton
                                toUserId={b.owner.id}
                                recipientName={b.owner.name}
                                about={`Blocker: ${b.description.slice(0, 200)} — ${b.project.title}`}
                                due={`Deadline: ${format(b.deadline, "MMM d, yyyy")}`}
                              />
                            )}
                          {statusBadge(b)}
                          {isLabLeadership(me) && b.status === "RESOLVED" && (
                            <FormDialog
                              trigger={<Button variant="outline" size="sm">Dispute…</Button>}
                              title="Not actually solved?"
                              description="For audits: if this was marked resolved but isn't, the blocker reopens and the false resolution is recorded against its owner — their score takes the penalty."
                              submitLabel="Dispute it"
                              successMessage="Disputed. The blocker is back open."
                              action={disputeResolution.bind(null, b.id)}
                            >
                              <div className="flex flex-col gap-2">
                                <Label htmlFor={`dn-${b.id}`}>What did you find?</Label>
                                <Textarea id={`dn-${b.id}`} name="note" rows={3} required />
                              </div>
                            </FormDialog>
                          )}
                          <BlockerRowActions
                            escalateHelp={MECHANISM_HELP.escalate(helpCtx)}
                            blockerId={b.id}
                            status={b.status}
                            ownerId={b.ownerId}
                            people={allPeople}
                            edit={{
                              description: b.description,
                              causeTag: b.causeTag,
                              deadlineISO: format(b.deadline, "yyyy-MM-dd"),
                              causeOptions: settings.causeTags
                                .filter((t) => !t.archived || t.key === b.causeTag)
                                .map((t) => ({ value: t.key, label: t.label })),
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          );
        })
      )}
    </div>
  );
}
