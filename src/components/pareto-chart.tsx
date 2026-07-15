"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CAUSE_TAG_LABELS } from "@/lib/labels";
import type { ParetoSlice } from "@/lib/fight-engine";

const chartConfig = {
  count: { label: "Blockers", color: "var(--destructive)" },
} satisfies ChartConfig;

export function ParetoChart({ data }: { data: ParetoSlice[] }) {
  const rows = data.map((d) => ({
    ...d,
    label: CAUSE_TAG_LABELS[d.causeTag],
  }));

  return (
    <ChartContainer config={chartConfig} className="h-[220px] w-full">
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 32 }}>
        <XAxis type="number" dataKey="count" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={170}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12 }}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4}>
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(v: unknown) => `${v}%`}
            className="fill-muted-foreground"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
