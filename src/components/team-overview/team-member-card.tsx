
"use client";

import type { TeamMemberFocus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, UserCircle, AlertTriangle, ShieldCheck, Activity, Loader2, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TeamMemberCardProps {
  member: TeamMemberFocus;
  showDetailedScore: boolean; // HR can see scores, others might see status only
}

export function TeamMemberCard({ member, showDetailedScore }: TeamMemberCardProps) {
  const currentScore = showDetailedScore && member.aiCalculatedScore !== undefined ? member.aiCalculatedScore : member.fragmentationScore;
  const currentRiskLevel = showDetailedScore && member.aiRiskLevel ? member.aiRiskLevel : member.overloadStatus;
  const currentSummary = showDetailedScore ? member.aiSummary : undefined;

  let StatusIcon = ShieldCheck;
  let statusText: TeamMemberFocus["overloadStatus"] | 'Low' | 'Moderate' | 'High' = 'Stable';

  if (currentRiskLevel === 'Low') { statusText = 'Stable'; StatusIcon = ShieldCheck; }
  else if (currentRiskLevel === 'Moderate') { statusText = 'At Risk'; StatusIcon = Activity; }
  else if (currentRiskLevel === 'High') { statusText = 'Overloaded'; StatusIcon = AlertTriangle; }
  else if (currentRiskLevel === 'Stable') { statusText = 'Stable'; StatusIcon = ShieldCheck; }
  else if (currentRiskLevel === 'At Risk') { statusText = 'At Risk'; StatusIcon = Activity; }
  else if (currentRiskLevel === 'Overloaded') { statusText = 'Overloaded'; StatusIcon = AlertTriangle; }


  const getStatusBadgeVariant = (status: typeof statusText): BadgeProps["variant"] => {
    if (status === "Stable") return "outline";
    if (status === "At Risk") return "secondary";
    if (status === "Overloaded") return "destructive";
    return "default";
  };
  
  const getStatusBadgeClasses = (status: typeof statusText): string => {
    if (status === "Stable") return "border-green-500 text-green-600 dark:border-green-400 dark:text-green-500";
    if (status === "At Risk") return "border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-500 bg-yellow-500/10"; 
    if (status === "Overloaded") return "border-destructive text-destructive"; 
    return "";
  };

  const scorePercentage = (currentScore / 5) * 100;
  let progressIndicatorClassName = "bg-green-500";
  if (currentScore > 3.5) {
    progressIndicatorClassName = "bg-destructive";
  } else if (currentScore > 2.0) {
    progressIndicatorClassName = "bg-yellow-500";
  }

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col min-h-[220px]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-md font-medium truncate" title={member.name}>{member.name}</CardTitle>
        <Avatar className="h-10 w-10">
          <AvatarImage src={member.avatarUrl || `https://placehold.co/100x100.png?text=${member.name[0]}`} alt={member.name} data-ai-hint="user avatar" />
          <AvatarFallback>{member.name[0]?.toUpperCase() || <UserCircle/>}</AvatarFallback>
        </Avatar>
      </CardHeader>
      <CardContent className="space-y-3 flex-grow flex flex-col justify-between">
        {member.isLoadingScore && showDetailedScore ? (
          <div className="flex flex-col items-center justify-center flex-grow text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm">Calculating score...</p>
          </div>
        ) : member.scoreError && showDetailedScore ? (
          <div className="flex flex-col items-center justify-center flex-grow text-destructive">
            <AlertTriangle className="h-8 w-8 mb-2" />
            <p className="text-sm text-center">Error: {member.scoreError}</p>
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between">
                <Badge variant={getStatusBadgeVariant(statusText)} className={getStatusBadgeClasses(statusText)}>
                  <StatusIcon className="mr-1 h-3.5 w-3.5" />
                  {statusText}
                </Badge>
                {showDetailedScore && (
                  <div className="text-right">
                      <p className="text-xs text-muted-foreground">Frag. Score</p>
                      <p className="text-2xl font-bold text-primary">{currentScore.toFixed(1)}</p>
                  </div>
                )}
              </div>

              {showDetailedScore && (
                <div className="mt-2">
                  <Progress value={scorePercentage} className="h-2" indicatorClassName={progressIndicatorClassName} />
                  <div className="mt-1 flex items-center text-xs text-muted-foreground">
                    {member.lastWeekTrend > 0 && <TrendingUp className="mr-1 h-4 w-4 text-destructive" />}
                    {member.lastWeekTrend < 0 && <TrendingDown className="mr-1 h-4 w-4 text-green-600" />}
                    {member.lastWeekTrend === 0 && <Minus className="mr-1 h-4 w-4 text-muted-foreground" />}
                    <span>
                      {member.lastWeekTrend !== 0 ? `${Math.abs(member.lastWeekTrend).toFixed(1)} change` : 'No change'} vs last week
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            {showDetailedScore && currentSummary && (
              <TooltipProvider>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div className="mt-2 text-xs text-muted-foreground flex items-center cursor-help">
                      <Info className="h-3 w-3 mr-1" />
                      <span>AI Insights (hover)</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-xs bg-popover text-popover-foreground p-2 rounded-md shadow-lg border text-xs">
                    <p className="whitespace-pre-wrap">{currentSummary}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {!showDetailedScore && (
              <p className="text-sm text-muted-foreground mt-2">
                Team member's current focus stability is {statusText.toLowerCase()}.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
