import { cn } from "@/lib/utils";
import { AGE_FRESH_DAYS, AGE_AGING_DAYS } from "@/lib/thresholds";

/** Days since last progress, colored by how worried we should be. */
export function AgePill({
  ageDays,
  freshDays = AGE_FRESH_DAYS,
  agingDays = AGE_AGING_DAYS,
  className,
}: {
  ageDays: number;
  freshDays?: number;
  agingDays?: number;
  className?: string;
}) {
  const tone =
    ageDays <= freshDays
      ? "bg-green-500/15 text-green-600 dark:text-green-400"
      : ageDays <= agingDays
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-red-500/15 text-red-600 dark:text-red-400";

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
