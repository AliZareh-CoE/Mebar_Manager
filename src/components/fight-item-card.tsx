import Link from "next/link";
import { DetailDialog } from "@/components/detail-dialog";
import { Initials } from "@/components/initials";
import { InfoHint, type HelpCopy } from "@/components/info-hint";
import { RemindButton } from "@/components/remind-button";
import { cn } from "@/lib/utils";
import type { FightItem } from "@/lib/fight-engine";

export function FightItemCard({
  item,
  help,
  remind = false,
  children,
}: {
  item: FightItem;
  /** Rule explanation + how to win, from the help-copy catalog. */
  help?: HelpCopy;
  /** Leadership viewers get a one-click reminder email to the responsible. */
  remind?: boolean;
  children?: React.ReactNode;
}) {
  const showRemind = remind && item.responsible !== null;
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
          {help && <InfoHint {...help} />}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              item.severity === 3 ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            )}
          >
            {item.ageDays}d
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {item.projectId && item.projectTitle && (
            <Link href={`/projects/${item.projectId}`} className="font-medium text-foreground/80 underline-offset-4 hover:underline">
              {item.projectTitle}
            </Link>
          )}
          {item.responsible && (
            <span className="flex items-center gap-1.5">
              <Initials name={item.responsible.name} className="size-5" />
              {item.responsible.name}
            </span>
          )}
        </div>
        {item.detail && (
          <DetailDialog
            title={item.headline}
            fields={[
              { label: "Detail", value: item.detail },
              { label: "Project", value: item.projectTitle },
              { label: "Responsible", value: item.responsible?.name },
              { label: "Sitting still for", value: `${item.ageDays} day${item.ageDays === 1 ? "" : "s"}` },
            ]}
            trigger={
              <button
                type="button"
                className="mt-1 line-clamp-2 cursor-pointer text-left text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                {item.detail}
              </button>
            }
          />
        )}
      </div>
      {(showRemind || children) && (
        <div data-slot="fight-actions" className="flex shrink-0 items-center gap-1">
          {showRemind && item.responsible && (
            <RemindButton
              toUserId={item.responsible.id}
              recipientName={item.responsible.name}
              about={`${item.headline}${item.projectTitle ? ` — ${item.projectTitle}` : ""}`}
            />
          )}
          {children}
        </div>
      )}
    </div>
  );
}
