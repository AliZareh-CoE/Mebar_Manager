import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { computeRequests, projects } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { visibleProjectIds, isVisible } from "@/lib/visibility";
import { ComputeRequestForm } from "@/components/forms/compute-request-form";

export const dynamic = "force-dynamic";

export default async function EditComputeRequestPage({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  const { id, requestId } = await params;
  const me = await getCurrentUser();
  if (!me) notFound();

  const [project, request] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, id)).get(),
    db.select().from(computeRequests).where(eq(computeRequests.id, requestId)).get(),
  ]);
  if (!project || !request || request.projectId !== project.id) notFound();

  const visibleIds = await visibleProjectIds(me, await getSettings());
  if (!isVisible(visibleIds, project.id)) notFound();

  if (request.status !== "PENDING") redirect(`/projects/${project.id}`);
  if (me.id !== request.requesterId && me.role !== "MANAGER") {
    redirect(`/projects/${project.id}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit compute request</h1>
        <p className="text-sm text-muted-foreground">
          For{" "}
          <Link
            href={`/projects/${project.id}`}
            className="font-medium text-foreground/80 underline-offset-4 hover:underline"
          >
            {project.title}
          </Link>
          . Editable while the request is pending.
        </p>
      </div>
      <ComputeRequestForm
        projectId={project.id}
        requestId={request.id}
        defaults={{
          serverType: request.serverType,
          hoursNeeded: request.hoursNeeded,
          justification: request.justification,
          datasetSize: request.datasetSize,
          preprocessingNote: request.preprocessingNote,
          dryRunEvidence: request.dryRunEvidence,
          expectedResults: request.expectedResults,
          optimizations: request.optimizations,
        }}
      />
    </div>
  );
}
