"use client";

import { MessageSquarePlus } from "lucide-react";
import { submitFeedback } from "@/actions/feedback";
import { FormDialog } from "@/components/form-dialog";
import { EnumSelect } from "@/components/forms/labeled-selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const KIND_OPTIONS = [
  { value: "BUG", label: "Bug report" },
  { value: "IDEA", label: "Feature idea" },
];

/** Header button, visible to every role — feedback goes to the managers. */
export function FeedbackButton() {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label="Send feedback">
          <MessageSquarePlus className="size-4" />
          <span className="sr-only">Send feedback</span>
        </Button>
      }
      title="Send feedback"
      description="Found a bug or want a feature? It goes straight to the managers — with your name on it, so they can follow up."
      submitLabel="Send it"
      successMessage="Feedback sent. Thank you — this is how the tool gets better."
      action={submitFeedback}
    >
      <div className="flex flex-col gap-2">
        <Label>Type</Label>
        <EnumSelect name="kind" options={KIND_OPTIONS} defaultValue="BUG" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fb-title">One line</Label>
        <Input id="fb-title" name="title" maxLength={120} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fb-body">Details</Label>
        <Textarea
          id="fb-body"
          name="body"
          rows={4}
          placeholder="What happened (and what you expected), or what you wish existed and why."
          required
        />
      </div>
    </FormDialog>
  );
}
