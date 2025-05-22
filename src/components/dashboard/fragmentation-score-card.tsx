"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Gauge, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface FragmentationScoreCardProps {
  currentScore: number;
  previousScore?: number; // Optional, to show trend
}

export function FragmentationScoreCard({ currentScore, previousScore }: FragmentationScoreCardProps) {
  const scorePercentage = (currentScore / 5) * 100; // Assuming max score is 5 for visualization
  
  let trendIcon = <Minus className="h-5 w-5 text-muted-foreground" />;
  let trendColor = "text-muted-foreground";
  let trendText = "No change";

  if (previousScore !== undefined) {
    if (currentScore > previousScore) {
      trendIcon = <TrendingUp className="h-5 w-5 text-destructive" />;
      trendColor = "text-destructive";
      trendText = `Increased by ${(currentScore - previousScore).toFixed(1)}`;
    } else if (currentScore < previousScore) {
      trendIcon = <TrendingDown className="h-5 w-5 text-green-600" />;
      trendColor = "text-green-600";
      trendText = `Decreased by ${(previousScore - currentScore).toFixed(1)}`;
    }
  }

  let scoreInterpretation = "Low Fragmentation";
  let progressIndicatorClassName = "bg-green-500"; // Custom class for progress bar color
  if (currentScore > 3.5) {
    scoreInterpretation = "High Fragmentation";
    progressIndicatorClassName = "bg-destructive";
  } else if (currentScore > 2.0) {
    scoreInterpretation = "Moderate Fragmentation";
    progressIndicatorClassName = "bg-yellow-500";
  }


  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">Cognitive Fragmentation</CardTitle>
          <Gauge className="h-6 w-6 text-primary" />
        </div>
        <CardDescription>Your current attention spread.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <p className="text-5xl font-bold text-primary">{currentScore.toFixed(1)}</p>
          {previousScore !== undefined && (
            <div className={`flex items-center ${trendColor}`}>
              {trendIcon}
              <span className="text-sm font-medium">{trendText}</span>
            </div>
          )}
        </div>
        <Progress value={scorePercentage} className="mt-4 h-3" indicatorClassName={progressIndicatorClassName} />
        <p className="mt-2 text-sm text-muted-foreground">{scoreInterpretation} (out of 5)</p>
      </CardContent>
    </Card>
  );
}
