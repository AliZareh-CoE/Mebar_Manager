"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setDataAnalyst, setComputeCoordinator } from "@/actions/user-flags";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function AnalystToggle({
  userId,
  isAnalyst,
}: {
  userId: string;
  isAnalyst: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const result = await setDataAnalyst(userId, !isAnalyst);
        setPending(false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(isAnalyst ? "Analyst role removed." : "Analyst role granted.");
        router.refresh();
      }}
    >
      {isAnalyst ? "Remove analyst" : "Make analyst"}
    </Button>
  );
}

export function MakeCoordinatorButton({
  userId,
  name,
  currentCoordinatorName,
}: {
  userId: string;
  name: string;
  currentCoordinatorName: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={pending}>
            Make compute coordinator
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Make {name} the compute coordinator?</AlertDialogTitle>
          <AlertDialogDescription>
            There is exactly one compute coordinator — the person who approves
            or denies every compute request.
            {currentCoordinatorName
              ? ` This replaces ${currentCoordinatorName}.`
              : " Nobody currently holds the role."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              setPending(true);
              const result = await setComputeCoordinator(userId);
              setPending(false);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success(`${name} is now the compute coordinator.`);
              router.refresh();
            }}
          >
            Make coordinator
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
