import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { user, type DataRequestStatus } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { visibleProjectIds, isVisible } from "@/lib/visibility";
import { isOverdue } from "@/lib/fight-engine";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataRequestRowActions } from "@/components/data-request-row-actions";

export const dynamic = "force-dynamic";

const GROUP_ORDER: DataRequestStatus[] = ["OPEN", "DELIVERED", "CANCELLED"];

const GROUPS: Record<DataRequestStatus, { title: string; blurb: string }> = {
  OPEN: { title: "Open", blurb: "The analysts' queue. Unassigned requests escalate after the grace period." },
  DELIVERED: { title: "Delivered", blurb: "Closed with a handoff note — where the data lives and how it was collected." },
  CANCELLED: { title: "Cancelled", blurb: "No longer needed, with reasons on the record." },
};

export default async function DataPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const settings = await getSettings();
  const visibleIds = await visibleProjectIds(me, settings);

  const [allRequests, analysts] = await Promise.all([
    db.query.dataRequests.findMany({
      with: {
        project: { columns: { id: true, title: true } },
        requester: { columns: { id: true, name: true } },
        assignee: { columns: { id: true, name: true } },
      },
      orderBy: (dr) => desc(dr.createdAt),
    }),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(eq(user.isDataAnalyst, true), ne(user.banned, true))),
  ]);

  const requests = allRequests.filter((r) => isVisible(visibleIds, r.projectId));
  const now = new Date();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data</h1>
        <p className="text-sm text-muted-foreground">
          {analysts.length > 0 ? (
            <>
              Every data request, delivered by{" "}
              <span className="text-foreground/80">
                {analysts.map((a) => a.name).join(", ")}
              </span>
              . Unowned requests escalate after {settings.thresholds.unownedGraceDays} days.
            </>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              No data analysts yet — a coordinator can grant the analyst add-on
              on the People page.
            </span>
          )}
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No data requests yet. File one from a project&apos;s Data tab.
        </p>
      ) : (
        GROUP_ORDER.map((status) => {
          const group = requests.filter((r) => r.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} className="flex flex-col gap-3">
              <div>
                <h2 className="font-medium">
                  {GROUPS[status].title}{" "}
                  <span className="text-muted-foreground">({group.length})</span>
                </h2>
                <p className="text-xs text-muted-foreground">{GROUPS[status].blurb}</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>What&apos;s needed</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Needed by</TableHead>
                    <TableHead>Analyst</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.map((dr) => (
                    <TableRow key={dr.id}>
                      <TableCell className="max-w-xs">
                        <p className="truncate font-medium" title={dr.title}>
                          {dr.title}
                        </p>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={dr.deliveryNote ?? dr.description}
                        >
                          {dr.status !== "OPEN" && dr.deliveryNote
                            ? `✓ ${dr.deliveryNote}`
                            : dr.description}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/projects/${dr.project.id}`}
                          className="text-sm underline-offset-4 hover:underline"
                        >
                          {dr.project.title}
                        </Link>
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
                        {dr.assignee?.name ?? (
                          <span className="text-amber-600 dark:text-amber-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {dr.status === "OPEN" ? (
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
                        ) : (
                          <div className="text-right">
                            <Badge
                              variant="outline"
                              className={
                                dr.status === "DELIVERED"
                                  ? "text-emerald-500"
                                  : "text-muted-foreground"
                              }
                            >
                              {dr.status === "DELIVERED" ? "Delivered" : "Cancelled"}
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
