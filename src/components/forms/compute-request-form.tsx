"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitComputeRequest, updateComputeRequest } from "@/actions/compute-requests";
import { OPTIMIZATION_PRACTICES, SERVER_TYPE_LABELS } from "@/lib/labels";
import { SERVER_TYPES, type ServerType, type OptimizationKey } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ComputeRequestForm({
  projectId,
  requestId,
  defaults,
}: {
  projectId: string;
  /** Set when editing an existing pending request. */
  requestId?: string;
  defaults?: {
    serverType: string;
    hoursNeeded: number;
    justification: string;
    datasetSize: string;
    preprocessingNote: string;
    dryRunEvidence: string;
    expectedResults: string;
    optimizations: string[];
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverType, setServerType] = useState<ServerType>(
    (defaults?.serverType as ServerType) ?? "SINGLE_GPU"
  );
  const multiGpu = serverType === "MULTI_GPU";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);
    formData.set("serverType", serverType);
    const result = requestId
      ? await updateComputeRequest(requestId, formData)
      : await submitComputeRequest(projectId, formData);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      requestId
        ? "Request updated."
        : "Compute request submitted. The coordinator owes you a decision."
    );
    router.push(`/projects/${projectId}`);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-0">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Server type</Label>
              <Select
                value={serverType}
                onValueChange={(v) => v && setServerType(v as ServerType)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v: string | null) =>
                      v ? SERVER_TYPE_LABELS[v as ServerType] : "Server type"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SERVER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SERVER_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cr-hours">Hours needed</Label>
              <Input id="cr-hours" name="hoursNeeded" type="number" min={1} step={1} defaultValue={defaults?.hoursNeeded} required />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-justification">Justification &amp; utilization plan</Label>
            <Textarea
              id="cr-justification"
              name="justification"
              defaultValue={defaults?.justification}
              rows={5}
              placeholder="Why these hours, and exactly how you'll use them: hyperparameter sweeps and ablation studies, training strategy and experiment schedule, evaluation metrics and success criteria."
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cr-dataset">Exact dataset size</Label>
              <Input id="cr-dataset" name="datasetSize" placeholder="e.g. 40k images, 18 GB" defaultValue={defaults?.datasetSize} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cr-preprocessing">Preprocessing proof</Label>
              <Input
                id="cr-preprocessing"
                name="preprocessingNote"
                defaultValue={defaults?.preprocessingNote}
                placeholder="How you know it's fully preprocessed"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-dryrun">Dry-run evidence</Label>
            <Textarea
              id="cr-dryrun"
              name="dryRunEvidence"
              defaultValue={defaults?.dryRunEvidence}
              rows={2}
              placeholder="What you ran on a small subset, and how you know the pipeline works end-to-end."
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-expected">Expected results &amp; anticipated outcomes</Label>
            <Textarea
              id="cr-expected"
              name="expectedResults"
              defaultValue={defaults?.expectedResults}
              rows={2}
              placeholder="You'll submit a summary comparing final outcomes against this."
              required
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <Label>Optimization practices you commit to</Label>
            <p className="text-xs text-muted-foreground">
              Full-system utilization is expected. Check what applies
              {multiGpu && (
                <span className="text-amber-600 dark:text-amber-400">
                  {" "}
                  — DDP/FSDP is mandatory on multi-GPU servers.
                </span>
              )}
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {(Object.entries(OPTIMIZATION_PRACTICES) as [OptimizationKey, string][]).map(
                ([key, label]) => {
                  const forced = multiGpu && key === "DDP_FSDP";
                  return (
                    <label
                      key={key}
                      className="flex items-start gap-2 text-sm text-foreground/90"
                    >
                      <input
                        type="checkbox"
                        name="optimizations"
                        value={key}
                        checked={forced ? true : undefined}
                        disabled={forced}
                        defaultChecked={
                          defaults ? defaults.optimizations.includes(key) : key === "CHECKPOINTING"
                        }
                        className="mt-0.5 accent-red-500"
                      />
                      {/* Disabled checkboxes don't submit — twin carries the value. */}
                      {forced && <input type="hidden" name="optimizations" value={key} />}
                      <span>{label}</span>
                    </label>
                  );
                }
              )}
            </div>
          </fieldset>

          <Button type="submit" disabled={pending}>
            {pending ? "Working…" : requestId ? "Save changes" : "Submit request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
