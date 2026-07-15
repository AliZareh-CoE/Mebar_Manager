"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelMilestone, setMilestoneStatus } from "@/actions/milestones";
import { Button } from "@/components/ui/button";
import type { MilestoneStatus } from "@/lib/db/schema";

export function MilestoneStatusButtons({
  milestoneId,
  status,
}: {
  milestoneId: string;
  status: MilestoneStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (status === "DONE" || status === "CANCELLED") return null;

  async function set(next: MilestoneStatus, message: string) {
    setPending(true);
    const result = await setMilestoneStatus(milestoneId, next);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(message);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {status === "PLANNED" && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => set("IN_PROGRESS", "Milestone started.")}
        >
          Start
        </Button>
      )}
      <Button
        size="sm"
        disabled={pending}
        onClick={() => set("DONE", "Milestone done. That's progress.")}
      >
        Mark done
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await cancelMilestone(milestoneId);
          setPending(false);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Milestone cancelled.");
          router.refresh();
        }}
      >
        Cancel…
      </Button>
    </div>
  );
}
