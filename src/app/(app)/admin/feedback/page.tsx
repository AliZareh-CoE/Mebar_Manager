import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { type FeedbackStatus } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { respondToFeedback } from "@/actions/feedback";
import { FormDialog } from "@/components/form-dialog";
import { EnumSelect } from "@/components/forms/labeled-selects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const GROUP_ORDER: FeedbackStatus[] = ["NEW", "PLANNED", "DONE", "DECLINED"];

const GROUPS: Record<FeedbackStatus, { title: string; blurb: string }> = {
  NEW: { title: "New", blurb: "Untriaged. Every submission deserves a verdict." },
  PLANNED: { title: "Planned", blurb: "Accepted — on the roadmap." },
  DONE: { title: "Done", blurb: "Shipped or fixed." },
  DECLINED: { title: "Declined", blurb: "Not doing — with reasons, so feedback keeps coming." },
};

const STATUS_OPTIONS = GROUP_ORDER.map((s) => ({ value: s, label: GROUPS[s].title }));

export default async function AdminFeedbackPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const rows = await db.query.feedback.findMany({
    with: {
      submitter: { columns: { id: true, name: true } },
      respondedBy: { columns: { id: true, name: true } },
    },
    orderBy: (f) => desc(f.createdAt),
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Bug reports and feature ideas from the lab — the header button, seen
          by every role. Triage them; declining needs a reason.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nothing yet. The 💬 button in the header feeds this page.
        </p>
      ) : (
        GROUP_ORDER.map((status) => {
          const group = rows.filter((f) => f.status === status);
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
                    <TableHead>Kind</TableHead>
                    <TableHead>Feedback</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            f.kind === "BUG"
                              ? "text-red-600 dark:text-red-400"
                              : "text-blue-600 dark:text-blue-400"
                          }
                        >
                          {f.kind === "BUG" ? "Bug" : "Idea"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="truncate font-medium" title={f.title}>
                          {f.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground" title={f.body}>
                          {f.body}
                        </p>
                        {f.adminResponse && (
                          <p
                            className="truncate text-xs text-emerald-600 dark:text-emerald-400"
                            title={f.adminResponse}
                          >
                            ↳ {f.adminResponse}
                            {f.respondedBy && (
                              <span className="text-muted-foreground"> — {f.respondedBy.name}</span>
                            )}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{f.submitter.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(f.createdAt, "MMM d")}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <FormDialog
                            trigger={<Button variant="outline" size="sm">Respond…</Button>}
                            title={`Respond: ${f.title}`}
                            description={f.body}
                            submitLabel="Save verdict"
                            successMessage="Feedback triaged."
                            action={respondToFeedback.bind(null, f.id)}
                          >
                            <div className="flex flex-col gap-2">
                              <Label>Status</Label>
                              <EnumSelect
                                name="status"
                                options={STATUS_OPTIONS}
                                defaultValue={f.status}
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <Label htmlFor={`fr-${f.id}`}>Response</Label>
                              <Textarea
                                id={`fr-${f.id}`}
                                name="adminResponse"
                                defaultValue={f.adminResponse ?? ""}
                                rows={3}
                                placeholder="Required when declining."
                              />
                            </div>
                          </FormDialog>
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
