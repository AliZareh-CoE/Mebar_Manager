"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  assignInitiative,
  cancelInitiative,
  closeInitiative,
  editInitiative,
} from "@/actions/initiatives";
import { FormDialog } from "@/components/form-dialog";
import { PersonSelect } from "@/components/forms/labeled-selects";
import { Button } from "@/components/ui/button";
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

export function InitiativeRowActions({
  initiativeId,
  status,
  assigneeId,
  leadership,
  meId,
  edit,
}: {
  initiativeId: string;
  status: string;
  assigneeId: string | null;
  /** Managers + the compute coordinator — the assignable set. */
  leadership: { id: string; name: string }[];
  meId: string;
  /** Current values — enables the Edit/Cancel dialogs where provided. */
  edit?: { title: string; description: string; deadlineISO: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (status !== "OPEN") return null;

  async function run(fn: () => Promise<{ error?: string }>, success: string) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(success);
    router.refresh();
  }

  const closeFields = (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`ic-${initiativeId}`}>What happened?</Label>
      <Textarea id={`ic-${initiativeId}`} name="closureNote" required />
    </div>
  );

  return (
    <div className="flex items-center justify-end gap-2">
      {!assigneeId && leadership.some((l) => l.id === meId) && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() => assignInitiative(initiativeId, meId), "Claimed. Go fight.")
          }
        >
          Claim
        </Button>
      )}

      <Select
        value={assigneeId ?? ""}
        onValueChange={(v) =>
          v && run(() => assignInitiative(initiativeId, String(v)), "Fighter assigned.")
        }
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue>
            {assigneeId
              ? (leadership.find((l) => l.id === assigneeId)?.name ?? "Assign…")
              : "Assign fighter…"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {leadership.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FormDialog
        trigger={<Button size="sm" disabled={pending}>Won…</Button>}
        title="We won this fight"
        description="How did it land? On the record — wins are how the lab learns to fight."
        submitLabel="Mark won"
        successMessage="Won. That's how it's done."
        action={(fd) => closeInitiative(initiativeId, fd)}
      >
        <input type="hidden" name="outcome" value="WON" />
        {closeFields}
      </FormDialog>

      <FormDialog
        trigger={<Button variant="outline" size="sm" disabled={pending}>Lost…</Button>}
        title="We lost this fight"
        description="What happened, and what would we do differently? Losses on the record beat losses forgotten."
        submitLabel="Mark lost"
        successMessage="Logged. Next fight."
        action={(fd) => closeInitiative(initiativeId, fd)}
      >
        <input type="hidden" name="outcome" value="LOST" />
        {closeFields}
      </FormDialog>

      {edit && (
        <>
          <FormDialog
            trigger={<Button variant="ghost" size="sm">Edit</Button>}
            title="Edit initiative"
          size="lg"
            submitLabel="Save"
            action={(fd) => editInitiative(initiativeId, fd)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`ie-title-${initiativeId}`}>The fight</Label>
              <Input
                id={`ie-title-${initiativeId}`}
                name="title"
                defaultValue={edit.title}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`ie-desc-${initiativeId}`}>Details</Label>
              <Textarea
                id={`ie-desc-${initiativeId}`}
                name="description"
                defaultValue={edit.description}
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Fighter</Label>
              <PersonSelect
                name="assigneeId"
                people={leadership}
                placeholder="Unassigned"
                defaultValue={assigneeId ?? undefined}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`ie-deadline-${initiativeId}`}>Deadline</Label>
              <Input
                id={`ie-deadline-${initiativeId}`}
                name="deadline"
                type="date"
                defaultValue={edit.deadlineISO}
                required
              />
            </div>
          </FormDialog>
          <FormDialog
            trigger={<Button variant="ghost" size="sm">Cancel…</Button>}
            title="Cancel initiative"
            description="No longer worth fighting? Say why — it stays on the record."
            submitLabel="Cancel initiative"
            successMessage="Initiative cancelled."
            action={(fd) => cancelInitiative(initiativeId, fd)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`ix-${initiativeId}`}>Why?</Label>
              <Textarea id={`ix-${initiativeId}`} name="reason" required />
            </div>
          </FormDialog>
        </>
      )}
    </div>
  );
}
