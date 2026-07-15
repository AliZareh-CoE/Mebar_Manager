import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { updateProposalQuestions } from "@/actions/settings";
import { TaxonomyEditor } from "@/components/admin/taxonomy-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminSettingsProposalPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Proposal questions</CardTitle>
          <CardDescription>
            What every new project must answer. The seven Heilmeier built-ins
            can be renamed or archived but never removed; add your own below.
            Archived questions disappear from the form — answered ones keep
            showing on project pages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyEditor
            items={settings.proposalQuestions.map(({ key, label, archived }) => ({
              key,
              label,
              archived,
            }))}
            action={updateProposalQuestions}
            addPlaceholder="e.g. What's the ethics/compliance story?"
            successMessage="Proposal questions saved."
          />
        </CardContent>
      </Card>
    </div>
  );
}
