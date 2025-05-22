"use client";

import type { TeamMemberFocus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, UserCircle, AlertTriangle, ShieldCheck, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface TeamMemberCardProps {
  member: TeamMemberFocus;
  showDetailedScore: boolean; // HR can see scores, others might see status only
}

export function TeamMemberCard({ member, showDetailedScore }: TeamMemberCardProps) {
  let StatusIcon = ShieldCheck;
  
  switch (member.overloadStatus) {
    case "Stable": StatusIcon = ShieldCheck; break;
    case "At Risk": StatusIcon = Activity; break;
    case "Overloaded": StatusIcon = AlertTriangle; break;
  }
  
  const getStatusBadgeVariant = (status: TeamMemberFocus["overloadStatus"]): BadgeProps["variant"] => {
    if (status === "Stable") return "outline"; 
    if (status === "At Risk") return "secondary";
    if (status === "Overloaded") return "destructive";
    return "default";
  };
  
  const getStatusBadgeClasses = (status: TeamMemberFocus["overloadStatus"]): string => {
    if (status === "Stable") return "border-green-500 text-green-600 dark:border-green-400 dark:text-green-500";
    // ShadCN secondary can be yellow-ish or gray based on theme. For consistency, let's use explicit yellow like others.
    if (status === "At Risk") return "border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-500 bg-yellow-500/10"; 
    if (status === "Overloaded") return "border-destructive text-destructive"; 
    return "";
  };

  const scorePercentage = (member.fragmentationScore / 5) * 100; // Assuming max score is 5 for visualization
  let progressIndicatorClassName = "bg-green-500";
  if (member.fragmentationScore > 3.5) {
    progressIndicatorClassName = "bg-destructive";
  } else if (member.fragmentationScore > 2.0) {
    progressIndicatorClassName = "bg-yellow-500";
  }


  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-md font-medium">{member.name}</CardTitle>
        <Avatar className="h-10 w-10">
          <AvatarImage src={member.avatarUrl || `https://placehold.co/100x100.png?text=${member.name[0]}`} alt={member.name} data-ai-hint="user avatar" />
          <AvatarFallback>{member.name[0]?.toUpperCase() || <UserCircle/>}</AvatarFallback>
        </Avatar>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant={getStatusBadgeVariant(member.overloadStatus)} className={getStatusBadgeClasses(member.overloadStatus)}>
            <StatusIcon className="mr-1 h-3.5 w-3.5" />
            {member.overloadStatus}
          </Badge>
          {showDetailedScore && (
             <div className="text-right">
                <p className="text-xs text-muted-foreground">Frag. Score</p>
                <p className="text-2xl font-bold text-primary">{member.fragmentationScore.toFixed(1)}</p>
            </div>
          )}
        </div>

        {showDetailedScore && (
          <div>
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
        {!showDetailedScore && (
           <p className="text-sm text-muted-foreground">
            Team member's current focus stability is {member.overloadStatus.toLowerCase()}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
