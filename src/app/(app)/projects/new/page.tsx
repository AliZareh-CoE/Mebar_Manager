import { ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { NewProjectForm } from "@/components/forms/new-project-form";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const people = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(ne(user.banned, true));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New proposal</h1>
        <p className="text-sm text-muted-foreground">
          The Heilmeier questions — DARPA&apos;s gauntlet. If a proposal can&apos;t
          answer them, it isn&apos;t ready to consume someone&apos;s months.
        </p>
      </div>
      <NewProjectForm people={people} />
    </div>
  );
}
