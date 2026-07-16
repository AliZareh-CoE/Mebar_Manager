"use client";

import { Plus } from "lucide-react";
import { createExternalDataRequest } from "@/actions/data-requests";
import { FormDialog } from "@/components/form-dialog";
import { PersonSelect } from "@/components/forms/labeled-selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Coordinator-only: log a data request that came from outside Mebar and
 * (optionally) route it to a data analyst right away.
 */
export function ExternalDataRequestDialog({
  analysts,
}: {
  analysts: { id: string; name: string }[];
}) {
  return (
    <FormDialog
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> Log external request
        </Button>
      }
      title="External data request"
      description="A data ask from outside Mebar. You log it, an analyst delivers it."
      submitLabel="Log it"
      successMessage="Logged. Assign an analyst so it doesn't rot."
      action={createExternalDataRequest}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="externalRequester">Who asked (person / organization)</Label>
        <Input
          id="externalRequester"
          name="externalRequester"
          placeholder="Prof. Ada Byrne, Analog Devices"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="externalContact">Contact (optional)</Label>
        <Input
          id="externalContact"
          name="externalContact"
          placeholder="ada@example.com"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ext-title">What data do they need?</Label>
        <Input id="ext-title" name="title" placeholder="Calibration sweep, 2023–2025" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ext-desc">Details — format, source, granularity</Label>
        <Textarea
          id="ext-desc"
          name="description"
          placeholder="CSV per run, labeled by temperature setpoint…"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ext-needed">Needed by</Label>
        <Input id="ext-needed" name="neededBy" type="date" required />
      </div>
      {analysts.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Assign to analyst (optional)</Label>
          <PersonSelect name="assigneeId" people={analysts} placeholder="Assign later" />
        </div>
      )}
    </FormDialog>
  );
}
