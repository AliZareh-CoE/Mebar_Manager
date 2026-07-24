"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignDataRequest, cancelDataRequest, deliverDataRequest, editDataRequest } from "@/actions/data-requests";
import { FormDialog } from "@/components/form-dialog";
import { PersonSelect } from "@/components/forms/labeled-selects";
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

export function DataRequestRowActions({
  requestId,
  status,
  assigneeId,
  analysts,
  meId,
  meIsAnalyst,
  edit,
}: {
  requestId: string;
  status: string;
  assigneeId: string | null;
  analysts: { id: string; name: string }[];
  meId: string;
  meIsAnalyst: boolean;
  /** Current values — enables the Edit/Cancel dialogs where provided. */
  edit?: { title: string; description: string; neededByISO: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);

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
    setDeliverOpen(false);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Select
        value={assigneeId ?? ""}
        onValueChange={(v) =>
          v && run(() => assignDataRequest(requestId, String(v)), "Analyst assigned.")
        }
      >
        <SelectTrigger size="sm" className="w-36">
          <SelectValue>
            {assigneeId
              ? (analysts.find((a) => a.id === assigneeId)?.name ?? "Assign analyst…")
              : "Assign analyst…"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {analysts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {meIsAnalyst && !assigneeId && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => assignDataRequest(requestId, meId), "Claimed. It's yours.")}
        >
          Claim
        </Button>
      )}

      <Dialog open={deliverOpen} onOpenChange={setDeliverOpen} disablePointerDismissal>
        <DialogTrigger
          render={
            <Button size="sm" disabled={pending}>
              Deliver
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deliver data</DialogTitle>
            <DialogDescription>
              Where does the data live, and how was it collected? This note is
              the handoff — write it so the requester needs no follow-up.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => deliverDataRequest(requestId, fd), "Delivered. One less fight.");
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`dn-${requestId}`}>Delivery note</Label>
              <Textarea id={`dn-${requestId}`} name="deliveryNote" required />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Working…" : "Deliver"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {edit && (
        <>
          <FormDialog
            trigger={<Button variant="ghost" size="sm">Edit</Button>}
            title="Edit data request"
          size="lg"
            submitLabel="Save"
            action={(fd) => editDataRequest(requestId, fd)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edr-title-${requestId}`}>What data do you need?</Label>
              <Input id={`edr-title-${requestId}`} name="title" defaultValue={edit.title} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edr-desc-${requestId}`}>Details</Label>
              <Textarea
                id={`edr-desc-${requestId}`}
                name="description"
                defaultValue={edit.description}
                rows={3}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edr-needed-${requestId}`}>Needed by</Label>
              <Input
                id={`edr-needed-${requestId}`}
                name="neededBy"
                type="date"
                defaultValue={edit.neededByISO}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Analyst</Label>
              <PersonSelect
                name="assigneeId"
                people={analysts}
                placeholder="Unassigned"
                defaultValue={assigneeId ?? undefined}
              />
            </div>
          </FormDialog>
          <FormDialog
            trigger={<Button variant="ghost" size="sm">Cancel…</Button>}
            title="Cancel data request"
            description="No longer needed? Say why — it stays on the record."
            submitLabel="Cancel request"
            successMessage="Data request cancelled."
            action={(fd) => cancelDataRequest(requestId, fd)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`cdr-${requestId}`}>Why?</Label>
              <Textarea id={`cdr-${requestId}`} name="reason" required />
            </div>
          </FormDialog>
        </>
      )}
    </div>
  );
}
