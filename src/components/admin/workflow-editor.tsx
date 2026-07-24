"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateWorkflow } from "@/actions/settings";
import {
  STATE_COLORS,
  slugifyKey,
  workflowSchema,
  workflowWarnings,
  type StateColor,
  type StateFlags,
  type Workflow,
  type WorkflowState,
  type WorkflowTransition,
} from "@/lib/workflow";
import { DEFAULT_WORKFLOW } from "@/lib/settings-defaults";
import { StateBadge } from "@/components/state-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GATE_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "manager", label: "Managers only" },
  { value: "project.approve", label: "Whoever can approve proposals" },
  { value: "project.kill", label: "Whoever can kill projects" },
] as const;

const FLAG_FIELDS: Array<[keyof StateFlags, string, string]> = [
  ["countsForStall", "Counts for stall", "The stall rule and age pill watch projects in this state."],
  ["resetsStallClock", "Resets the stall clock", "Entering this state counts as fresh progress."],
  ["paused", "Paused-like", "Entering requires a reason + revive date; past-revive fights fire."],
  ["terminal", "Terminal", "A final state — no outgoing transitions allowed."],
  ["hideFromBoard", "Hidden from board", "The board's default view skips it (like Killed)."],
];

function ColorSelect({
  value,
  onChange,
}: {
  value: StateColor;
  onChange: (c: StateColor) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as StateColor)}>
      <SelectTrigger className="w-32">
        <SelectValue>{(v: string | null) => v ?? "Color"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATE_COLORS.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function WorkflowEditor({ initial }: { initial: Workflow }) {
  const router = useRouter();
  const [wf, setWf] = useState<Workflow>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [newStateLabel, setNewStateLabel] = useState("");

  const validation = useMemo(() => workflowSchema.safeParse(wf), [wf]);
  const errors = useMemo(
    () =>
      validation.success
        ? []
        : [...new Set(validation.error.issues.map((i) => i.message))],
    [validation]
  );
  const warnings = useMemo(() => workflowWarnings(wf), [wf]);

  function patchState(key: string, patch: Partial<WorkflowState>) {
    setWf((w) => ({
      ...w,
      states: w.states.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    }));
  }

  function patchFlags(key: string, patch: Partial<StateFlags>) {
    setWf((w) => ({
      ...w,
      states: w.states.map((s) =>
        s.key === key ? { ...s, flags: { ...s.flags, ...patch } } : s
      ),
    }));
  }

  function setInitial(key: string) {
    setWf((w) => ({
      ...w,
      states: w.states.map((s) => ({
        ...s,
        flags: { ...s.flags, initial: s.key === key },
      })),
    }));
  }

  function addState() {
    const label = newStateLabel.trim();
    if (!label) return;
    const key = slugifyKey(label, wf.states.map((s) => s.key));
    setWf((w) => ({
      ...w,
      states: [
        ...w.states,
        {
          key,
          label,
          color: "slate",
          description: "",
          archived: false,
          points: 0,
          flags: {
            initial: false,
            countsForStall: false,
            paused: false,
            terminal: false,
            resetsStallClock: false,
            hideFromBoard: false,
          },
        },
      ],
    }));
    setNewStateLabel("");
  }

  function patchTransition(index: number, patch: Partial<WorkflowTransition>) {
    setWf((w) => ({
      ...w,
      transitions: w.transitions.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }));
  }

  function removeTransition(index: number) {
    setWf((w) => ({ ...w, transitions: w.transitions.filter((_, i) => i !== index) }));
  }

  function addTransition(from: string) {
    const target = wf.states.find((s) => s.key !== from && !s.archived) ?? wf.states[0];
    const key = slugifyKey(
      `GO_${target.key}`,
      wf.transitions.filter((t) => t.from === from).map((t) => t.key)
    );
    setWf((w) => ({
      ...w,
      transitions: [
        ...w.transitions,
        {
          key,
          from,
          to: target.key,
          label: `Move to ${target.label}`,
          gate: "everyone",
          requiresReason: false,
          destructive: false,
        },
      ],
    }));
  }

  async function save() {
    setSaving(true);
    const fd = new FormData();
    fd.set("workflow", JSON.stringify(wf));
    const result = await updateWorkflow(fd);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Workflow saved. It applies everywhere immediately.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {wf.states.map((state) => {
        const outgoing = wf.transitions
          .map((t, index) => ({ t, index }))
          .filter(({ t }) => t.from === state.key);
        return (
          <Card key={state.key} className={state.archived ? "opacity-60" : undefined}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <StateBadge label={state.label || state.key} color={state.color} />
                <code className="text-xs text-muted-foreground">{state.key}</code>
                {state.archived && <Badge variant="outline">archived</Badge>}
                {state.flags.initial && <Badge variant="secondary">starting state</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {!state.flags.initial && !state.archived && (
                  <Button variant="ghost" size="sm" onClick={() => setInitial(state.key)}>
                    Make starting state
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={state.flags.initial && !state.archived}
                  onClick={() => patchState(state.key, { archived: !state.archived })}
                >
                  {state.archived ? "Restore" : "Archive"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`label-${state.key}`}>Label</Label>
                  <Input
                    id={`label-${state.key}`}
                    value={state.label}
                    onChange={(e) => patchState(state.key, { label: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Color</Label>
                  <ColorSelect
                    value={state.color}
                    onChange={(color) => patchState(state.key, { color })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`desc-${state.key}`}>Description</Label>
                  <Input
                    id={`desc-${state.key}`}
                    value={state.description}
                    onChange={(e) => patchState(state.key, { description: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 sm:w-56">
                <Label htmlFor={`points-${state.key}`}>Points on reaching (0 = none)</Label>
                <Input
                  id={`points-${state.key}`}
                  type="number"
                  min={0}
                  max={100}
                  value={state.points}
                  onChange={(e) =>
                    patchState(state.key, { points: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Awarded to every lab member on the project’s People tab the
                  first time a project enters this state — re-entries never
                  re-award.
                </p>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {FLAG_FIELDS.map(([flag, label, blurb]) => (
                  <label
                    key={flag}
                    className="flex items-center gap-2 text-sm"
                    title={blurb}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={state.flags[flag]}
                      onChange={(e) =>
                        patchFlags(state.key, { [flag]: e.target.checked })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>

              {!state.flags.terminal && (
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Transitions out
                  </p>
                  {outgoing.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      None — projects entering this state will be stuck.
                    </p>
                  )}
                  {outgoing.map(({ t, index }) => (
                    <div
                      key={`${t.from}-${t.key}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Input
                        className="w-44"
                        value={t.label}
                        onChange={(e) => patchTransition(index, { label: e.target.value })}
                      />
                      <span className="text-muted-foreground">→</span>
                      <Select
                        value={t.to}
                        onValueChange={(v) => v && patchTransition(index, { to: String(v) })}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue>
                            {(v: string | null) =>
                              wf.states.find((s) => s.key === v)?.label ?? v ?? "Target"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {wf.states
                            .filter((s) => !s.archived)
                            .map((s) => (
                              <SelectItem key={s.key} value={s.key}>
                                {s.label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={t.gate}
                        onValueChange={(v) =>
                          v && patchTransition(index, { gate: v as WorkflowTransition["gate"] })
                        }
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue>
                            {(v: string | null) =>
                              GATE_OPTIONS.find((g) => g.value === v)?.label ?? "Gate"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {GATE_OPTIONS.map((g) => (
                            <SelectItem key={g.value} value={g.value}>
                              {g.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs" title="Opens a 'say why' dialog; the reason is logged to history.">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-primary"
                          checked={t.requiresReason}
                          onChange={(e) =>
                            patchTransition(index, { requiresReason: e.target.checked })
                          }
                        />
                        asks why
                      </label>
                      <label className="flex items-center gap-1.5 text-xs" title="Red button styling.">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-primary"
                          checked={t.destructive}
                          onChange={(e) =>
                            patchTransition(index, { destructive: e.target.checked })
                          }
                        />
                        destructive
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTransition(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => addTransition(state.key)}
                  >
                    Add transition
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-state-label">New state</Label>
          <Input
            id="new-state-label"
            placeholder="e.g. Under review"
            value={newStateLabel}
            onChange={(e) => setNewStateLabel(e.target.value)}
            className="w-56"
          />
        </div>
        <Button variant="outline" onClick={addState} disabled={!newStateLabel.trim()}>
          Add state
        </Button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
          <p className="font-medium text-red-600 dark:text-red-400">Fix before saving:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {errors.length === 0 && warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-600 dark:text-amber-400">Heads up:</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving || errors.length > 0}>
          {saving ? "Saving…" : "Save workflow"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setWf(structuredClone(DEFAULT_WORKFLOW))}
        >
          Reset to stock workflow
        </Button>
        <p className="text-xs text-muted-foreground">
          Keys are permanent; renames only change the label. Removed states are
          archived — history keeps rendering them.
        </p>
      </div>
    </div>
  );
}
