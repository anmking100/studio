"use client";

import type { FragmentationDataPoint } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart as LucideLineChart } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from "recharts";
import { useMemo } from "react";

interface FocusTrendsChartProps {
  data: FragmentationDataPoint[];
}

const chartDisplayConfig = {
  score: {
    label: "Fragmentation Score",
    color: "hsl(var(--primary))",
  },
  average: {
    label: "7-day Avg.",
    color: "hsl(var(--accent))",
    strokeDasharray: "3 3",
  }
} satisfies ChartConfig;


export function FocusTrendsChart({ data }: FocusTrendsChartProps) {
  const chartData = useMemo(() => {
    return data.map((d, index) => {
      const date = new Date(d.date);
      // Calculate 7-day rolling average
      let sevenDayAvg = null;
      if (index >= 6) {
        const sumLast7 = data.slice(index - 6, index + 1).reduce((acc, curr) => acc + curr.score, 0);
        sevenDayAvg = sumLast7 / 7;
      }

      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        score: d.score,
        average: sevenDayAvg ? parseFloat(sevenDayAvg.toFixed(1)) : null,
      };
    });
  }, [data]);
  
  if (!data || data.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Focus Trends</CardTitle>
          <CardDescription>No data available to display trends.</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground">Awaiting focus data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">Focus Trends</CardTitle>
          <LucideLineChart className="h-6 w-6 text-primary" />
        </div>
        <CardDescription>Your fragmentation score over the last {data.length} days.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartDisplayConfig} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.5)" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => value.slice(0, 6)} 
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                domain={['dataMin - 0.5', 'dataMax + 0.5']} 
                tickFormatter={(value) => typeof value === 'number' ? value.toFixed(1) : value}
              />
              <ChartTooltip
                cursor={true}
                content={<ChartTooltipContent indicator="line" />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="score"
                type="monotone"
                stroke="var(--color-score)"
                strokeWidth={2}
                dot={{
                  fill: "var(--color-score)",
                  r: 4,
                }}
                activeDot={{
                  r: 6,
                  style: { stroke: "hsl(var(--background))", strokeWidth: 2 },
                }}
              />
              <Line
                dataKey="average"
                type="monotone"
                stroke="var(--color-average)"
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
