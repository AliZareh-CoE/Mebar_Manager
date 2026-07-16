"use client";

import { InfoHint, type HelpCopy } from "@/components/info-hint";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fireProjectEvent } from "@/actions/projects";
import type { TransitionDescriptor } from "@/lib/workflow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function TransitionButtons({
  projectId,
  transitions,
  help,
}: {
  projectId: string;
  /** Computed server-side from the workflow + policy gates. */
  transitions: TransitionDescriptor[];
  /** How moving a project works, from the help-copy catalog. */
  help?: HelpCopy;
}) {
  const router = useRouter();
  const [dialogFor, setDialogFor] = useState<TransitionDescriptor | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  if (transitions.length === 0) return null;

  async function fire(
    t: TransitionDescriptor,
    extra?: { pauseReason?: string; reviveDate?: string; reason?: string }
  ) {
    setPending(t.key);
    const result = await fireProjectEvent(projectId, { type: t.key, ...extra });
    setPending(null);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    toast.success(`${t.label} — done.`);
    setDialogFor(null);
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {transitions.map((t) => (
        <Button
          key={t.key}
          size="sm"
          variant={t.destructive ? "destructive" : "outline"}
          disabled={pending !== null}
          onClick={() =>
            t.needsPauseFields || t.requiresReason ? setDialogFor(t) : fire(t)
          }
        >
          {pending === t.key ? "Working…" : t.label}
        </Button>
      ))}
      {help && <InfoHint {...help} />}

      <Dialog
        open={dialogFor !== null}
        onOpenChange={(o) => !o && setDialogFor(null)}
        disablePointerDismissal
      >
        <DialogContent>
          {dialogFor?.needsPauseFields ? (
            <>
              <DialogHeader>
                <DialogTitle>{dialogFor.label}</DialogTitle>
                <DialogDescription>
                  Pausing is a deliberate decision, not a drift. It needs a
                  reason and a revive date — the project comes back on the
                  Fight List when that date passes.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  fire(dialogFor, {
                    pauseReason: String(fd.get("pauseReason") ?? ""),
                    reviveDate: String(fd.get("reviveDate") ?? ""),
                  });
                }}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pauseReason">Why is it pausing?</Label>
                  <Textarea id="pauseReason" name="pauseReason" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="reviveDate">Revive date</Label>
                  <Input id="reviveDate" name="reviveDate" type="date" required />
                </div>
                <Button type="submit" disabled={pending !== null}>
                  {pending ? "Working…" : dialogFor.label}
                </Button>
              </form>
            </>
          ) : dialogFor ? (
            <>
              <DialogHeader>
                <DialogTitle>{dialogFor.label}</DialogTitle>
                <DialogDescription>
                  {dialogFor.destructive
                    ? "Killing a project is a respectable outcome — it frees a person. Say why, for the record."
                    : "Say why, for the record — it goes in the project history."}
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  fire(dialogFor, { reason: String(fd.get("reason") ?? "") });
                }}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="transitionReason">Why?</Label>
                  <Textarea id="transitionReason" name="reason" required />
                </div>
                <Button
                  type="submit"
                  variant={dialogFor.destructive ? "destructive" : "default"}
                  disabled={pending !== null}
                >
                  {pending ? "Working…" : dialogFor.label}
                </Button>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
