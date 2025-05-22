
"use client";

import type { TeamMemberFocus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserCircle, AlertTriangle, ShieldCheck, Activity, Loader2, Info, Briefcase, MessageSquare, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface TeamMemberCardProps {
  member: TeamMemberFocus;
  showDetailedScore: boolean; 
  onRetry?: () => Promise<void>;
}

export function TeamMemberCard({ member, showDetailedScore, onRetry }: TeamMemberCardProps) {
  const { 
    name, 
    avatarUrl, 
    aiCalculatedScore, 
    aiRiskLevel, 
    aiSummary, 
    isLoadingScore, 
    isLoadingActivities,
    scoreError,
    activityError 
  } = member;

  const currentScore = showDetailedScore && aiCalculatedScore !== undefined ? aiCalculatedScore : 0;
  const currentRiskLevel = showDetailedScore && aiRiskLevel ? aiRiskLevel : 'Stable';
  const currentSummary = showDetailedScore ? aiSummary : undefined;

  let StatusIcon = ShieldCheck;
  let statusText = currentRiskLevel;

  if (currentRiskLevel === 'Low') { statusText = 'Stable'; StatusIcon = ShieldCheck; }
  else if (currentRiskLevel === 'Moderate') { statusText = 'At Risk'; StatusIcon = Activity; }
  else if (currentRiskLevel === 'High') { statusText = 'Overloaded'; StatusIcon = AlertTriangle; }
  else { statusText = 'Stable'; StatusIcon = ShieldCheck;}


  const getStatusBadgeClasses = (status: typeof statusText): string => {
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

  const overallLoading = isLoadingScore || isLoadingActivities;

  const isAiOverloadedError = (errorMsg?: string | null): boolean => {
    if (!errorMsg) return false;
    return errorMsg.includes("model is overloaded") || errorMsg.includes("503 Service Unavailable");
  };

  let displayedError = "";
  if (scoreError) displayedError = scoreError;
  if (activityError && !displayedError) displayedError = activityError; // Prefer scoreError if both exist
  else if (activityError && displayedError) displayedError = `Score Error: ${scoreError}\nActivity Error: ${activityError}`;


  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col min-h-[250px]">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-md font-medium truncate" title={name}>{name}</CardTitle>
          <p className="text-xs text-muted-foreground truncate" title={member.email}>{member.email}</p>
        </div>
        <Avatar className="h-10 w-10 ml-2 shrink-0">
          <AvatarImage src={avatarUrl || `https://placehold.co/100x100.png?text=${name?.[0]}`} alt={name} data-ai-hint="user avatar" />
          <AvatarFallback>{name?.[0]?.toUpperCase() || <UserCircle/>}</AvatarFallback>
        </Avatar>
      </CardHeader>
      <CardContent className="space-y-2 flex-grow flex flex-col justify-between">
        {overallLoading && showDetailedScore ? (
          <div className="flex flex-col items-center justify-center flex-grow text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-center">
                {isLoadingActivities && !isLoadingScore ? "Fetching activities..." : isLoadingScore ? "Calculating score..." : "Processing..."}
            </p>
          </div>
        ) : (displayedError) && showDetailedScore ? (
          <div className="flex flex-col items-center justify-center flex-grow text-destructive p-2 text-center">
            <AlertTriangle className="h-8 w-8 mb-2" />
            <p className="text-sm font-semibold">
              {isAiOverloadedError(displayedError) ? "AI Model Busy" : "Error Processing"}
            </p>
            <p className="text-xs mt-1">
              {isAiOverloadedError(displayedError) 
                ? "The AI model is temporarily overloaded. Please try again later." 
                : (activityError && scoreError ? `Multiple errors occurred.` : `${displayedError.substring(0, 100)}${displayedError.length > 100 ? "..." : ""}`)
              }
            </p>
            <div className="mt-2 flex gap-2">
                <TooltipProvider>
                    <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className="text-xs h-auto px-2 py-1 border-destructive text-destructive hover:bg-destructive/10">Details</Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md bg-popover text-popover-foreground p-2 rounded-md shadow-lg border text-xs whitespace-pre-wrap">
                            {displayedError}
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
        ) : showDetailedScore ? (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline" className={getStatusBadgeClasses(statusText)}>
                  <StatusIcon className="mr-1 h-3.5 w-3.5" />
                  {statusText}
                </Badge>
                <div className="text-right">
                    <p className="text-xs text-muted-foreground">Frag. Score</p>
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
                      <span className="truncate">AI Insights (hover for details)</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-xs bg-popover text-popover-foreground p-2 rounded-md shadow-lg border text-xs whitespace-pre-wrap">
                    <p>{currentSummary}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <div className="mt-auto pt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 shrink-0" /> 
                <span>Jira Activities: {member.activities?.filter(a => a.source === 'jira').length || 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span>Teams/M365 Activities: {member.activities?.filter(a => a.source === 'm365').length || 0}</span>
              </div>
            </div>
          </>
        ) : ( // Non-HR view
           <div className="flex flex-col items-center justify-center flex-grow">
             <Badge variant="outline" className={getStatusBadgeClasses(statusText)}>
                <StatusIcon className="mr-1 h-3.5 w-3.5" />
                {statusText}
             </Badge>
             <p className="text-sm text-muted-foreground mt-2 text-center">
                Detailed focus scores are available to HR personnel.
             </p>
           </div>
        )}
      </CardContent>
    </Card>
  );
}

