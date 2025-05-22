
"use client";

import type { TeamMemberFocus, CalculateFragmentationScoreOutput } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserCircle, AlertTriangle, ShieldCheck, Activity, Loader2, Info, Briefcase, MessageSquare, RefreshCw, CalendarDays, TrendingUp, Zap, LineChart, Eye } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { format, parseISO } from 'date-fns';
import { MemberHistoricalChart } from "./member-historical-chart";

interface TeamMemberCardProps {
  member: TeamMemberFocus;
  showDetailedScore: boolean;
  onRetry?: () => Promise<void>;
  onViewDetails?: (member: TeamMemberFocus) => void;
  currentScoreDate?: Date;
}

export function TeamMemberCard({ member, showDetailedScore, onRetry, onViewDetails, currentScoreDate }: TeamMemberCardProps) {
  const {
    name,
    avatarUrl,
    currentDayScoreData,
    historicalScores,
    averageHistoricalScore,
    isLoadingScore,
    scoreError
  } = member;

  const mainScore = showDetailedScore && currentDayScoreData ? currentDayScoreData.fragmentationScore : 0;
  let mainRiskLevel = showDetailedScore && currentDayScoreData ? currentDayScoreData.riskLevel : 'Low';
  const mainSummary = showDetailedScore && currentDayScoreData ? currentDayScoreData.summary : undefined;
  const mainActivitiesCount = showDetailedScore && currentDayScoreData ? currentDayScoreData.activitiesCount : 0;

  let StatusIcon = ShieldCheck;
  let statusText = mainRiskLevel as string;

  // If scoreError is present, and it's not just a "no activity" case for a successful calculation
  if (scoreError && currentDayScoreData?.fragmentationScore === undefined) { // Only override risk if score itself failed
    mainRiskLevel = 'Error'; // A pseudo risk level for error display
    statusText = 'Error';
    StatusIcon = AlertTriangle;
  } else if (mainRiskLevel === 'Low') { statusText = 'Stable'; StatusIcon = ShieldCheck; }
  else if (mainRiskLevel === 'Moderate') { statusText = 'At Risk'; StatusIcon = Activity; }
  else if (mainRiskLevel === 'High') { statusText = 'Overloaded'; StatusIcon = AlertTriangle; }
  else { statusText = 'Stable'; StatusIcon = ShieldCheck; }


  const getStatusBadgeClasses = (status: string): string => {
    if (status === "Stable") return "border-green-500 text-green-600 dark:border-green-400 dark:text-green-500 bg-green-500/10";
    if (status === "At Risk") return "border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-500 bg-yellow-500/10";
    if (status === "Overloaded") return "border-destructive text-destructive bg-destructive/10";
    if (status === "Error") return "border-destructive text-destructive bg-destructive/10"; // For error status
    return "border-muted text-muted-foreground";
  };

  const scorePercentage = (mainScore / 5) * 100;
  let progressIndicatorClassName = "bg-green-500";
  if (mainRiskLevel === 'High') {
    progressIndicatorClassName = "bg-destructive";
  } else if (mainRiskLevel === 'Moderate') {
    progressIndicatorClassName = "bg-yellow-500";
  } else if (mainRiskLevel === 'Error') {
    progressIndicatorClassName = "bg-destructive";
  }


  const isRateLimitError = (errorMsg?: string | null): boolean => {
    if (!errorMsg) return false;
    const lowerError = errorMsg.toLowerCase();
    return lowerError.includes("429") || lowerError.includes("quota exceeded") || lowerError.includes("rate limit");
  };

  const isModelOverloadedError = (errorMsg?: string | null): boolean => {
    if (!errorMsg) return false;
    const lowerError = errorMsg.toLowerCase();
    return lowerError.includes("model is overloaded") || lowerError.includes("503 service unavailable");
  };


  let errorTitle = "Data Processing Error";
  let errorDescription = scoreError;
  let DisplayErrorIcon = AlertTriangle; // Capitalized

  if (scoreError) {
    if (isRateLimitError(scoreError)) {
      errorTitle = "API Rate Limit Reached";
      errorDescription = "Too many requests to an external service. Please try again later.";
      DisplayErrorIcon = Zap;
    } else if (isModelOverloadedError(scoreError)) {
      errorTitle = "AI Model Busy";
      errorDescription = "The AI model is temporarily overloaded. Please try again later.";
      DisplayErrorIcon = Zap;
    } else {
      // For other errors, use the scoreError directly for the description if it's shorter,
      // or a generic message if it's very long.
      errorDescription = scoreError; // Show the actual error from the backend
    }
  }

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ensure the click is not on a button or a tooltip trigger within the card
    if (e.target instanceof HTMLElement && (e.target.closest('button') || e.target.closest('[role="tooltip"]'))) {
      return;
    }
    if (onViewDetails && showDetailedScore && !isLoadingScore) {
      onViewDetails(member);
    }
  };
  
  const cardClassName = `shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col min-h-[320px] sm:min-h-[350px] ${onViewDetails && showDetailedScore && !isLoadingScore && !scoreError ? 'cursor-pointer' : ''}`;

  return (
    <Card className={cardClassName} onClick={!scoreError ? handleCardClick : undefined}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-md font-medium truncate" title={name}>{name}</CardTitle>
          <p className="text-xs text-muted-foreground truncate" title={member.email}>{member.email}</p>
        </div>
        <Avatar className="h-10 w-10 ml-2 shrink-0">
          <AvatarImage src={avatarUrl || `https://placehold.co/100x100.png?text=${name?.[0]}`} alt={name} data-ai-hint="user avatar" />
          <AvatarFallback>{name?.[0]?.toUpperCase() || <UserCircle />}</AvatarFallback>
        </Avatar>
      </CardHeader>
      <CardContent className="space-y-2 flex-grow flex flex-col justify-between">
        {isLoadingScore && showDetailedScore ? (
          <div className="flex flex-col items-center justify-center flex-grow text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-center">Calculating score...</p>
            <p className="text-xs text-center">(Fetching & processing activities)</p>
          </div>
        ) : scoreError && showDetailedScore ? (
          <div className="flex flex-col items-center justify-center flex-grow text-destructive p-2 text-center">
            <DisplayErrorIcon className="h-8 w-8 mb-2" />
            <p className="text-sm font-semibold">{errorTitle}</p>
            <p className="text-xs mt-1">
              {errorDescription}
            </p>
            <div className="mt-2 flex gap-2">
              <TooltipProvider>
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                     <Button variant="outline" size="sm" className="text-xs h-auto px-2 py-1 border-destructive text-destructive hover:bg-destructive/10" onClick={(e) => e.stopPropagation()}>Details</Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-md bg-popover text-popover-foreground p-2 rounded-md shadow-lg border text-xs whitespace-pre-wrap">
                    {scoreError}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={(e) => {e.stopPropagation(); onRetry();}} className="text-xs h-auto px-2 py-1 border-primary text-primary hover:bg-primary/10">
                  <RefreshCw className="mr-1 h-3 w-3" />
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
                  {statusText} (Daily Score)
                </Badge>
                <div className="text-right">
                    <p className="text-xs text-muted-foreground">Score ({currentScoreDate ? format(currentScoreDate, 'MMM d') : 'Daily'})</p>
                  <p className="text-2xl font-bold text-primary">{mainScore.toFixed(1)}</p>
                </div>
              </div>
              <Progress value={scorePercentage} className="h-2" indicatorClassName={progressIndicatorClassName} />
              <p className="text-xs text-muted-foreground mt-1">Total activities for day: {mainActivitiesCount}</p>
            </div>

            {mainSummary && (
              <TooltipProvider>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div className="mt-1 text-xs text-muted-foreground flex items-center cursor-help hover:text-primary transition-colors" onClick={(e) => e.stopPropagation()}>
                      <Info className="h-3.5 w-3.5 mr-1 shrink-0" />
                      <span className="truncate">Daily Score Summary (hover)</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-xs bg-popover text-popover-foreground p-2 rounded-md shadow-lg border text-xs whitespace-pre-wrap">
                    <p>{mainSummary}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {historicalScores && historicalScores.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <div className="flex items-center gap-1">
                    <LineChart className="h-4 w-4" />
                    <span>Historical Trend ({historicalScores.length}-day avg):</span>
                  </div>
                  <span className="font-semibold text-foreground">{averageHistoricalScore?.toFixed(1) ?? "N/A"}</span>
                </div>
                <MemberHistoricalChart historicalData={historicalScores} />
              </div>
            )}
            {historicalScores && historicalScores.length === 0 && !isLoadingScore && (
              <p className="text-xs text-muted-foreground mt-2 text-center">No historical daily scores to display for selected range.</p>
            )}
            {onViewDetails && (
                <Button variant="outline" size="sm" className="w-full mt-2 text-xs" onClick={(e) => { e.stopPropagation(); handleCardClick(e); }}>
                    <Eye className="mr-2 h-3.5 w-3.5" /> View Activities
                </Button>
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
