
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Gauge, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FragmentationScoreCardProps {
  currentScore: number;
  previousScore?: number; // Optional, to show trend
  riskLevel?: 'Low' | 'Moderate' | 'High';
  summary?: string;
}

export function FragmentationScoreCard({ currentScore, previousScore, riskLevel, summary }: FragmentationScoreCardProps) {
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

  let scoreInterpretation: string;
  let progressIndicatorClassName = "bg-green-500"; 
  
  if (riskLevel) {
    scoreInterpretation = `${riskLevel} Fragmentation`;
    if (riskLevel === 'High') {
      progressIndicatorClassName = "bg-destructive";
    } else if (riskLevel === 'Moderate') {
      progressIndicatorClassName = "bg-yellow-500";
    }
  } else {
    // Fallback if riskLevel is not provided
    if (currentScore > 3.5) {
      scoreInterpretation = "High Fragmentation";
      progressIndicatorClassName = "bg-destructive";
    } else if (currentScore > 2.0) {
      scoreInterpretation = "Moderate Fragmentation";
      progressIndicatorClassName = "bg-yellow-500";
    } else {
      scoreInterpretation = "Low Fragmentation";
    }
  }


  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 min-h-[200px] flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">Cognitive Fragmentation</CardTitle>
          <Gauge className="h-6 w-6 text-primary" />
        </div>
        <CardDescription>Your current attention spread.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-between">
        <div>
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
        </div>
        {summary && (
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <div className="mt-3 text-xs text-muted-foreground flex items-center cursor-help">
                  <Info className="h-3 w-3 mr-1" />
                  <span>AI Insights (hover)</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-xs bg-popover text-popover-foreground p-2 rounded-md shadow-lg border text-xs">
                <p className="whitespace-pre-wrap">{summary}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
