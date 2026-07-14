"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignBlocker, escalateBlocker, resolveBlocker } from "@/actions/blockers";
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
}: {
  blockerId: string;
  status: BlockerStatus;
  ownerId: string | null;
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);

  if (status === "RESOLVED") return null;

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
          <SelectValue placeholder="Assign owner…" />
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

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
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
    </div>
  );
}
