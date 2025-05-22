
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
    let dataMin = Math.min(...scores);
    let dataMax = Math.max(...scores);

    let yMin, yMax;

    if (dataMin === dataMax) {
        // Case: All scores are the same
        yMin = Math.max(0, dataMin - 0.5);
        yMax = Math.min(5, dataMax + 0.5);
        // Ensure there's always some range, especially if score is 0 or 5
        if (yMin === yMax) {
            if (dataMin === 0) { // All scores are 0
                yMin = 0;
                yMax = 1;
            } else if (dataMin === 5) { // All scores are 5
                yMin = 4;
                yMax = 5;
            } else { // Should not be reached if previous logic is sound, but as a fallback
                yMin = Math.max(0, dataMin - 0.5);
                yMax = Math.min(5, yMin + 1); // Ensure a range of 1 if somehow still equal
            }
        }
    } else {
        // Case: Scores vary
        const range = dataMax - dataMin;
        // Add padding: 10% of the range, but at least 0.1 on each side.
        const padding = Math.max(range * 0.1, 0.1);

        yMin = Math.max(0, dataMin - padding);
        yMax = Math.min(5, dataMax + padding);

        // Ensure a minimum visible span if padding wasn't enough or range is very small
        if (yMax - yMin < 0.5) { // If the current span is less than 0.5
            const mid = (dataMax + dataMin) / 2; // Use original data's midpoint
            yMin = Math.max(0, mid - 0.25); // Try to create a 0.5 span around mid
            yMax = Math.min(5, mid + 0.25);

            // If, after centering, the span is still too small (e.g., mid was near 0 or 5)
            // or if yMin and yMax became equal due to clamping.
            if (yMax - yMin < 0.2) { // Check for a very small span like <0.2
                 // Force a 0.5 span from the current yMin, respecting the 0-5 boundaries
                if (yMin <= 4.5) {
                    yMax = Math.min(5, yMin + 0.5);
                } else { // yMin is > 4.5, so yMax must be 5. Adjust yMin.
                    yMax = 5;
                    yMin = 4.5;
                }
                // Special case: if data was all 0s, yMin might be 0, yMax 0.
                // Ensure yMax = 0.5 if yMin is 0 and span became 0.
                if (yMin === 0 && yMax === 0) {
                    yMax = 0.5;
                }
            }
        }
    }

    // Final clamp to 0-5 range (mostly redundant if logic above is sound, but safe)
    yMin = Math.max(0, yMin);
    yMax = Math.min(5, yMax);

    // Final check: Ensure yMax is strictly greater than yMin, and enforce minimum span of 0.5.
    // This handles edge cases where clamping might have made them equal or too close.
    if (yMax - yMin < 0.1) { // If they are virtually the same
        if (yMin <= 4.5) {
            yMax = Math.min(5, yMin + 0.5);
        } else { // yMin is very close to 5 (e.g., 4.8, 4.9, 5.0)
            yMax = 5;
            yMin = Math.max(0, yMax - 0.5);
        }
         // If after all this, they are still equal (e.g. data was 0, yMin became 0, yMax tried to be 0.5 but was clamped)
        if (yMin === yMax && yMin === 0) yMax = 0.5;
        if (yMin === yMax && yMin === 5) yMin = 4.5;
    }


    return [yMin, yMax];
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
            left: -10,
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

