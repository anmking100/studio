
"use client";

import type { TeamMemberFocus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { UserCircle, AlertTriangle, ShieldCheck, Activity, Loader2, Info, Briefcase, MessageSquare } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TeamMemberCardProps {
  member: TeamMemberFocus;
  showDetailedScore: boolean; 
}

export function TeamMemberCard({ member, showDetailedScore }: TeamMemberCardProps) {
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

  const currentScore = showDetailedScore && aiCalculatedScore !== undefined ? aiCalculatedScore : 0; // Default to 0 if not available
  const currentRiskLevel = showDetailedScore && aiRiskLevel ? aiRiskLevel : 'Stable'; // Default if not HR or not calculated
  const currentSummary = showDetailedScore ? aiSummary : undefined;

  let StatusIcon = ShieldCheck;
  let statusText = currentRiskLevel;

  if (currentRiskLevel === 'Low') { statusText = 'Stable'; StatusIcon = ShieldCheck; }
  else if (currentRiskLevel === 'Moderate') { statusText = 'At Risk'; StatusIcon = Activity; }
  else if (currentRiskLevel === 'High') { statusText = 'Overloaded'; StatusIcon = AlertTriangle; }
  // Default case, if aiRiskLevel is somehow not one of these
  else { statusText = 'Stable'; StatusIcon = ShieldCheck;}


  const getStatusBadgeClasses = (status: typeof statusText): string => {
    if (status === "Stable") return "border-green-500 text-green-600 dark:border-green-400 dark:text-green-500 bg-green-500/10";
    if (status === "At Risk") return "border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-500 bg-yellow-500/10"; 
    if (status === "Overloaded") return "border-destructive text-destructive bg-destructive/10"; 
    return "border-muted text-muted-foreground"; // Fallback for unknown status
  };

  const scorePercentage = (currentScore / 5) * 100;
  let progressIndicatorClassName = "bg-green-500";
  if (currentRiskLevel === 'High') {
    progressIndicatorClassName = "bg-destructive";
  } else if (currentRiskLevel === 'Moderate') {
    progressIndicatorClassName = "bg-yellow-500";
  }

  const overallLoading = isLoadingScore || isLoadingActivities;

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col min-h-[250px]">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-md font-medium truncate" title={name}>{name}</CardTitle>
          <p className="text-xs text-muted-foreground truncate" title={member.email}>{member.email}</p>
        </div>
        <Avatar className="h-10 w-10 ml-2 shrink-0">
          <AvatarImage src={avatarUrl || `https://placehold.co/100x100.png?text=${name[0]}`} alt={name} data-ai-hint="user avatar" />
          <AvatarFallback>{name[0]?.toUpperCase() || <UserCircle/>}</AvatarFallback>
        </Avatar>
      </CardHeader>
      <CardContent className="space-y-2 flex-grow flex flex-col justify-between">
        {overallLoading && showDetailedScore ? (
          <div className="flex flex-col items-center justify-center flex-grow text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-center">
                {isLoadingActivities ? "Fetching activities..." : "Calculating score..."}
            </p>
          </div>
        ) : (scoreError || activityError) && showDetailedScore ? (
          <div className="flex flex-col items-center justify-center flex-grow text-destructive p-2 text-center">
            <AlertTriangle className="h-8 w-8 mb-2" />
            <p className="text-sm font-semibold">Error Processing</p>
            {activityError && <p className="text-xs mt-1">Activity Fetch: {activityError.substring(0,100)}...</p>}
            {scoreError && <p className="text-xs mt-1">Score Calc: {scoreError.substring(0,100)}...</p>}
            <TooltipProvider>
                <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                        <Button variant="link" size="sm" className="text-xs h-auto p-0 mt-1 text-destructive">Details</Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs bg-popover text-popover-foreground p-2 rounded-md shadow-lg border text-xs whitespace-pre-wrap">
                        {activityError && `Activity Fetch Error:\n${activityError}\n\n`}
                        {scoreError && `Score Calculation Error:\n${scoreError}`}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
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

