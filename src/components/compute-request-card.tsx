import Link from "next/link";
import { format } from "date-fns";
import {
  approveComputeRequest,
  denyComputeRequest,
  submitComputeResults,
  withdrawComputeRequest,
} from "@/actions/compute-requests";
import { SERVER_TYPE_LABELS, COMPUTE_STATUS_LABELS, OPTIMIZATION_PRACTICES } from "@/lib/labels";
import type { ComputeRequest, ServerType, ComputeRequestStatus, OptimizationKey } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/session";
import { FormDialog } from "@/components/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_STYLES: Record<ComputeRequestStatus, string> = {
  PENDING: "text-amber-600 dark:text-amber-400",
  APPROVED: "text-blue-600 dark:text-blue-400",
  DENIED: "text-red-600 dark:text-red-400",
  COMPLETED: "text-emerald-500",
  WITHDRAWN: "text-muted-foreground",
};

/** One compute request, with role-appropriate actions. Server component. */
export function ComputeRequestCard({
  request,
  requesterName,
  me,
  projectTitle,
}: {
  request: ComputeRequest;
  requesterName: string;
  me: SessionUser;
  /** Set when rendering outside the project page — adds a project link. */
  projectTitle?: string;
}) {
  const status = request.status as ComputeRequestStatus;
  const canSeeAccess =
    me.id === request.requesterId || me.role === "MANAGER" || me.isComputeCoordinator;
  const canSubmitResults = me.id === request.requesterId || me.role === "MANAGER";
  const canEditRequest =
    status === "PENDING" && (me.id === request.requesterId || me.role === "MANAGER");

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            {SERVER_TYPE_LABELS[request.serverType as ServerType]} · {request.hoursNeeded}h
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              by {requesterName} · {format(request.createdAt, "MMM d")}
            </span>
          </p>
          <Badge variant="outline" className={STATUS_STYLES[status]}>
            {COMPUTE_STATUS_LABELS[status]}
          </Badge>
        </div>

        {projectTitle && (
          <Link
            href={`/projects/${request.projectId}`}
            className="text-sm font-medium text-foreground/80 underline-offset-4 hover:underline"
          >
            {projectTitle}
          </Link>
        )}

        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">Plan:</span> {request.justification}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">Dataset:</span> {request.datasetSize}
          {" · "}
          <span className="font-medium text-foreground/80">Dry run:</span> {request.dryRunEvidence}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">Expected:</span> {request.expectedResults}
        </p>
        {request.optimizations.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {request.optimizations.map((key) => (
              <Badge key={key} variant="secondary" className="text-xs font-normal">
                {OPTIMIZATION_PRACTICES[key as OptimizationKey]?.split(" — ")[0] ?? key}
              </Badge>
            ))}
          </div>
        )}

        {status === "APPROVED" && (
          <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
            {request.windowEnd && (
              <p>
                <span className="font-medium text-blue-600 dark:text-blue-400">Hours expire:</span>{" "}
                {format(request.windowEnd, "MMM d, yyyy")}
              </p>
            )}
            {canSeeAccess && request.accessInstructions && (
              <p className="mt-1">
                <span className="font-medium text-blue-600 dark:text-blue-400">Access:</span>{" "}
                {request.accessInstructions}
              </p>
            )}
            <p className="mt-1 text-muted-foreground">
              Retrieve all data, checkpoints, and outputs before the hours
              expire — anything left on the server is not guaranteed to be
              retained.
            </p>
          </div>
        )}
        {status === "DENIED" && request.denialReason && (
          <p className="text-sm">
            <span className="font-medium text-red-600 dark:text-red-400">Denied:</span> {request.denialReason}
          </p>
        )}
        {status === "COMPLETED" && request.resultsSummary && (
          <p className="text-sm">
            <span className="font-medium text-emerald-500">Results:</span>{" "}
            {request.resultsSummary}
          </p>
        )}

        <div className="flex items-center gap-2">
          {status === "PENDING" && me.isComputeCoordinator && (
            <ComputeDecisionDialogs requestId={request.id} />
          )}
          {status === "PENDING" && !me.isComputeCoordinator && (
            <p className="text-sm text-muted-foreground">
              Waiting on the compute coordinator.
            </p>
          )}
          {canEditRequest && (
            <>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={
                  <Link href={`/projects/${request.projectId}/compute/${request.id}/edit`}>
                    Edit
                  </Link>
                }
              />
              <FormDialog
                trigger={<Button variant="ghost" size="sm">Withdraw…</Button>}
                title="Withdraw compute request"
                description="Pulls the request out of the coordinator's queue. It stays in the history as withdrawn."
                submitLabel="Withdraw"
                successMessage="Request withdrawn."
                action={withdrawComputeRequest.bind(null, request.id)}
              >
                <p className="text-sm text-muted-foreground">
                  You can submit a new request later.
                </p>
              </FormDialog>
            </>
          )}
          {status === "APPROVED" && canSubmitResults && (
            <FormDialog
              trigger={<Button size="sm" className="self-start">Submit results summary</Button>}
              title="Results summary"
              description="Final outcomes vs. what you expected. Confirm you've retrieved all data and checkpoints from the server."
              submitLabel="Submit"
              successMessage="Results submitted. Request closed."
              action={submitComputeResults.bind(null, request.id)}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor={`rs-${request.id}`}>Summary</Label>
                <Textarea
                  id={`rs-${request.id}`}
                  name="resultsSummary"
                  rows={4}
                  placeholder="What came out, vs. what you predicted. What's retrieved, what's next."
                  required
                />
              </div>
            </FormDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Approve/deny dialogs — coordinator-only surfaces render this. */
export function ComputeDecisionDialogs({ requestId }: { requestId: string }) {
  return (
    <div className="flex items-center gap-2">
      <FormDialog
        trigger={<Button size="sm">Approve</Button>}
        title="Approve compute request"
        description="Grant access (e.g. an NVIDIA Brev link or credentials note) and set when the allocated hours expire."
        submitLabel="Approve"
        successMessage="Approved. Access granted."
        action={approveComputeRequest.bind(null, requestId)}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`ai-${requestId}`}>Access instructions</Label>
          <Textarea
            id={`ai-${requestId}`}
            name="accessInstructions"
            placeholder="NVIDIA Brev instance link, login notes…"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`we-${requestId}`}>Usage window ends</Label>
          <Input id={`we-${requestId}`} name="windowEnd" type="date" required />
        </div>
      </FormDialog>
      <FormDialog
        trigger={<Button variant="outline" size="sm">Deny</Button>}
        title="Deny compute request"
        description="Say why — a denial with a reason is how the next request gets better."
        submitLabel="Deny"
        successMessage="Denied with reason."
        action={denyComputeRequest.bind(null, requestId)}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`dr-${requestId}`}>Reason</Label>
          <Textarea id={`dr-${requestId}`} name="denialReason" required />
        </div>
      </FormDialog>
    </div>
  );
}
