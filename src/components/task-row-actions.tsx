"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignTask, cancelTask, completeTask, editTask } from "@/actions/tasks";
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

export function TaskRowActions({
  taskId,
  status,
  assigneeId,
  secretaries,
  meId,
  meIsSecretary,
  edit,
}: {
  taskId: string;
  status: string;
  assigneeId: string | null;
  secretaries: { id: string; name: string }[];
  meId: string;
  meIsSecretary: boolean;
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

  return (
    <div className="flex items-center justify-end gap-2">
      {!assigneeId && meIsSecretary && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => assignTask(taskId, meId), "Task claimed. It's yours.")}
        >
          Claim
        </Button>
      )}

      <Select
        value={assigneeId ?? ""}
        onValueChange={(v) =>
          v && run(() => assignTask(taskId, String(v)), "Secretary assigned.")
        }
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue>
            {assigneeId
              ? (secretaries.find((s) => s.id === assigneeId)?.name ?? "Assign…")
              : "Assign secretary…"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {secretaries.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FormDialog
        trigger={<Button size="sm" disabled={pending}>Done…</Button>}
        title="Complete task"
        description="What was done? One line for the record."
        submitLabel="Mark done"
        successMessage="Task done. One less thing."
        action={(fd) => completeTask(taskId, fd)}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`tc-${taskId}`}>What was done</Label>
          <Textarea id={`tc-${taskId}`} name="completionNote" required />
        </div>
      </FormDialog>

      {edit && (
        <>
          <FormDialog
            trigger={<Button variant="ghost" size="sm">Edit</Button>}
            title="Edit task"
          size="lg"
            submitLabel="Save"
            action={(fd) => editTask(taskId, fd)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`te-title-${taskId}`}>Task</Label>
              <Input id={`te-title-${taskId}`} name="title" defaultValue={edit.title} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`te-desc-${taskId}`}>Details</Label>
              <Textarea
                id={`te-desc-${taskId}`}
                name="description"
                defaultValue={edit.description}
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Secretary</Label>
              <PersonSelect
                name="assigneeId"
                people={secretaries}
                placeholder="Unassigned"
                defaultValue={assigneeId ?? undefined}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`te-deadline-${taskId}`}>Deadline</Label>
              <Input
                id={`te-deadline-${taskId}`}
                name="deadline"
                type="date"
                defaultValue={edit.deadlineISO}
                required
              />
            </div>
          </FormDialog>
          <FormDialog
            trigger={<Button variant="ghost" size="sm">Cancel…</Button>}
            title="Cancel task"
            description="No longer needed? Say why — it stays on the record."
            submitLabel="Cancel task"
            successMessage="Task cancelled."
            action={(fd) => cancelTask(taskId, fd)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`tx-${taskId}`}>Why?</Label>
              <Textarea id={`tx-${taskId}`} name="reason" required />
            </div>
          </FormDialog>
        </>
      )}
    </div>
  );
}
