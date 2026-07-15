import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { updatePermissions } from "@/actions/settings";
import { CONFIGURABLE_CAPABILITIES, CAPABILITY_LABELS } from "@/lib/policy";
import { SettingsForm } from "@/components/forms/settings-form";
import { EnumSelect } from "@/components/forms/labeled-selects";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const ROLE_OPTIONS = [
  { value: "ENGINEER", label: "Everyone" },
  { value: "MANAGER", label: "Managers only" },
];

export default async function AdminSettingsPermissionsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>
            Minimum role per action. People can always act on their own things;
            user management, settings, deciding decisions, and compute approval
            (the coordinator) are fixed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm action={updatePermissions}>
            <div className="flex flex-col gap-3">
              {CONFIGURABLE_CAPABILITIES.map((cap) => (
                <div
                  key={cap}
                  className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm">{CAPABILITY_LABELS[cap]}</span>
                  <EnumSelect
                    name={cap}
                    options={ROLE_OPTIONS}
                    defaultValue={settings.permissions[cap]}
                    className="w-44"
                  />
                </div>
              ))}
            </div>
          </SettingsForm>
        </CardContent>
      </Card>
    </div>
  );
}
