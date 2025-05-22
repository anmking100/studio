
"use client";

import { useEffect, useState, useCallback } from "react";
import { TeamMemberCard } from "@/components/team-overview/team-member-card";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, BarChart3, ShieldAlert, Loader2, AlertTriangle, ShieldCheck, ExternalLink } from "lucide-react";
import Image from "next/image";
import { 
  calculateFragmentationScore, 
  type CalculateFragmentationScoreInput,
  type CalculateFragmentationScoreOutput
} from "@/ai/flows/calculate-fragmentation-score";
import type { TeamMemberFocus, GenericActivityItem, MicrosoftGraphUser, HistoricalScore } from "@/lib/types";
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const NUMBER_OF_HISTORICAL_DAYS = 5;

export default function TeamOverviewPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'hr';
  const [teamData, setTeamData] = useState<TeamMemberFocus[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(isHR); 
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  const [isProcessingMembers, setIsProcessingMembers] = useState(false); 

  const fetchAndProcessMemberData = useCallback(async (memberBase: Omit<TeamMemberFocus, 'isLoadingScore' | 'scoreError' | 'currentDayScoreData' | 'historicalScores' | 'averageHistoricalScore' | 'activityError' | 'isLoadingActivities'>): Promise<TeamMemberFocus> => {
    console.log(`Starting data processing for member: ${memberBase.name} (ID: ${memberBase.id})`);
    let overallMemberError: string | null = null;
    const historicalScores: HistoricalScore[] = [];
    let currentDayScoreData: CalculateFragmentationScoreOutput | null = null;

    // Helper to fetch activities and score for a specific day
    const getScoreForDay = async (targetDate: Date, isCurrentDayCall: boolean = false): Promise<CalculateFragmentationScoreOutput | null> => {
      let dailyActivities: GenericActivityItem[] = [];
      let activityFetchError: string | null = null;
      const dateStr = format(targetDate, 'yyyy-MM-dd');

      // Fetch Jira Activities for the targetDate
      if (memberBase.email) {
        try {
          const jiraResponse = await fetch(`/api/jira/issues?userEmail=${encodeURIComponent(memberBase.email)}&startDate=${dateStr}&endDate=${dateStr}`);
          if (jiraResponse.ok) {
            const jiraActivities: GenericActivityItem[] = await jiraResponse.json();
            dailyActivities.push(...jiraActivities);
          } else {
            const errorData = await jiraResponse.json();
            activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Jira (${dateStr}): ${errorData.error || jiraResponse.statusText}`;
          }
        } catch (e: any) {
          activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Jira fetch error (${dateStr}): ${e.message}`;
        }
      }

      // Fetch Teams Activities for the targetDate
      try {
        const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberBase.id)}&startDate=${dateStr}&endDate=${dateStr}`);
        if (teamsResponse.ok) {
          const teamsActivities: GenericActivityItem[] = await teamsResponse.json();
          dailyActivities.push(...teamsActivities);
        } else {
          const errorData = await teamsResponse.json();
          activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Teams (${dateStr}): ${errorData.error || teamsResponse.statusText}`;
        }
      } catch (e: any) {
        activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Teams fetch error (${dateStr}): ${e.message}`;
      }

      if (activityFetchError) {
        console.warn(`Activity fetch errors for ${memberBase.name} on ${dateStr}: ${activityFetchError}`);
        overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Day ${dateStr}: ${activityFetchError}`;
      }
      
      console.log(`Total activities for ${memberBase.name} on ${dateStr}: ${dailyActivities.length}`);

      try {
        const input: CalculateFragmentationScoreInputType = {
          userId: memberBase.id,
          activityWindowDays: 1, // Score for this single day
          activities: dailyActivities,
        };
        const result = await calculateFragmentationScore(input);
        console.log(`Score for ${memberBase.name} on ${dateStr}: ${result.fragmentationScore}`);
        return result;
      } catch (scoreErr: any) {
        const scoreErrorMessage = `Score calc error (${dateStr}): ${scoreErr.message}`;
        console.error(scoreErrorMessage, scoreErr);
        overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + scoreErrorMessage;
        return null;
      }
    };

    // Fetch current day's score (e.g., based on last 7 days or today's activities)
    // For consistency with historical, let's make "current" also based on just "today"
    const today = new Date();
    currentDayScoreData = await getScoreForDay(today, true);


    // Fetch historical scores for the past N days
    for (let i = 1; i <= NUMBER_OF_HISTORICAL_DAYS; i++) {
      const pastDate = subDays(today, i);
      const scoreData = await getScoreForDay(pastDate);
      if (scoreData) {
        historicalScores.push({
          date: format(pastDate, 'yyyy-MM-dd'),
          score: scoreData.fragmentationScore,
          riskLevel: scoreData.riskLevel,
          summary: scoreData.summary,
        });
      } else {
         // If a day's score fails, we still add a placeholder or note it.
         // For simplicity, we'll just have fewer items in historicalScores.
         // A more robust solution might add a placeholder with an error.
      }
    }
    historicalScores.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Sort by date asc

    let averageHistoricalScore: number | null = null;
    if (historicalScores.length > 0) {
      const sum = historicalScores.reduce((acc, curr) => acc + curr.score, 0);
      averageHistoricalScore = parseFloat((sum / historicalScores.length).toFixed(1));
    }
    
    console.log(`Finished processing for ${memberBase.name}. Current score: ${currentDayScoreData?.fragmentationScore}, Avg Hist: ${averageHistoricalScore}`);

    return {
      ...memberBase,
      currentDayScoreData,
      historicalScores,
      averageHistoricalScore,
      isLoadingScore: false,
      isLoadingActivities: false, // Assuming activities are fetched within getScoreForDay
      scoreError: overallMemberError,
      activityError: null, // activity errors are aggregated into overallMemberError for now
    };
  }, []);


  const handleRetryMemberProcessing = useCallback(async (memberId: string) => {
    console.log(`Retrying data processing for member ID: ${memberId}`);
    const memberToRetry = teamData.find(m => m.id === memberId);
    
    if (memberToRetry) {
        setTeamData(prevTeamData => 
          prevTeamData.map(m => 
            m.id === memberId 
              ? { ...m, isLoadingScore: true, scoreError: null, historicalScores: [], averageHistoricalScore: null, currentDayScoreData: null } 
              : m
          )
        );
        const updatedMember = await fetchAndProcessMemberData(memberToRetry); // Pass the base member info
        setTeamData(prevTeamData => 
            prevTeamData.map(m => 
            m.id === memberId ? updatedMember : m
            )
        );
    } else {
        console.error(`Could not find member with ID ${memberId} to retry.`);
    }
  }, [teamData, fetchAndProcessMemberData]);


  useEffect(() => {
    if (isHR) {
      const fetchGraphUsersAndProcessAll = async () => {
        setIsLoadingUsers(true);
        setUserFetchError(null);
        setTeamData([]);
        setIsProcessingMembers(true); 

        let msUsers: MicrosoftGraphUser[] = [];
        try {
          const response = await fetch("/api/microsoft-graph/users");
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch MS Graph users: ${response.statusText}`);
          }
          msUsers = await response.json();
          console.log(`Fetched ${msUsers.length} users from MS Graph.`);
        } catch (err: any) {
          console.error("Error fetching MS Graph users:", err);
          setUserFetchError(err.message || "An unknown error occurred while fetching users.");
          setIsLoadingUsers(false);
          setIsProcessingMembers(false);
          return;
        }
          
        const validMsUsers = msUsers.filter(msUser => {
          if (!msUser.id) {
            console.warn(`MS Graph user data missing ID. UPN: ${msUser.userPrincipalName || 'N/A'}. Skipped.`);
            return false;
          }
          if (!msUser.userPrincipalName) {
              console.warn(`MS Graph user missing UPN (email) for ID: ${msUser.id}. Jira activities may be unavailable.`);
          }
          return true;
        });

        if (validMsUsers.length === 0) {
          const errorMsg = msUsers.length > 0 
            ? "Fetched users from MS Graph, but none had a valid 'id'." 
            : "No users found in Microsoft Graph.";
          setUserFetchError(errorMsg);
          setIsLoadingUsers(false);
          setIsProcessingMembers(false);
          return;
        }

        const initialTeamData: TeamMemberFocus[] = validMsUsers.map(msUser => ({
          id: msUser.id!, 
          name: msUser.displayName || msUser.userPrincipalName || "Unknown User",
          email: msUser.userPrincipalName || "", 
          role: (msUser.userPrincipalName?.toLowerCase().includes('hr')) ? 'hr' : 'developer', 
          avatarUrl: `https://placehold.co/100x100.png?text=${(msUser.displayName || msUser.userPrincipalName || "U")?.[0]?.toUpperCase()}`,
          isLoadingScore: true, 
          isLoadingActivities: true, // General loading flag
          scoreError: null,
          activityError: null,
          historicalScores: [],
          averageHistoricalScore: null,
          currentDayScoreData: null,
        }));
        setTeamData(initialTeamData); 
        setIsLoadingUsers(false); 

        console.log(`Processing ${initialTeamData.length} valid team members for scores...`);
        const processedTeamDataPromises = initialTeamData.map(member =>
           fetchAndProcessMemberData(member).then(updatedMember => {
             setTeamData(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
             return updatedMember;
           })
        );
        await Promise.all(processedTeamDataPromises);
        console.log("All team member data processing complete.");
        setIsProcessingMembers(false); 
      };
      fetchGraphUsersAndProcessAll();
    }
  }, [isHR, fetchAndProcessMemberData]); 
  
  const teamStats = teamData.reduce((acc, member) => {
    if (member.isLoadingScore || !member.currentDayScoreData?.riskLevel || member.scoreError) return acc; 
    const riskLevel = member.currentDayScoreData.riskLevel;
    const status = riskLevel === 'Low' ? 'Stable' : riskLevel === 'Moderate' ? 'At Risk' : 'Overloaded'; 
    if (status === "Stable") acc.stable++;
    else if (status === "At Risk") acc.atRisk++;
    else if (status === "Overloaded") acc.overloaded++;
    return acc;
  }, { stable: 0, atRisk: 0, overloaded: 0 });


  return (
    <div className="space-y-6">
       <Card className="bg-card shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary via-indigo-600 to-accent p-6 md:p-8">
           <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-3xl font-bold text-primary-foreground">Team Focus Overview</CardTitle>
              <CardDescription className="text-lg text-primary-foreground/80 mt-1">
                Visualize your team's cognitive load using live activity data and historical trends.
              </CardDescription>
            </div>
             <Image 
              src="https://placehold.co/300x150.png" 
              alt="Team collaboration illustration" 
              width={150} 
              height={75} 
              className="rounded-lg mt-4 md:mt-0 opacity-80"
              data-ai-hint="team collaboration"
            />
          </div>
        </CardHeader>
      </Card>
      
      {!isHR && (
        <Alert variant="default" className="border-accent bg-accent/10 text-accent-foreground shadow-md">
          <ShieldAlert className="h-5 w-5 text-accent" />
          <AlertTitle className="font-semibold text-accent">Privacy Notice</AlertTitle>
          <AlertDescription>
            To protect individual privacy, detailed fragmentation scores and historical data are only visible to HR personnel.
          </AlertDescription>
        </Alert>
      )}

      {isHR && isLoadingUsers && (
         <Alert variant="default" className="shadow-md border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />
          <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Fetching Team Members</AlertTitle>
          <AlertDescription className="text-blue-600 dark:text-blue-500">
            Loading user data from Microsoft Graph...
          </AlertDescription>
        </Alert>
      )}
      {isHR && userFetchError && !isLoadingUsers && (
        <Alert variant="destructive" className="shadow-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Error Fetching Users</AlertTitle>
          <AlertDescription>{userFetchError} Please ensure Microsoft Graph API is configured correctly in .env and the service is running.</AlertDescription>
        </Alert>
      )}

      {isHR && !isLoadingUsers && !userFetchError && isProcessingMembers && (
        <Alert variant="default" className="shadow-md border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />
          <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Processing Team Data (This will take time)</AlertTitle>
          <AlertDescription className="text-blue-600 dark:text-blue-500">
            Fetching activities and calculating current & 5-day historical AI scores for each team member.
            Number of members remaining to start processing: ({teamData.filter(m => m.isLoadingScore).length}). Please be patient.
          </AlertDescription>
        </Alert>
      )}
      
      {isHR && !isLoadingUsers && !userFetchError && !isProcessingMembers && teamData.length > 0 && (
         <Alert variant="default" className="shadow-md border-green-500/50 text-green-700 dark:border-green-400/50 dark:text-green-400">
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-500" />
          <AlertTitle className="font-semibold text-green-700 dark:text-green-400">Team Data Processed</AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-500">
            Activity fetching and AI score calculations (current and historical) are complete for all team members.
            Some members or specific days might have errors if data couldn't be fetched or processed (check individual cards).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stable Members (Current)</CardTitle>
            <Users className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{teamStats.stable}</div>
            <p className="text-xs text-muted-foreground">Low current fragmentation</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk Members (Current)</CardTitle>
            <Users className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{teamStats.atRisk}</div>
            <p className="text-xs text-muted-foreground">Moderate current fragmentation</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overloaded Members (Current)</CardTitle>
            <Users className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{teamStats.overloaded}</div>
            <p className="text-xs text-muted-foreground">High current fragmentation</p>
          </CardContent>
        </Card>
      </div>
      
       <Alert variant="default" className="border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400 shadow-sm">
        <ExternalLink className="h-5 w-5 text-blue-600 dark:text-blue-500" />
        <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Integration Notes & Permissions</AlertTitle>
        <AlertDescription className="text-blue-600 dark:text-blue-500 space-y-1">
          <p>
            Jira: Requires `JIRA_INSTANCE_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN` in `.env`. User's email from MS Graph is used for Jira queries.
          </p>
          <p>
            Microsoft Teams/M365: Requires Azure App Registration with `User.Read.All`, `Presence.Read.All`, `Calendars.Read` (Application permissions, admin consent).
          </p>
          <p>
            Historical data fetching can be slow and API intensive. Errors for specific days might occur.
          </p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">Team Member Status</CardTitle>
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <CardDescription>
            {isHR ? "Detailed view of each team member's AI-calculated focus status, including current score and 5-day historical trend." : "Overview of team member stability (details restricted)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isHR && !isLoadingUsers && !userFetchError && teamData.length === 0 && !isProcessingMembers && (
             <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Users Found or Processed</AlertTitle>
              <AlertDescription>
                No users were returned from Microsoft Graph, or none could be processed. Check configuration, API permissions, and server logs.
              </AlertDescription>
            </Alert>
          )}
          {teamData.map((member) => (
            <TeamMemberCard 
              key={member.id} 
              member={member} 
              showDetailedScore={isHR} 
              onRetry={() => handleRetryMemberProcessing(member.id)}
            />
          ))}
           {!isHR && teamData.length === 0 && ( 
            <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Team Data Available</AlertTitle>
              <AlertDescription>
                Team overview data is not available for your role or could not be loaded.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
