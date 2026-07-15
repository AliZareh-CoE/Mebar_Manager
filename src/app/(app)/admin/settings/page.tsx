import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import {
  updateLabIdentity,
  updateThresholds,
  updateVisibility,
  updatePermissions,
} from "@/actions/settings";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

const THRESHOLD_FIELDS = [
  ["stallDays", "Stall after (days)", "ACTIVE/BLOCKED project with no update for this long = stalled."],
  ["unownedGraceDays", "Unowned grace (days)", "Blockers and data requests without an owner escalate after this."],
  ["decisionTimeoutHours", "Decision auto-proceed (hours)", "Pending decisions auto-proceed with the recommendation after this."],
  ["decisionUrgentHours", "Decision urgent (hours)", "Pending decisions turn red this many hours before auto-proceeding."],
  ["computePendingUrgentHours", "Compute request urgent (hours)", "Pending compute requests turn red after this long undecided."],
  ["computeResultsUrgentDays", "Compute results urgent (days)", "Overdue results summaries turn red after this many extra days."],
  ["ageFreshDays", "Age pill: fresh up to (days)", "Board age pill stays green up to here."],
  ["ageAgingDays", "Age pill: aging up to (days)", "…amber up to here, red beyond."],
] as const;

const THEME_OPTIONS = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];
const VISIBILITY_OPTIONS = [
  { value: "RESTRICTED", label: "Restricted — researchers see only their projects" },
  { value: "OPEN", label: "Open — everyone sees everything" },
];
const ROLE_OPTIONS = [
  { value: "ENGINEER", label: "Everyone" },
  { value: "MANAGER", label: "Managers only" },
];

export default async function AdminSettingsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "MANAGER") redirect("/");

  const settings = await getSettings();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          The numbers and rules the whole system argues from. Managers only.
        </p>
      </div>

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
          </SettingsForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fight thresholds</CardTitle>
          <CardDescription>
            When things turn amber and red. Tune to your lab&apos;s rhythm — the
            defaults assume weekly updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm action={updateThresholds} successMessage="Thresholds saved. The Fight List recalculates immediately.">
            <div className="grid gap-4 sm:grid-cols-2">
              {THRESHOLD_FIELDS.map(([field, label, blurb]) => (
                <div key={field} className="flex flex-col gap-1.5">
                  <Label htmlFor={field}>{label}</Label>
                  <Input
                    id={field}
                    name={field}
                    type="number"
                    min={0}
                    defaultValue={settings.thresholds[field]}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{blurb}</p>
                </div>
              ))}
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
