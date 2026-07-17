import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { updateThresholds } from "@/actions/settings";
import { FightRulesEditor } from "@/components/admin/fight-rules-editor";
import { SettingsForm } from "@/components/forms/settings-form";
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
  ["stallDays", "Stall after (days)", "A stall-counted project with no update for this long = stalled."],
  ["unownedGraceDays", "Unowned grace (days)", "Blockers and data requests without an owner escalate after this."],
  ["decisionTimeoutHours", "Decision auto-proceed (hours)", "Pending decisions auto-proceed with the recommendation after this."],
  ["decisionUrgentHours", "Decision urgent (hours)", "Pending decisions turn red this many hours before auto-proceeding."],
  ["computePendingUrgentHours", "Compute request urgent (hours)", "Pending compute requests turn red after this long undecided."],
  ["computeResultsUrgentDays", "Compute results urgent (days)", "Overdue results summaries turn red after this many extra days."],
  ["ageFreshDays", "Age pill: fresh up to (days)", "Board age pill stays green up to here."],
  ["ageAgingDays", "Age pill: aging up to (days)", "…amber up to here, red beyond."],
  ["minActiveProjects", "Min running projects per researcher", "Every researcher runs at least this many healthy, moving projects (owner or advisor) — blocked, stalled, paused, or unstarted ones don't count, and data analysts, secretaries, and leadership are exempt. 0 disables the rule."],
  ["submissionLeadDays", "Submission lead (days)", "A draft with a target submission date this close (or past) becomes a Fight List item. 0 disables it."],
] as const;

export default async function AdminSettingsFightsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Fight thresholds</CardTitle>
          <CardDescription>
            When things turn amber and red. Tune to your lab&apos;s rhythm — the
            defaults assume weekly updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            action={updateThresholds}
            successMessage="Thresholds saved. The Fight List recalculates immediately."
          >
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
          <CardTitle>Fight rules</CardTitle>
          <CardDescription>
            Switch rules on or off, rename their Fight List sections, and drag
            the order (↑/↓). Disabled rules stop producing fights immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FightRulesEditor
            initial={settings.fightSectionOrder.map((type) => ({
              type,
              ...settings.fightRules[type],
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
