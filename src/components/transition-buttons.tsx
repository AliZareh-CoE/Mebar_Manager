"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fireProjectEvent } from "@/actions/projects";
import {
  availableEvents,
  EVENT_LABELS,
  type ProjectEventType,
} from "@/lib/state-machine";
import type { ProjectState } from "@/lib/db/schema";
import type { Role } from "@/lib/auth";
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

const DESTRUCTIVE: ProjectEventType[] = ["KILL"];
const NEEDS_DIALOG: ProjectEventType[] = ["PAUSE", "KILL"];

export function TransitionButtons({
  projectId,
  state,
  role,
}: {
  projectId: string;
  state: ProjectState;
  role: Role;
}) {
  const router = useRouter();
  const [dialogEvent, setDialogEvent] = useState<"PAUSE" | "KILL" | null>(null);
  const [pending, setPending] = useState<ProjectEventType | null>(null);

  const events = availableEvents(state, role);
  if (events.length === 0) return null;

  async function fire(
    type: ProjectEventType,
    extra?: { pauseReason?: string; reviveDate?: string; reason?: string }
  ) {
    setPending(type);
    const result = await fireProjectEvent(projectId, { type, ...extra });
    setPending(null);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    toast.success(`${EVENT_LABELS[type]} — done.`);
    setDialogEvent(null);
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {events.map((type) => (
        <Button
          key={type}
          size="sm"
          variant={DESTRUCTIVE.includes(type) ? "destructive" : "outline"}
          disabled={pending !== null}
          onClick={() =>
            NEEDS_DIALOG.includes(type)
              ? setDialogEvent(type as "PAUSE" | "KILL")
              : fire(type)
          }
        >
          {pending === type ? "Working…" : EVENT_LABELS[type]}
        </Button>
      ))}

      <Dialog open={dialogEvent === "PAUSE"} onOpenChange={(o) => !o && setDialogEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause project</DialogTitle>
            <DialogDescription>
              Pausing is a deliberate decision, not a drift. It needs a reason
              and a revive date — the project comes back on the Fight List when
              that date passes.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fire("PAUSE", {
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
              {pending ? "Working…" : "Pause project"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogEvent === "KILL"} onOpenChange={(o) => !o && setDialogEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kill project</DialogTitle>
            <DialogDescription>
              Killing a project is a respectable outcome — it frees a person.
              Say why, for the record.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fire("KILL", { reason: String(fd.get("reason") ?? "") });
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="killReason">Why?</Label>
              <Textarea id="killReason" name="reason" required />
            </div>
            <Button type="submit" variant="destructive" disabled={pending !== null}>
              {pending ? "Working…" : "Kill it"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
