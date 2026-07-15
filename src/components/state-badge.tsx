import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StateColor } from "@/lib/workflow";

/**
 * Precompiled palette — Tailwind can't build class strings at runtime, so
 * each workflow color name maps to a fixed set. `muted` doubles as the
 * retired/terminal look (the original KILLED style, strikethrough included).
 */
const STATE_COLOR_CLASSES: Record<StateColor, string> = {
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  green: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  red: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  pink: "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30",
  muted: "bg-muted text-muted-foreground line-through border-transparent",
};

export function StateBadge({
  label,
  color,
  className,
}: {
  label: string;
  color: StateColor;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(STATE_COLOR_CLASSES[color], className)}>
      {label}
    </Badge>
  );
}
