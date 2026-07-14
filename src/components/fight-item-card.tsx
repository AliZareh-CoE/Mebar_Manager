import Link from "next/link";
import { Initials } from "@/components/initials";
import { cn } from "@/lib/utils";
import type { FightItem } from "@/lib/fight-engine";

export function FightItemCard({
  item,
  children,
}: {
  item: FightItem;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 pl-5 shadow-sm sm:flex-row sm:items-center",
        "relative overflow-hidden"
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          item.severity === 3 ? "bg-red-500" : item.severity === 2 ? "bg-amber-500" : "bg-muted"
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{item.headline}</p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              item.severity === 3 ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
            )}
          >
            {item.ageDays}d
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <Link href={`/projects/${item.projectId}`} className="font-medium text-foreground/80 underline-offset-4 hover:underline">
            {item.projectTitle}
          </Link>
          {item.responsible && (
            <span className="flex items-center gap-1.5">
              <Initials name={item.responsible.name} className="size-5" />
              {item.responsible.name}
            </span>
          )}
        </div>
        {item.detail && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.detail}</p>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
