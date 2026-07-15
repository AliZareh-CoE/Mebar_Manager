import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, user } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { visibleProjectIds, isVisible } from "@/lib/visibility";
import { ComputeRequestForm } from "@/components/forms/compute-request-form";

export const dynamic = "force-dynamic";

export default async function NewComputeRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) notFound();

  const project = await db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) notFound();
  const visibleIds = await visibleProjectIds(me, await getSettings());
  if (!isVisible(visibleIds, project.id)) notFound();

  const coordinator = await db
    .select({ name: user.name })
    .from(user)
    .where(and(eq(user.isComputeCoordinator, true), ne(user.banned, true)))
    .get();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Request compute</h1>
        <p className="text-sm text-muted-foreground">
          For{" "}
          <Link
            href={`/projects/${project.id}`}
            className="font-medium text-foreground/80 underline-offset-4 hover:underline"
          >
            {project.title}
          </Link>
          {coordinator ? (
            <> — decided by {coordinator.name}, and only by them.</>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              {" "}
              — no compute coordinator is set yet; a manager must take the role
              on the People page before this can be approved.
            </span>
          )}
        </p>
      </div>

      <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">The bar for an approval:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Server type and the number of hours needed.</li>
          <li>
            A strong justification and use case, with a detailed plan to
            utilize the hours — sweeps, ablations, training strategy, schedule,
            metrics, success criteria.
          </li>
          <li>Proof all data is fully preprocessed, with the exact dataset size.</li>
          <li>Evidence of a dry run on a small subset — the pipeline works before it scales.</li>
          <li>Expected results and anticipated outcomes.</li>
        </ol>
        <p className="mt-3">
          After the window ends you owe a results summary (outcomes vs.
          expected), and everything left on the server is not guaranteed to be
          retained — retrieve data, checkpoints, and outputs before the hours
          expire.
        </p>
      </div>

      <ComputeRequestForm projectId={project.id} />
    </div>
  );
}
