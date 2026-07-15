import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import {
  updateCauseTags,
  updatePractices,
  updateServerTypes,
} from "@/actions/settings";
import { TaxonomyEditor } from "@/components/admin/taxonomy-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminSettingsCategoriesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const settings = await getSettings();
  const activePractices = settings.practices
    .filter((p) => !p.archived)
    .map(({ key, label }) => ({ key, label }));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Blocker causes</CardTitle>
          <CardDescription>
            The categories behind the Pareto chart. Archive instead of
            deleting — history keeps its labels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyEditor
            items={settings.causeTags}
            action={updateCauseTags}
            addPlaceholder="e.g. Waiting on funding"
            successMessage="Blocker causes saved."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Optimization practices</CardTitle>
          <CardDescription>
            The checklist compute requesters commit to. Card badges show the
            part before a &quot; — &quot; in long labels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyEditor
            items={settings.practices}
            action={updatePractices}
            addPlaceholder="e.g. Profile before scaling"
            successMessage="Practices saved."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Server types</CardTitle>
          <CardDescription>
            What can be requested, and which practices each type makes
            mandatory (stock rule: Multi-GPU forces DDP/FSDP).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyEditor
            items={settings.serverTypes}
            action={updateServerTypes}
            addPlaceholder="e.g. TPU pod"
            successMessage="Server types saved."
            practiceOptions={activePractices}
          />
        </CardContent>
      </Card>
    </div>
  );
}
