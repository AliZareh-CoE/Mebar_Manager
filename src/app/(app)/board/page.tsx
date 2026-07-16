import { MECHANISM_HELP, type HelpContext } from "@/lib/help-copy";
import { InfoHint } from "@/components/info-hint";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, asc, ne } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { projectAgeDays } from "@/lib/fight-engine";
import {
  activationStateKeys,
  hiddenFromBoardKeys,
  resolveStateDisplay,
  stateByKey,
} from "@/lib/workflow";
import { getSettings } from "@/lib/settings";
import { visibleProjectIds, isVisible } from "@/lib/visibility";
import { StateBadge } from "@/components/state-badge";
import { AgePill } from "@/components/age-pill";
import { Initials } from "@/components/initials";
import { BoardFilters } from "@/components/board-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; owner?: string }>;
}) {
  // Per-page guard: the layout's check doesn't re-run on partial RSC
  // renders, so every page must validate the session itself.
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  // Secretaries live in their task list — no project surfaces.
  if (me.role === "SECRETARY") redirect("/tasks");

  const { state, owner } = await searchParams;
  const settings = await getSettings();
  const visibleIds = await visibleProjectIds(me, settings);

  const workflow = settings.workflow;
  const activationKeys = activationStateKeys(workflow);
  const hiddenKeys = new Set(hiddenFromBoardKeys(workflow));

  const [projects, owners] = await Promise.all([
    db.query.projects.findMany({
      with: {
        owner: { columns: { id: true, name: true } },
        updates: {
          columns: { createdAt: true },
          orderBy: (u) => desc(u.createdAt),
          limit: 1,
        },
        transitions: {
          columns: { createdAt: true },
          where: (t, { inArray }) =>
            inArray(t.toState, activationKeys.length ? activationKeys : ["__NONE__"]),
          orderBy: (t) => desc(t.createdAt),
          limit: 1,
        },
        milestones: {
          orderBy: (m) => asc(m.dueDate),
        },
      },
      orderBy: (p) => desc(p.createdAt),
    }),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(ne(user.banned, true)),
  ]);

  const now = new Date();
  const stateFilter = state && stateByKey(workflow, state) ? state : null;

  const visible = projects
    .filter((p) => isVisible(visibleIds, p.id))
    .filter((p) => (stateFilter ? p.state === stateFilter : !hiddenKeys.has(p.state)))
    .filter((p) => (owner ? p.ownerId === owner : true));

  const filterStates = workflow.states
    .filter((s) => !s.archived)
    .map((s) => ({ key: s.key, label: s.label }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Every project, colored by how long since it moved.
            <InfoHint
              {...MECHANISM_HELP.agePill({
                thresholds: settings.thresholds,
                performance: settings.performance,
              } satisfies HelpContext)}
            />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BoardFilters owners={owners} states={filterStates} />
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href="/projects/new">New proposal</Link>}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No projects match. Start one — the lab doesn&apos;t run itself.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => {
            const currentMilestone = p.milestones.find(
              (m) => m.status === "PLANNED" || m.status === "IN_PROGRESS"
            );
            const age = projectAgeDays(
              {
                lastUpdateAt: p.updates[0]?.createdAt ?? null,
                lastActivatedAt: p.transitions[0]?.createdAt ?? null,
                createdAt: p.createdAt,
              },
              now
            );
            const flags = stateByKey(workflow, p.state)?.flags;
            const display = resolveStateDisplay(workflow, p.state);
            const moving = flags?.countsForStall ?? false;
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-foreground/20">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{p.title}</CardTitle>
                      <StateBadge label={display.label} color={display.color} />
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Initials name={p.owner.name} className="size-5" />
                      {p.owner.name}
                    </div>
                    {currentMilestone ? (
                      <p className="text-sm text-muted-foreground">
                        <span className="text-foreground/80">{currentMilestone.title}</span>{" "}
                        · due {format(currentMilestone.dueDate, "MMM d")}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No open milestone</p>
                    )}
                    {moving && (
                      <AgePill
                        ageDays={age}
                        freshDays={settings.thresholds.ageFreshDays}
                        agingDays={settings.thresholds.ageAgingDays}
                        className="self-start"
                      />
                    )}
                    {flags?.paused && p.reviveDate && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        revives {format(p.reviveDate, "MMM d, yyyy")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
