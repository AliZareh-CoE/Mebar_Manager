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
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "MANAGER") redirect("/");

  const allUsers = await db.select().from(user).orderBy(asc(user.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">
            Create accounts and manage access. There is no self-signup.
          </p>
        </div>
        <CreateUserDialog />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
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
                {u.banned ? (
                  <Badge variant="destructive">Deactivated</Badge>
                ) : (
                  <Badge variant="outline">Active</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(u.createdAt, "MMM d, yyyy")}
              </TableCell>
              <TableCell className="text-right">
                {u.id !== me.id && (
                  <UserActiveToggle userId={u.id} banned={Boolean(u.banned)} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
