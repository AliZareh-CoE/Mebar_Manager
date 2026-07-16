import { redirect } from "next/navigation";
import { and, desc, ne, or, eq } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { user, type InitiativeStatus } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { isLabLeadership } from "@/lib/policy";
import { isOverdue } from "@/lib/fight-engine";
import { fileInitiative } from "@/actions/initiatives";
import { FormDialog } from "@/components/form-dialog";
import { PersonSelect } from "@/components/forms/labeled-selects";
import { InitiativeRowActions } from "@/components/initiative-row-actions";
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

const GROUP_ORDER: InitiativeStatus[] = ["OPEN", "WON", "LOST", "CANCELLED"];

const GROUPS: Record<InitiativeStatus, { title: string; blurb: string }> = {
  OPEN: {
    title: "Open fights",
    blurb: "Equipment, budgets, university management. Someone owns each one until it's won or lost.",
  },
  WON: { title: "Won", blurb: "Fights the lab won. Someone gets the credit." },
  LOST: { title: "Lost", blurb: "Fought and lost — with what we'd do differently, on the record." },
  CANCELLED: { title: "Cancelled", blurb: "No longer worth fighting, with reasons." },
};

const STATUS_BADGE: Record<Exclude<InitiativeStatus, "OPEN">, { label: string; className: string }> = {
  WON: { label: "Won", className: "text-emerald-500" },
  LOST: { label: "Lost", className: "text-red-600 dark:text-red-400" },
  CANCELLED: { label: "Cancelled", className: "text-muted-foreground" },
};

export default async function InitiativesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  // Leadership-only surface: managers and the compute coordinator.
  if (!isLabLeadership(me)) redirect("/");

  const settings = await getSettings();

  const [allInitiatives, leadership] = await Promise.all([
    db.query.initiatives.findMany({
      with: {
        requester: { columns: { id: true, name: true } },
        assignee: { columns: { id: true, name: true } },
      },
      orderBy: (i) => desc(i.createdAt),
    }),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(
        and(
          or(eq(user.role, "MANAGER"), eq(user.isComputeCoordinator, true)),
          ne(user.banned, true)
        )
      ),
  ]);

  const leadershipPeople = leadership;
  const now = new Date();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Initiatives</h1>
          <p className="text-sm text-muted-foreground">
            The weekly meeting&apos;s big fights — equipment, budgets, the
            university. Assigned to leadership; overdue ones escalate after{" "}
            {settings.thresholds.unownedGraceDays} days unowned.
          </p>
        </div>
        <FormDialog
          trigger={<Button>File initiative</Button>}
          title="File an initiative"
          description="A fight worth having, with a deadline and (ideally) a fighter."
          submitLabel="File it"
          successMessage="Initiative filed. Now it can be fought."
          action={fileInitiative}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="i-title">The fight</Label>
            <Input
              id="i-title"
              name="title"
              placeholder="e.g. Dedicated GPU budget line for 2027"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="i-description">Details</Label>
            <Textarea
              id="i-description"
              name="description"
              placeholder="What we want, who decides, what we've tried."
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Fighter</Label>
            <PersonSelect
              name="assigneeId"
              people={leadershipPeople}
              placeholder="Unassigned (escalates after the grace period)"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="i-deadline">Deadline</Label>
            <Input id="i-deadline" name="deadline" type="date" required />
          </div>
        </FormDialog>
      </div>

      {allInitiatives.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No initiatives yet. The weekly meeting surely produced one.
        </p>
      ) : (
        GROUP_ORDER.map((status) => {
          const group = allInitiatives.filter((i) => i.status === status);
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
                    <TableHead>Initiative</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Fighter</TableHead>
                    <TableHead>Filed by</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="max-w-md">
                        <p className="truncate font-medium" title={i.title}>
                          {i.title}
                        </p>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={i.closureNote ?? i.description}
                        >
                          {i.status !== "OPEN" && i.closureNote
                            ? `✓ ${i.closureNote}`
                            : i.description}
                        </p>
                      </TableCell>
                      <TableCell
                        className={
                          i.status === "OPEN" && isOverdue(i.deadline, now)
                            ? "font-medium text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                        }
                      >
                        {format(i.deadline, "MMM d")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {i.assignee?.name ?? (
                          <span className="text-amber-600 dark:text-amber-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {i.requester.name}
                      </TableCell>
                      <TableCell>
                        {i.status === "OPEN" ? (
                          <InitiativeRowActions
                            initiativeId={i.id}
                            status={i.status}
                            assigneeId={i.assigneeId}
                            leadership={leadershipPeople}
                            meId={me.id}
                            edit={{
                              title: i.title,
                              description: i.description,
                              deadlineISO: format(i.deadline, "yyyy-MM-dd"),
                            }}
                          />
                        ) : (
                          <div className="text-right">
                            <Badge
                              variant="outline"
                              className={STATUS_BADGE[i.status as Exclude<InitiativeStatus, "OPEN">].className}
                            >
                              {STATUS_BADGE[i.status as Exclude<InitiativeStatus, "OPEN">].label}
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
