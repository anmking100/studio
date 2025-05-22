
"use client";

import type { HistoricalScore } from "@/lib/types";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from "recharts";
import { useMemo } from "react";
import { format, parseISO } from 'date-fns';

interface MemberHistoricalChartProps {
  historicalData: HistoricalScore[];
}

const chartConfig = {
  score: {
    label: "Score",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

export function MemberHistoricalChart({ historicalData }: MemberHistoricalChartProps) {
  const chartData = useMemo(() => {
    if (!historicalData || historicalData.length === 0) return [];
    return historicalData.map(item => ({
      date: format(parseISO(item.date), 'MMM d'), // Format date for X-axis
      score: item.score,
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Ensure sorted by date
  }, [historicalData]);

  if (!chartData || chartData.length === 0) {
    return <div className="text-center text-xs text-muted-foreground py-4">No historical trend data to display.</div>;
  }

  return (
    <ChartContainer config={chartConfig} className="h-[100px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{
            top: 5,
            right: 10,
            left: -20, // Adjust to bring Y-axis labels closer
            bottom: 0,
          }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={5}
            tickFormatter={(value) => value} // Already formatted 'MMM d'
            interval={Math.max(0, Math.floor(chartData.length / 4) -1)} // Show fewer ticks if many data points
            style={{ fontSize: '10px' }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={5}
            domain={[0, 5]} // Scores are 0-5
            ticks={[0, 1, 2, 3, 4, 5]}
            tickFormatter={(value) => value.toFixed(0)}
            style={{ fontSize: '10px' }}
          />
          <ChartTooltip
            cursor={true}
            content={<ChartTooltipContent 
                        indicator="line" 
                        labelClassName="text-xs" 
                        className="p-1 text-xs"
                        formatter={(value, name, props) => {
                            if (name === "score" && typeof value === 'number') {
                                return [`${value.toFixed(1)}`, "Score"];
                            }
                            return [value, name];
                        }}
                    />}
          />
          <Line
            dataKey="score"
            type="monotone"
            stroke="var(--color-score)"
            strokeWidth={2}
            dot={{
              fill: "var(--color-score)",
              r: 2,
            }}
            activeDot={{
              r: 4,
              style: { stroke: "hsl(var(--background))", strokeWidth: 1 },
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
