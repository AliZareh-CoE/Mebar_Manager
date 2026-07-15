import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { WorkflowEditor } from "@/components/admin/workflow-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminSettingsWorkflowPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "MANAGER") redirect("/");

  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Project workflow</CardTitle>
          <CardDescription>
            The states a project moves through and who may move it. Flags give
            states their meaning — the Fight List, board, and stall clock all
            read them. Archive a state to retire it without touching history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowEditor initial={settings.workflow} />
        </CardContent>
      </Card>
    </div>
  );
}
