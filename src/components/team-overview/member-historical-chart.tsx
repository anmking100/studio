
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
      date: format(parseISO(item.date), 'MMM d'), 
      score: item.score,
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); 
  }, [historicalData]);

  const yAxisDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 5]; // Default if no data
    const scores = chartData.map(d => d.score);
    let minScore = Math.min(...scores);
    let maxScore = Math.max(...scores);

    if (minScore === maxScore) { 
        minScore = Math.max(0, minScore - 0.5);
        maxScore = Math.min(5, maxScore + 0.5);
        if (minScore === maxScore) { // If score is 0 or 5 and still min=max
          minScore = Math.max(0, minScore - 0.5); // e.g. score is 0, domain [0, 0.5]
          maxScore = minScore + 1; // e.g. score is 0, domain [0,1]
        }
    } else {
        minScore = Math.max(0, minScore - 0.2); 
        maxScore = Math.min(5, maxScore + 0.2);
    }
    
    // Ensure a minimum visible range, e.g., at least 1 unit on Y-axis if possible
    if (maxScore - minScore < 1) {
        const mid = (maxScore + minScore) / 2;
        minScore = Math.max(0, mid - 0.5);
        maxScore = Math.min(5, mid + 0.5);
         if (maxScore - minScore < 0.1) { // if still too small (e.g. centered on 0 or 5)
            maxScore = minScore + 0.5; // ensure some visible range
        }
    }
     // Final check to ensure min isn't greater than max
    if (minScore > maxScore - 0.1) minScore = Math.max(0, maxScore - 0.5);


    return [Math.max(0,minScore), Math.min(5,maxScore)];
  }, [chartData]);


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
            left: -20, 
            bottom: 0,
          }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={5}
            tickFormatter={(value) => value} 
            interval={chartData.length <= 5 ? 0 : "auto"}
            style={{ fontSize: '10px' }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={5}
            domain={yAxisDomain}
            tickFormatter={(value) => typeof value === 'number' ? value.toFixed(1) : value}
            style={{ fontSize: '10px' }}
            allowDataOverflow={false}
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

