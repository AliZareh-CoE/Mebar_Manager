import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { updateLabIdentity, updateVisibility } from "@/actions/settings";
import { SettingsForm } from "@/components/forms/settings-form";
import { EnumSelect } from "@/components/forms/labeled-selects";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

const THEME_OPTIONS = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];
const VISIBILITY_OPTIONS = [
  { value: "RESTRICTED", label: "Restricted — researchers see only their projects" },
  { value: "OPEN", label: "Open — everyone sees everything" },
];

export default async function AdminSettingsGeneralPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Lab identity</CardTitle>
          <CardDescription>Name in the header, and the theme new visitors get.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm action={updateLabIdentity}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="labName">Lab name</Label>
                <Input id="labName" name="labName" defaultValue={settings.labName} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Default theme</Label>
                <EnumSelect
                  name="defaultTheme"
                  options={THEME_OPTIONS}
                  defaultValue={settings.defaultTheme}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tagline">Tagline (login page)</Label>
              <Input id="tagline" name="tagline" defaultValue={settings.tagline} />
            </div>
          </SettingsForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visibility</CardTitle>
          <CardDescription>
            Managers always see everything. This controls what researchers see.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm action={updateVisibility}>
            <div className="flex flex-col gap-2">
              <Label>Mode</Label>
              <EnumSelect
                name="visibilityMode"
                options={VISIBILITY_OPTIONS}
                defaultValue={settings.visibilityMode}
                className="w-full sm:w-96"
              />
            </div>
          </SettingsForm>
        </CardContent>
      </Card>
    </div>
  );
}
