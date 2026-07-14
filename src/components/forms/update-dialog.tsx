import { addUpdate } from "@/actions/updates";
import { FormDialog } from "@/components/form-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** The 3-bullet weekly update, bindable anywhere a project needs one. */
export function UpdateDialog({
  projectId,
  trigger,
}: {
  projectId: string;
  trigger: React.ReactElement;
}) {
  return (
    <FormDialog
      trigger={trigger}
      title="Weekly update"
      description="Three bullets. Five minutes. Keeps the project off the Fight List."
      submitLabel="Post update"
      successMessage="Update posted. The clock resets."
      action={addUpdate.bind(null, projectId)}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`wm-${projectId}`}>What moved</Label>
        <Textarea id={`wm-${projectId}`} name="whatMoved" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`wb-${projectId}`}>What&apos;s blocked</Label>
        <Textarea id={`wb-${projectId}`} name="whatsBlocked" placeholder="Nothing? Great." />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`wn-${projectId}`}>What&apos;s next</Label>
        <Textarea id={`wn-${projectId}`} name="whatsNext" required />
      </div>
    </FormDialog>
  );
}
