"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { PaperMonthPoint } from "@/lib/stats";

const chartConfig = {
  submitted: { label: "Submitted", color: "var(--chart-2)" },
  accepted: { label: "Accepted", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function PapersTimelineChart({ data }: { data: PaperMonthPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[220px] w-full">
      <BarChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="submitted" fill="var(--color-submitted)" radius={4} />
        <Bar dataKey="accepted" fill="var(--color-accepted)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
