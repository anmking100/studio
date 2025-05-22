
"use client";

import { useEffect, useState, useCallback } from "react";
import { TeamMemberCard } from "@/components/team-overview/team-member-card";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, BarChart3, ShieldAlert, Loader2, AlertTriangle, ShieldCheck, ExternalLink, CalendarIcon } from "lucide-react";
import Image from "next/image";
import { calculateScoreAlgorithmically } from "@/lib/score-calculator";
import type { TeamMemberFocus, GenericActivityItem, MicrosoftGraphUser, HistoricalScore, CalculateFragmentationScoreInputType, CalculateFragmentationScoreOutput } from "@/lib/types";
import { format, subDays, startOfDay, endOfDay, parseISO, isBefore, isEqual, addDays } from 'date-fns';
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const NUMBER_OF_HISTORICAL_DAYS_FOR_TREND = 5; // Number of days *before* the end date for trend calculation

export default function TeamOverviewPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'hr';
  const [teamData, setTeamData] = useState<TeamMemberFocus[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(isHR); 
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  const [isProcessingMembers, setIsProcessingMembers] = useState(false);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6), // Default to last 7 days
    to: new Date(),
  });

  const fetchActivitiesAndCalculateScore = useCallback(async (
    memberId: string, // Only need ID and email for fetching
    memberEmail: string | undefined,
    targetDate: Date, 
    isCurrentDayRangeCall: boolean // True if targetDate is today and we only want up to 'now'
  ): Promise<CalculateFragmentationScoreOutput | { error: string } > => {
    let dailyActivities: GenericActivityItem[] = [];
    let activityFetchError: string | null = null;
    const activityWindowDays = 1; 

    let apiStartDateStr: string;
    let apiEndDateStr: string;

    if (isCurrentDayRangeCall && isEqual(startOfDay(targetDate), startOfDay(new Date()))) {
      // For current day, fetch from start of today up to 'targetDate' (which is now)
      apiStartDateStr = startOfDay(targetDate).toISOString();
      apiEndDateStr = targetDate.toISOString(); 
    } else {
      // For historical days or a full 'targetDate' that is not today
      apiStartDateStr = startOfDay(targetDate).toISOString();
      apiEndDateStr = endOfDay(targetDate).toISOString();
    }
    console.log(`Fetching activities for member ${memberId} for period: ${apiStartDateStr} to ${apiEndDateStr}`);
    
    // Fetch Jira Activities
    if (memberEmail) {
      try {
        const jiraResponse = await fetch(`/api/jira/issues?userEmail=${encodeURIComponent(memberEmail)}&startDate=${encodeURIComponent(apiStartDateStr)}&endDate=${encodeURIComponent(apiEndDateStr)}`);
        if (jiraResponse.ok) {
          const jiraActivities: GenericActivityItem[] = await jiraResponse.json();
          dailyActivities.push(...jiraActivities);
        } else {
          const errorData = await jiraResponse.json();
          activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Jira (${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}): ${errorData.error || jiraResponse.statusText}`;
        }
      } catch (e: any) {
        activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Jira fetch error (${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}): ${e.message}`;
      }
    }

    // Fetch Teams Activities
    try {
      const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberId)}&startDate=${encodeURIComponent(apiStartDateStr)}&endDate=${encodeURIComponent(apiEndDateStr)}`);
      if (teamsResponse.ok) {
        const teamsActivities: GenericActivityItem[] = await teamsResponse.json();
        dailyActivities.push(...teamsActivities);
      } else {
        const errorData = await teamsResponse.json();
        activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Teams (${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}): ${errorData.error || teamsResponse.statusText}`;
      }
    } catch (e: any) {
      activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Teams fetch error (${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}): ${e.message}`;
    }
    
    if (activityFetchError) { 
      console.warn(`Activity fetch errors for ${memberId} on period ${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}: ${activityFetchError}`);
    }
    
    try {
      const input: CalculateFragmentationScoreInputType = {
        userId: memberId,
        activityWindowDays, 
        activities: dailyActivities,
      };
      const result = calculateScoreAlgorithmically(input);
      console.log(`Algorithmic score for ${memberId} for period ${apiStartDateStr}-${apiEndDateStr}: ${result.fragmentationScore}. Activities: ${dailyActivities.length}`);
       return activityFetchError ? { ...result, summary: `Note: Some activity data might be missing. ${activityFetchError}. ${result.summary}` } : result;
    } catch (scoreErr: any) {
      const scoreErrorMessage = `Algorithmic score calc error (${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}): ${scoreErr.message}`;
      console.error(scoreErrorMessage, scoreErr);
      return { error: activityFetchError ? `${activityFetchError}; ${scoreErrorMessage}` : scoreErrorMessage };
    }
  }, []);


  const processSingleMember = useCallback(async (
    memberInput: Omit<TeamMemberFocus, 'isLoadingScore' | 'scoreError' | 'currentDayScoreData' | 'historicalScores' | 'averageHistoricalScore' | 'activityError' | 'isLoadingActivities'>,
    effectiveStartDate: Date,
    effectiveEndDate: Date
    ): Promise<TeamMemberFocus> => {
    console.log(`Starting data processing for member: ${memberInput.name} (ID: ${memberInput.id}) for range ${format(effectiveStartDate, 'yyyy-MM-dd')} to ${format(effectiveEndDate, 'yyyy-MM-dd')}`);
    let overallMemberError: string | null = null;
    const historicalScores: HistoricalScore[] = [];
    let currentDayScoreData: CalculateFragmentationScoreOutput | null = null;

    // Calculate score for the effectiveEndDate (main score)
    const mainTargetDateResult = await fetchActivitiesAndCalculateScore(memberInput.id, memberInput.email, effectiveEndDate, true);
    if ('error' in mainTargetDateResult) {
      overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Score for ${format(effectiveEndDate, 'yyyy-MM-dd')}: ${mainTargetDateResult.error}`;
    } else {
      currentDayScoreData = mainTargetDateResult;
    }
    
    // Calculate historical scores leading up to (but not including) effectiveEndDate
    for (let i = 0; i < NUMBER_OF_HISTORICAL_DAYS_FOR_TREND; i++) {
      const historicalDate = subDays(effectiveEndDate, i + 1); // Day before, day before that, etc.
      
      if (isBefore(historicalDate, effectiveStartDate)) {
        // Do not go further back than the selected start date of the range
        break; 
      }

      const historicalDayResult = await fetchActivitiesAndCalculateScore(memberInput.id, memberInput.email, historicalDate, false);
      if ('error' in historicalDayResult) {
         overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Historical score for ${format(historicalDate, 'yyyy-MM-dd')}: ${historicalDayResult.error}`;
      } else {
        historicalScores.push({
          date: format(startOfDay(historicalDate), 'yyyy-MM-dd'),
          score: historicalDayResult.fragmentationScore,
          riskLevel: historicalDayResult.riskLevel,
          summary: historicalDayResult.summary,
        });
      }
    }
    historicalScores.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Oldest to newest

    let averageHistoricalScore: number | null = null;
    if (historicalScores.length > 0) {
      const sum = historicalScores.reduce((acc, curr) => acc + curr.score, 0);
      averageHistoricalScore = parseFloat((sum / historicalScores.length).toFixed(1));
    }
    
    return {
      ...memberInput,
      currentDayScoreData,
      historicalScores,
      averageHistoricalScore,
      isLoadingScore: false,
      isLoadingActivities: false,
      scoreError: overallMemberError,
      activityError: overallMemberError, // Consolidating activity fetch errors here for now
    };
  }, [fetchActivitiesAndCalculateScore]);


  const handleRetryMemberProcessing = useCallback(async (memberId: string) => {
    console.log(`Retrying data processing for member ID: ${memberId}`);
    const memberToRetry = teamData.find(m => m.id === memberId);
    
    if (memberToRetry && dateRange?.from && dateRange?.to) {
        setTeamData(prevTeamData => 
          prevTeamData.map(m => 
            m.id === memberId 
              ? { ...m, isLoadingScore: true, isLoadingActivities: true, scoreError: null, activityError: null, historicalScores: [], averageHistoricalScore: null, currentDayScoreData: null } 
              : m
          )
        );
        const { 
          currentDayScoreData: _cds, 
          historicalScores: _hs, 
          averageHistoricalScore: _ahs, 
          isLoadingScore: _ils, 
          isLoadingActivities: _ila, 
          scoreError: _se, 
          activityError: _ae, 
          ...baseMemberInfo 
        } = memberToRetry;

        const updatedMember = await processSingleMember(baseMemberInfo, dateRange.from, dateRange.to);
        setTeamData(prevTeamData => 
            prevTeamData.map(m => 
            m.id === memberId ? updatedMember : m
            )
        );
    } else {
        console.error(`Could not find member with ID ${memberId} to retry or date range is not set.`);
    }
  }, [teamData, processSingleMember, dateRange]);


  useEffect(() => {
    if (isHR && dateRange?.from && dateRange?.to) {
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
        } catch (err: any) {
          setUserFetchError(err.message || "An unknown error occurred while fetching users.");
          setIsLoadingUsers(false);
          setIsProcessingMembers(false);
          return;
        }
          
        const validMsUsers = msUsers.filter(msUser => {
          if (!msUser.id) {
            console.warn(`Team Overview: MS Graph user data missing ID. UPN: ${msUser.userPrincipalName || 'N/A'}. Skipped.`);
            return false;
          }
          return true;
        });

        if (validMsUsers.length === 0) {
          const errorMsg = "No users with valid IDs found in Microsoft Graph.";
          setUserFetchError(errorMsg);
          setIsLoadingUsers(false);
          setIsProcessingMembers(false);
          return;
        }

        const initialTeamDataSetup: TeamMemberFocus[] = validMsUsers.map(msUser => ({
          id: msUser.id!, 
          name: msUser.displayName || msUser.userPrincipalName || "Unknown User",
          email: msUser.userPrincipalName || "", 
          role: (msUser.userPrincipalName?.toLowerCase().includes('hr')) ? 'hr' : 'developer', 
          avatarUrl: `https://placehold.co/100x100.png?text=${(msUser.displayName || msUser.userPrincipalName || "U")?.[0]?.toUpperCase()}`,
          isLoadingScore: true, 
          isLoadingActivities: true,
          scoreError: null,
          activityError: null,
          historicalScores: [],
          averageHistoricalScore: null,
          currentDayScoreData: null,
        }));
        setTeamData(initialTeamDataSetup); 
        setIsLoadingUsers(false); 
        
        const processedTeamDataPromises = initialTeamDataSetup.map(member => {
           const { currentDayScoreData: _ignore1, historicalScores: _ignore2, averageHistoricalScore: _ignore3, isLoadingScore: _ignore4, isLoadingActivities: _ignore5, scoreError: _ignore6, activityError: _ignore7, ...baseMemberInfo } = member;
           // Ensure dateRange.from and dateRange.to are defined before calling processSingleMember
            if (dateRange.from && dateRange.to) {
                return processSingleMember(baseMemberInfo, dateRange.from, dateRange.to).then(updatedMember => {
                    setTeamData(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
                    return updatedMember;
                });
            }
            return Promise.resolve(member); // Should not happen if dateRange is checked
        });
        
        await Promise.all(processedTeamDataPromises);
        setIsProcessingMembers(false); 
      };
      fetchGraphUsersAndProcessAll();
    }
  }, [isHR, processSingleMember, dateRange]); // Added dateRange dependency
  
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
                Visualize team cognitive load using live activity data and historical trends for the selected date range.
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
      
      {isHR && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Select Date Range</CardTitle>
            <CardDescription>View team focus data for a specific period. Scores and trends will update based on this range.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full sm:w-[280px] justify-start text-left font-normal",
                    !dateRange?.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? format(dateRange.from, "LLL dd, y") : <span>Pick a start date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateRange?.from}
                  onSelect={(day) => setDateRange(prev => ({ from: day, to: prev?.to }))}
                  disabled={(date) => date > (dateRange?.to || new Date()) || date < subDays(new Date(), 90) || date > new Date() }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground hidden sm:block">-</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full sm:w-[280px] justify-start text-left font-normal",
                    !dateRange?.to && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.to ? format(dateRange.to, "LLL dd, y") : <span>Pick an end date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateRange?.to}
                  onSelect={(day) => setDateRange(prev => ({ from: prev?.from, to: day }))}
                  disabled={(date) => date < (dateRange?.from || subDays(new Date(), 90)) || date > new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </CardContent>
           <CardHeader>
            <CardDescription className="text-xs text-muted-foreground">
              Note: The "Current Score" on cards refers to the score for the selected End Date. Historical trend shows up to {NUMBER_OF_HISTORICAL_DAYS_FOR_TREND} days prior, within the selected Start Date.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!isHR && (
        <Alert variant="default" className="border-accent bg-accent/10 text-accent-foreground shadow-md">
          <ShieldAlert className="h-5 w-5 text-accent" />
          <AlertTitle className="font-semibold text-accent">Privacy Notice</AlertTitle>
          <AlertDescription>
            To protect individual privacy, detailed fragmentation scores, date range filtering, and historical data are only visible to HR personnel.
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
            Fetching activities and calculating scores for each team member for the selected date range.
            This involves multiple API calls per user and may take a while.
            Members remaining: ({teamData.filter(m => m.isLoadingScore || m.isLoadingActivities).length}). Please be patient.
          </AlertDescription>
        </Alert>
      )}
      
      {isHR && !isLoadingUsers && !userFetchError && !isProcessingMembers && teamData.length > 0 && (
         <Alert variant="default" className="shadow-md border-green-500/50 text-green-700 dark:border-green-400/50 dark:text-green-400">
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-500" />
          <AlertTitle className="font-semibold text-green-700 dark:text-green-400">Team Data Processed</AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-500">
            Activity fetching and score calculations are complete for the selected date range.
            Some members or specific days might have errors if data couldn't be fetched or processed (check individual cards).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stable Members (End Date)</CardTitle>
            <Users className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{teamStats.stable}</div>
            <p className="text-xs text-muted-foreground">Low fragmentation on selected end date</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk Members (End Date)</CardTitle>
            <Users className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{teamStats.atRisk}</div>
            <p className="text-xs text-muted-foreground">Moderate fragmentation on selected end date</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overloaded Members (End Date)</CardTitle>
            <Users className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{teamStats.overloaded}</div>
            <p className="text-xs text-muted-foreground">High fragmentation on selected end date</p>
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
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">Team Member Status</CardTitle>
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
           <CardDescription>
            {isHR 
              ? `Focus status for each team member based on the selected End Date (${dateRange?.to ? format(dateRange.to, "LLL dd, y") : 'N/A'}). Historical trend shows scores for up to ${NUMBER_OF_HISTORICAL_DAYS_FOR_TREND} days prior, within the selected date range.`
              : "Overview of team member stability (details restricted)."}
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
