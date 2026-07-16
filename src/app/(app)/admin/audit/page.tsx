import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, like } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// Dotted-namespace roots → filter chips. "" = All. Prefix semantics: the
// "Transitions" chip (project) also catches projectPeople rows; the Lineup
// chip is the exact subset.
const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "project", label: "Transitions" },
  { value: "projectPeople", label: "Lineup" },
  { value: "milestone", label: "Milestones" },
  { value: "task", label: "Tasks" },
  { value: "dataRequest", label: "Data" },
  { value: "paper", label: "Papers" },
  { value: "settings", label: "Settings" },
  { value: "user", label: "Roles" },
];

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const { action } = await searchParams;
  const prefix = (action ?? "").trim();

  const rows = await db.query.auditEvents.findMany({
    where: prefix ? like(auditEvents.action, `${prefix}%`) : undefined,
    with: { actor: { columns: { name: true } } },
    orderBy: (a) => desc(a.at),
    limit: 500,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          {`Every privileged change on the record — transitions, lineup and date overrides, paper acceptances, settings saves, role grants. Newest first, most recent 500. Account creation, bans, and password resets run through the auth provider and aren't recorded here.`}
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = prefix === f.value;
          return (
            <Link
              key={f.value || "all"}
              href={f.value ? `/admin/audit?action=${f.value}` : "/admin/audit"}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nothing recorded{prefix ? " for this filter" : " yet"}.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">When</TableHead>
              <TableHead className="w-40">Who</TableHead>
              <TableHead className="w-48">Action</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                  {format(r.at, "MMM d, HH:mm")}
                </TableCell>
                <TableCell>{r.actor?.name ?? "system"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {r.action}
                  </Badge>
                </TableCell>
                <TableCell>{r.summary}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
