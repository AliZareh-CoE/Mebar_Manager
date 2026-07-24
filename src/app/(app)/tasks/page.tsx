import { SearchBar } from "@/components/search-bar";
import { matchesQuery } from "@/lib/search";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { user, type TaskStatus } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { visibleProjectIds, visibleTaskIds, isVisible } from "@/lib/visibility";
import { isOverdue } from "@/lib/fight-engine";
import { fileTask } from "@/actions/tasks";
import { FormDialog } from "@/components/form-dialog";
import { PersonSelect } from "@/components/forms/labeled-selects";
import { TaskRowActions } from "@/components/task-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const GROUP_ORDER: TaskStatus[] = ["OPEN", "DONE", "CANCELLED"];

const GROUPS: Record<TaskStatus, { title: string; blurb: string }> = {
  OPEN: { title: "Open", blurb: "The secretaries' queue. Unassigned tasks escalate after the grace period." },
  DONE: { title: "Done", blurb: "Closed with a note — what was done." },
  CANCELLED: { title: "Cancelled", blurb: "No longer needed, with reasons on the record." },
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const settings = await getSettings();
  const [taskIds, projectIds] = await Promise.all([
    visibleTaskIds(me, settings),
    visibleProjectIds(me, settings),
  ]);

  const [allTasks, secretaries, projectRows] = await Promise.all([
    db.query.tasks.findMany({
      with: {
        project: { columns: { id: true, title: true } },
        requester: { columns: { id: true, name: true } },
        assignee: { columns: { id: true, name: true } },
      },
      orderBy: (t) => desc(t.createdAt),
    }),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(eq(user.role, "SECRETARY"), ne(user.banned, true))),
    db.query.projects.findMany({ columns: { id: true, title: true } }),
  ]);

  const visible = allTasks
    .filter((t) => isVisible(taskIds, t.id))
    .filter((t) => matchesQuery(q, t.title, t.description, t.assignee?.name, t.requester?.name));
  const linkableProjects = projectRows
    .filter((p) => isVisible(projectIds, p.id))
    .map((p) => ({ id: p.id, name: p.title }));
  const now = new Date();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <SearchBar placeholder="Search tasks…" className="mt-2" />
          <p className="text-sm text-muted-foreground">
            {secretaries.length > 0 ? (
              <>
                Anything the lab needs done, handled by{" "}
                <span className="text-foreground/80">
                  {secretaries.map((s) => s.name).join(", ")}
                </span>
                . Deadlines fight back; unowned tasks escalate after{" "}
                {settings.thresholds.unownedGraceDays} days.
              </>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                No secretaries yet — a manager can set the Secretary role on
                the People page.
              </span>
            )}
          </p>
        </div>
        <FormDialog
          trigger={<Button>File task</Button>}
          title="File a task"
          description="Anything with a deadline. The assigned secretary owns it; unassigned tasks escalate."
          submitLabel="File it"
          successMessage="Task filed."
          action={fileTask}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-title">Task</Label>
            <Input id="t-title" name="title" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-description">Details</Label>
            <Textarea
              id="t-description"
              name="description"
              placeholder="What done looks like, and anything they'll need."
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Secretary</Label>
            <PersonSelect
              name="assigneeId"
              people={secretaries}
              placeholder="Unassigned (any secretary can claim)"
            />
          </div>
          {me.role !== "SECRETARY" && linkableProjects.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Project (optional)</Label>
              <PersonSelect
                name="projectId"
                people={linkableProjects}
                placeholder="No project"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-deadline">Deadline</Label>
            <Input id="t-deadline" name="deadline" type="date" required />
          </div>
        </FormDialog>
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No tasks yet. File one — hallway asks don&apos;t have deadlines.
        </p>
      ) : (
        GROUP_ORDER.map((status) => {
          const group = visible.filter((t) => t.status === status);
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
                    <TableHead>Task</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Secretary</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="max-w-xs">
                        <p className="truncate font-medium" title={t.title}>
                          {t.title}
                        </p>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={t.completionNote ?? t.description}
                        >
                          {t.status !== "OPEN" && t.completionNote
                            ? `✓ ${t.completionNote}`
                            : t.description}
                        </p>
                      </TableCell>
                      <TableCell>
                        {t.project && isVisible(projectIds, t.project.id) ? (
                          <Link
                            href={`/projects/${t.project.id}`}
                            className="text-sm underline-offset-4 hover:underline"
                          >
                            {t.project.title}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={
                          t.status === "OPEN" && isOverdue(t.deadline, now)
                            ? "font-medium text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                        }
                      >
                        {format(t.deadline, "MMM d")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.assignee?.name ?? (
                          <span className="text-amber-600 dark:text-amber-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.status === "OPEN" ? (
                          <TaskRowActions
                            taskId={t.id}
                            status={t.status}
                            assigneeId={t.assigneeId}
                            secretaries={secretaries}
                            meId={me.id}
                            meIsSecretary={me.role === "SECRETARY"}
                            edit={{
                              title: t.title,
                              description: t.description,
                              deadlineISO: format(t.deadline, "yyyy-MM-dd"),
                            }}
                          />
                        ) : (
                          <div className="text-right">
                            <Badge
                              variant="outline"
                              className={
                                t.status === "DONE"
                                  ? "text-emerald-500"
                                  : "text-muted-foreground"
                              }
                            >
                              {t.status === "DONE" ? "Done" : "Cancelled"}
                            </Badge>
                          </div>
                        )}
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
