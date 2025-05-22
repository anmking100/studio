
"use client";

import type { TeamMemberFocus, HistoricalScore } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserCircle, AlertTriangle, ShieldCheck, Activity, Loader2, Info, Briefcase, MessageSquare, RefreshCw, CalendarDays, TrendingUp, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { format, parseISO } from 'date-fns';

interface TeamMemberCardProps {
  member: TeamMemberFocus;
  showDetailedScore: boolean; 
  onRetry?: () => Promise<void>;
}

export function TeamMemberCard({ member, showDetailedScore, onRetry }: TeamMemberCardProps) {
  const { 
    name, 
    avatarUrl, 
    currentDayScoreData,
    historicalScores,
    averageHistoricalScore,
    isLoadingScore, 
    scoreError 
  } = member;

  const currentScore = showDetailedScore && currentDayScoreData ? currentDayScoreData.fragmentationScore : 0;
  const currentRiskLevel = showDetailedScore && currentDayScoreData ? currentDayScoreData.riskLevel : 'Stable';
  const currentSummary = showDetailedScore && currentDayScoreData ? currentDayScoreData.summary : undefined;

  let StatusIcon = ShieldCheck;
  let statusText = currentRiskLevel as string; 

  if (currentRiskLevel === 'Low') { statusText = 'Stable'; StatusIcon = ShieldCheck; }
  else if (currentRiskLevel === 'Moderate') { statusText = 'At Risk'; StatusIcon = Activity; }
  else if (currentRiskLevel === 'High') { statusText = 'Overloaded'; StatusIcon = AlertTriangle; }
  else { statusText = 'Stable'; StatusIcon = ShieldCheck;} 

  const getStatusBadgeClasses = (status: string): string => {
    if (status === "Stable") return "border-green-500 text-green-600 dark:border-green-400 dark:text-green-500 bg-green-500/10";
    if (status === "At Risk") return "border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-500 bg-yellow-500/10"; 
    if (status === "Overloaded") return "border-destructive text-destructive bg-destructive/10"; 
    return "border-muted text-muted-foreground";
  };

  const scorePercentage = (currentScore / 5) * 100;
  let progressIndicatorClassName = "bg-green-500";
  if (currentRiskLevel === 'High') {
    progressIndicatorClassName = "bg-destructive";
  } else if (currentRiskLevel === 'Moderate') {
    progressIndicatorClassName = "bg-yellow-500";
  }

  const isAiOverloadedError = (errorMsg?: string | null): boolean => {
    if (!errorMsg) return false;
    return errorMsg.includes("model is overloaded") || errorMsg.includes("503 Service Unavailable");
  };

  const isRateLimitError = (errorMsg?: string | null): boolean => {
    if (!errorMsg) return false;
    return errorMsg.includes("429 Too Many Requests") || errorMsg.includes("exceeded your current quota");
  };

  let errorTitle = "Error Processing Data";
  let errorDescription = "An error occurred while fetching activities or calculating scores.";
  let displayErrorIcon = AlertTriangle;

  if (scoreError) {
    if (isRateLimitError(scoreError)) {
      errorTitle = "AI Rate Limit Reached";
      errorDescription = "Too many requests to the AI model. Please try again later or reduce the number of historical days processed.";
      displayErrorIcon = Zap;
    } else if (isAiOverloadedError(scoreError)) {
      errorTitle = "AI Model Busy";
      errorDescription = "The AI model is temporarily overloaded. Please try again.";
      displayErrorIcon = Zap; // Or another icon if you prefer for busy
    } else {
      // For other errors, including Jira fetch errors, display the scoreError directly
      errorTitle = "Data Processing Error";
      errorDescription = scoreError; // Display the specific error message
    }
  }


  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col min-h-[300px]">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-md font-medium truncate" title={name}>{name}</CardTitle>
          <p className="text-xs text-muted-foreground truncate" title={member.email}>{member.email}</p>
        </div>
        <Avatar className="h-10 w-10 ml-2 shrink-0">
          <AvatarImage src={avatarUrl || `https://placehold.co/100x100.png?text=${name?.[0]}`} alt={name} data-ai-hint="user avatar"/>
          <AvatarFallback>{name?.[0]?.toUpperCase() || <UserCircle/>}</AvatarFallback>
        </Avatar>
      </CardHeader>
      <CardContent className="space-y-2 flex-grow flex flex-col justify-between">
        {isLoadingScore && showDetailedScore ? (
          <div className="flex flex-col items-center justify-center flex-grow text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-center">Processing scores...</p>
            <p className="text-xs text-center">(Current & Historical)</p>
          </div>
        ) : scoreError && showDetailedScore ? (
          <div className="flex flex-col items-center justify-center flex-grow text-destructive p-2 text-center">
            <displayErrorIcon className="h-8 w-8 mb-2" />
            <p className="text-sm font-semibold">{errorTitle}</p>
            <p className="text-xs mt-1 whitespace-pre-wrap">{errorDescription.length > 150 ? errorDescription.substring(0, 150) + "..." : errorDescription}</p>
            <div className="mt-2 flex gap-2">
                <TooltipProvider>
                    <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className="text-xs h-auto px-2 py-1 border-destructive text-destructive hover:bg-destructive/10">Details</Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md bg-popover text-popover-foreground p-2 rounded-md shadow-lg border text-xs whitespace-pre-wrap">
                            {scoreError}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                {onRetry && (
                    <Button variant="outline" size="sm" onClick={onRetry} className="text-xs h-auto px-2 py-1 border-primary text-primary hover:bg-primary/10">
                        <RefreshCw className="mr-1 h-3 w-3"/>
                        Retry
                    </Button>
                )}
            </div>
          </div>
        ) : showDetailedScore && currentDayScoreData ? (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline" className={getStatusBadgeClasses(statusText)}>
                  <StatusIcon className="mr-1 h-3.5 w-3.5" />
                  {statusText} (Current)
                </Badge>
                <div className="text-right">
                    <p className="text-xs text-muted-foreground">Current Score</p>
                    <p className="text-2xl font-bold text-primary">{currentScore.toFixed(1)}</p>
                </div>
              </div>
              <Progress value={scorePercentage} className="h-2" indicatorClassName={progressIndicatorClassName} />
            </div>
            
            {currentSummary && (
              <TooltipProvider>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div className="mt-2 text-xs text-muted-foreground flex items-center cursor-help hover:text-primary transition-colors">
                      <Info className="h-3.5 w-3.5 mr-1 shrink-0" />
                      <span className="truncate">Current Algorithmic Summary (hover)</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-xs bg-popover text-popover-foreground p-2 rounded-md shadow-lg border text-xs whitespace-pre-wrap">
                    <p>{currentSummary}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {historicalScores && historicalScores.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    <span>{historicalScores.length}-Day Avg:</span>
                  </div>
                  <span className="font-semibold text-foreground">{averageHistoricalScore?.toFixed(1) ?? "N/A"}</span>
                </div>
                 <TooltipProvider>
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <div className="mt-1 text-xs text-muted-foreground flex items-center cursor-help hover:text-primary transition-colors">
                          <CalendarDays className="h-3.5 w-3.5 mr-1 shrink-0" />
                          <span className="truncate">Daily Scores (hover)</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start" className="max-w-xs bg-popover text-popover-foreground p-2 rounded-md shadow-lg border text-xs">
                        <p className="font-semibold mb-1">Past {historicalScores.length} Days:</p>
                        <ul className="space-y-0.5">
                          {historicalScores.slice().reverse().map(hs => ( // Show most recent first
                            <li key={hs.date} className="flex justify-between">
                              <span>{format(parseISO(hs.date), 'MMM d')}:</span>
                              <span className="font-medium">{hs.score.toFixed(1)} ({hs.riskLevel})</span>
                            </li>
                          ))}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
              </div>
            )}


          </>
        ) : ( 
           <div className="flex flex-col items-center justify-center flex-grow">
             <Badge variant="outline" className={getStatusBadgeClasses(statusText)}>
                <StatusIcon className="mr-1 h-3.5 w-3.5" />
                {statusText}
             </Badge>
             <p className="text-sm text-muted-foreground mt-2 text-center">
                {!showDetailedScore ? "Detailed focus scores are available to HR personnel." : "Loading score data..."}
             </p>
           </div>
        )}
      </CardContent>
    </Card>
  );
}
