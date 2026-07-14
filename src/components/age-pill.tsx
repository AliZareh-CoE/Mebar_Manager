import { cn } from "@/lib/utils";
import { AGE_FRESH_DAYS, AGE_AGING_DAYS } from "@/lib/thresholds";

/** Days since last progress, colored by how worried we should be. */
export function AgePill({ ageDays, className }: { ageDays: number; className?: string }) {
  const tone =
    ageDays <= AGE_FRESH_DAYS
      ? "bg-green-500/15 text-green-400"
      : ageDays <= AGE_AGING_DAYS
        ? "bg-amber-500/15 text-amber-400"
        : "bg-red-500/15 text-red-400";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
        tone,
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {ageDays === 0 ? "today" : `${ageDays}d since progress`}
    </span>
  );
}
