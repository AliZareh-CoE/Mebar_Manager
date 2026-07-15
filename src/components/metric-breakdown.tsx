import {
  CATEGORY_LABELS,
  METRIC_CATEGORY,
  METRIC_LABELS,
  PERFORMANCE_CATEGORIES,
  PERFORMANCE_METRICS,
  type PerformanceMetric,
} from "@/lib/performance-metrics";

/**
 * Per-metric score detail: label × count = points, grouped by category.
 * Server component, shared by /performance and the account page.
 */
export function MetricBreakdown({
  perMetric,
  weights,
}: {
  perMetric: Record<PerformanceMetric, number>;
  weights: Record<PerformanceMetric, number>;
}) {
  const hasAnything = PERFORMANCE_METRICS.some((m) => perMetric[m] > 0);
  if (!hasAnything) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing on the record in this window yet.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {PERFORMANCE_CATEGORIES.map((category) => {
        const metrics = PERFORMANCE_METRICS.filter(
          (m) => METRIC_CATEGORY[m] === category && perMetric[m] > 0
        );
        return (
          <div key={category}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABELS[category]}
            </p>
            {metrics.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                {metrics.map((m) => {
                  const points = perMetric[m] * weights[m];
                  return (
                    <li key={m} className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground">
                        {METRIC_LABELS[m]} × {perMetric[m]}
                      </span>
                      <span
                        className={
                          points < 0
                            ? "font-medium tabular-nums text-red-600 dark:text-red-400"
                            : "font-medium tabular-nums"
                        }
                      >
                        {points > 0 ? `+${points}` : points}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
