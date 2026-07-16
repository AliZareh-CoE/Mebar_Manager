"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addPersonMilestone,
  completePersonMilestone,
  cancelPersonMilestone,
  editPersonMilestone,
} from "@/actions/person-milestones";
import { FormDialog } from "@/components/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const TEMPLATES = ["Qualifier exam", "Proposal defense", "Thesis submission"] as const;

type Milestone = {
  id: string;
  title: string;
  dueISO: string;
  dueInput: string;
  status: "PLANNED" | "DONE" | "CANCELLED";
  overdue: boolean;
};

export function PersonMilestonesDialog({
  userId,
  personName,
  milestones,
}: {
  userId: string;
  personName: string;
  milestones: Milestone[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

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

  const planned = milestones.filter((m) => m.status === "PLANNED");

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={`Milestones for ${personName}`}>
            Milestones{milestones.length > 0 ? ` (${milestones.length})` : ""}
          </Button>
        }
      />
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{`Thesis milestones — ${personName}`}</DialogTitle>
          <DialogDescription>
            The degree arc as dated commitments: qualifier, proposal defense,
            submission. Past-due ones join the Fight List.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {milestones.length === 0 && (
            <p className="text-sm text-muted-foreground">No milestones yet.</p>
          )}
          {milestones.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className={m.status === "CANCELLED" ? "line-through opacity-60" : "font-medium"}>
                  {m.title}
                </p>
                <p
                  className={
                    m.overdue
                      ? "text-xs font-medium text-red-600 dark:text-red-400"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {`Due ${m.dueISO}`}
                  {m.overdue ? " — past due" : ""}
                </p>
              </div>
              {m.status === "PLANNED" ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => completePersonMilestone(m.id), "Milestone done. On the record.")
                    }
                  >
                    Done
                  </Button>
                  <FormDialog
                    trigger={
                      <Button size="sm" variant="ghost">
                        Edit
                      </Button>
                    }
                    title="Edit milestone"
                    submitLabel="Save"
                    successMessage="Milestone updated."
                    action={(fd) => editPersonMilestone(m.id, fd)}
                  >
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`pmt-${m.id}`}>Title</Label>
                      <Input id={`pmt-${m.id}`} name="title" defaultValue={m.title} required />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`pmd-${m.id}`}>Due date</Label>
                      <Input
                        id={`pmd-${m.id}`}
                        name="dueDate"
                        type="date"
                        defaultValue={m.dueInput}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`pmn-${m.id}`}>Note (optional)</Label>
                      <Textarea id={`pmn-${m.id}`} name="note" rows={2} />
                    </div>
                  </FormDialog>
                  <FormDialog
                    trigger={
                      <Button size="sm" variant="ghost" className="text-muted-foreground">
                        Cancel…
                      </Button>
                    }
                    title="Cancel milestone"
                    description="The reason goes on the record."
                    submitLabel="Cancel it"
                    successMessage="Milestone cancelled."
                    action={(fd) => cancelPersonMilestone(m.id, fd)}
                  >
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`pmc-${m.id}`}>Why?</Label>
                      <Textarea id={`pmc-${m.id}`} name="note" rows={2} required />
                    </div>
                  </FormDialog>
                </div>
              ) : (
                <Badge
                  variant="outline"
                  className={
                    m.status === "DONE" ? "text-emerald-500" : "text-muted-foreground"
                  }
                >
                  {m.status === "DONE" ? "Done" : "Cancelled"}
                </Badge>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {TEMPLATES.filter((t) => !planned.some((m) => m.title === t)).map((template) => (
            <FormDialog
              key={template}
              trigger={
                <Button size="sm" variant="outline">
                  {template}
                </Button>
              }
              title={`Add: ${template}`}
              submitLabel="Add milestone"
              successMessage="Milestone added."
              action={addPersonMilestone}
            >
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="title" value={template} />
              <div className="flex flex-col gap-2">
                <Label htmlFor={`pma-${userId}-${template}`}>Due date</Label>
                <Input
                  id={`pma-${userId}-${template}`}
                  name="dueDate"
                  type="date"
                  required
                />
              </div>
            </FormDialog>
          ))}
          <FormDialog
            trigger={
              <Button size="sm" variant="outline">
                Custom…
              </Button>
            }
            title="Add milestone"
            submitLabel="Add milestone"
            successMessage="Milestone added."
            action={addPersonMilestone}
          >
            <input type="hidden" name="userId" value={userId} />
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pmft-${userId}`}>Title</Label>
              <Input id={`pmft-${userId}`} name="title" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pmfd-${userId}`}>Due date</Label>
              <Input id={`pmfd-${userId}`} name="dueDate" type="date" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pmfn-${userId}`}>Note (optional)</Label>
              <Textarea id={`pmfn-${userId}`} name="note" rows={2} />
            </div>
          </FormDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}
