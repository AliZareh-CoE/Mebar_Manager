import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateUserDialog } from "@/components/forms/create-user-dialog";
import { UserActiveToggle } from "@/components/user-active-toggle";
import { AnalystToggle, MakeCoordinatorButton } from "@/components/role-flag-controls";
import { UserAdminActions } from "@/components/user-admin-actions";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "MANAGER") redirect("/");

  const allUsers = await db.select().from(user).orderBy(asc(user.createdAt));
  const coordinator = allUsers.find((u) => u.isComputeCoordinator && !u.banned) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">
            Create accounts, manage access, and grant add-on roles. There is no
            self-signup.
          </p>
        </div>
        <CreateUserDialog />
      </div>

      {!coordinator && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
          No compute coordinator is set — compute requests can&apos;t be approved
          until a manager takes the role below.
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Add-ons</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allUsers.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell>
                <Badge variant={u.role === "MANAGER" ? "default" : "secondary"}>
                  {u.role === "MANAGER" ? "Manager" : "Engineer"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {u.isDataAnalyst && (
                    <Badge variant="outline" className="text-blue-600 dark:text-blue-400">
                      Data analyst
                    </Badge>
                  )}
                  {u.isComputeCoordinator && (
                    <Badge variant="outline" className="text-emerald-500">
                      Compute coordinator
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {u.banned ? (
                  <Badge variant="destructive">Deactivated</Badge>
                ) : (
                  <Badge variant="outline">Active</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(u.createdAt, "MMM d, yyyy")}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  {!u.banned && (
                    <AnalystToggle userId={u.id} isAnalyst={Boolean(u.isDataAnalyst)} />
                  )}
                  {!u.banned && u.role === "MANAGER" && !u.isComputeCoordinator && (
                    <MakeCoordinatorButton
                      userId={u.id}
                      name={u.name}
                      currentCoordinatorName={coordinator?.name ?? null}
                    />
                  )}
                  {u.id !== me.id && (
                    <UserActiveToggle userId={u.id} banned={Boolean(u.banned)} />
                  )}
                  {!u.banned && (
                    <UserAdminActions
                      userId={u.id}
                      name={u.name}
                      role={u.role ?? "ENGINEER"}
                      isCoordinator={Boolean(u.isComputeCoordinator)}
                      isSelf={u.id === me.id}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
