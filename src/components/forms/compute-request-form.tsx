"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitComputeRequest, updateComputeRequest } from "@/actions/compute-requests";
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
  serverTypes,
  practices,
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
  /** Admin-defined, non-archived (∪ the row's current values on edit). */
  serverTypes: { key: string; label: string; mandatoryPractices: string[] }[];
  practices: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverType, setServerType] = useState<string>(
    defaults?.serverType ??
      (serverTypes.find((s) => s.key === "SINGLE_GPU") ?? serverTypes[0])?.key ??
      ""
  );
  const practiceKeys = new Set(practices.map((p) => p.key));
  const selected = serverTypes.find((s) => s.key === serverType);
  // Forced = the selected type's mandatory practices (that still exist).
  const forcedKeys = new Set(
    (selected?.mandatoryPractices ?? []).filter((k) => practiceKeys.has(k))
  );
  const forcedLabels = [...forcedKeys].map(
    (k) => practices.find((p) => p.key === k)?.label.split(" — ")[0] ?? k
  );

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
                onValueChange={(v) => v && setServerType(String(v))}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v: string | null) =>
                      (v && (serverTypes.find((s) => s.key === v)?.label ?? v)) ||
                      "Server type"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {serverTypes.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
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
              {forcedLabels.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {" "}
                  — mandatory on {selected?.label ?? serverType}:{" "}
                  {forcedLabels.join(", ")}.
                </span>
              )}
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {practices.map(({ key, label }) => {
                const forced = forcedKeys.has(key);
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
              })}
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
