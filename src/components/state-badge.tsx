import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProjectState } from "@/lib/db/schema";

const STATE_STYLES: Record<ProjectState, string> = {
  PROPOSAL: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  SCOPING: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  ACTIVE: "bg-green-500/15 text-green-400 border-green-500/30",
  BLOCKED: "bg-red-500/15 text-red-400 border-red-500/30",
  PAUSED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DONE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  KILLED: "bg-muted text-muted-foreground line-through border-transparent",
};

const STATE_LABELS: Record<ProjectState, string> = {
  PROPOSAL: "Proposal",
  SCOPING: "Scoping",
  ACTIVE: "Active",
  BLOCKED: "Blocked",
  PAUSED: "Paused",
  DONE: "Done",
  KILLED: "Killed",
};

export function StateBadge({ state, className }: { state: ProjectState; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STATE_STYLES[state], className)}>
      {STATE_LABELS[state]}
    </Badge>
  );
}
