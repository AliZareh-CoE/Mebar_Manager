import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { updateHandbook } from "@/actions/settings";
import { HandbookEditor } from "@/components/admin/handbook-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminSettingsHandbookPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Lab handbook</CardTitle>
          <CardDescription>
            The onboarding read for the whole lab — meeting rhythm, where data
            lives, how to ask for help. Everyone can read it at /handbook,
            secretaries included. Sections render in order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HandbookEditor
            sections={settings.handbook}
            action={updateHandbook}
            successMessage="Handbook saved. Everyone sees the update immediately."
          />
        </CardContent>
      </Card>
    </div>
  );
}
