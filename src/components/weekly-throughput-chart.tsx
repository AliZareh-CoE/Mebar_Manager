"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { WeekPoint } from "@/lib/stats";

const chartConfig = {
  updates: { label: "Updates", color: "var(--chart-2)" },
  milestonesDone: { label: "Milestones closed", color: "var(--chart-3)" },
  blockersResolved: { label: "Blockers resolved", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function WeeklyThroughputChart({ data }: { data: WeekPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[240px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          dataKey="updates"
          type="monotone"
          stroke="var(--color-updates)"
          fill="var(--color-updates)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
        <Area
          dataKey="milestonesDone"
          type="monotone"
          stroke="var(--color-milestonesDone)"
          fill="var(--color-milestonesDone)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
        <Area
          dataKey="blockersResolved"
          type="monotone"
          stroke="var(--color-blockersResolved)"
          fill="var(--color-blockersResolved)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
