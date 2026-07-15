"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignBlocker, cancelBlocker, editBlocker, escalateBlocker, resolveBlocker } from "@/actions/blockers";
import { FormDialog } from "@/components/form-dialog";
import { CauseSelect } from "@/components/forms/labeled-selects";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BlockerStatus } from "@/lib/db/schema";

export function BlockerRowActions({
  blockerId,
  status,
  ownerId,
  people,
  edit,
}: {
  blockerId: string;
  status: BlockerStatus;
  ownerId: string | null;
  people: { id: string; name: string }[];
  /** Current values — enables the Edit/Cancel dialogs where provided. */
  edit?: {
    description: string;
    causeTag: string;
    deadlineISO: string;
    /** Admin-defined tags (non-archived ∪ this row's tag). */
    causeOptions: { value: string; label: string }[];
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);

  if (status === "RESOLVED" || status === "CANCELLED") return null;

  async function run(fn: () => Promise<{ error?: string }>, success: string) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(success);
    setResolveOpen(false);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Select
        value={ownerId ?? ""}
        onValueChange={(v) =>
          v && run(() => assignBlocker(blockerId, String(v)), "Owner assigned.")
        }
      >
        <SelectTrigger size="sm" className="w-36">
          <SelectValue>
            {ownerId
              ? (people.find((p) => p.id === ownerId)?.name ?? "Assign owner…")
              : "Assign owner…"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {status === "OPEN" && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => escalateBlocker(blockerId), "Escalated.")}
        >
          Escalate
        </Button>
      )}

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen} disablePointerDismissal>
        <DialogTrigger
          render={
            <Button size="sm" disabled={pending}>
              Resolve
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve blocker</DialogTitle>
            <DialogDescription>
              How was it solved? This goes into the lab&apos;s memory — the next
              person who hits this saves two days.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => resolveBlocker(blockerId, fd), "Blocker resolved. One less fight.");
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`note-${blockerId}`}>Resolution</Label>
              <Textarea id={`note-${blockerId}`} name="resolutionNote" required />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Working…" : "Resolve"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {edit && (
        <>
          <FormDialog
            trigger={<Button variant="ghost" size="sm">Edit</Button>}
            title="Edit blocker"
            submitLabel="Save"
            action={(fd) => editBlocker(blockerId, fd)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`eb-desc-${blockerId}`}>What&apos;s stuck?</Label>
              <Textarea
                id={`eb-desc-${blockerId}`}
                name="description"
                defaultValue={edit.description}
                rows={3}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Cause</Label>
              <CauseSelect options={edit.causeOptions} defaultValue={edit.causeTag} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`eb-deadline-${blockerId}`}>Deadline</Label>
              <Input
                id={`eb-deadline-${blockerId}`}
                name="deadline"
                type="date"
                defaultValue={edit.deadlineISO}
                required
              />
            </div>
          </FormDialog>
          <FormDialog
            trigger={<Button variant="ghost" size="sm">Cancel…</Button>}
            title="Cancel blocker"
            description="No longer a blocker? Say why — it stays on the record."
            submitLabel="Cancel blocker"
            successMessage="Blocker cancelled."
            action={(fd) => cancelBlocker(blockerId, fd)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`cb-${blockerId}`}>Why?</Label>
              <Textarea id={`cb-${blockerId}`} name="reason" required />
            </div>
          </FormDialog>
        </>
      )}
    </div>
  );
}
