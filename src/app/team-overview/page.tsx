
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

const NUMBER_OF_HISTORICAL_DAYS_FOR_TREND = 5; 

export default function TeamOverviewPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'hr';
  const [teamData, setTeamData] = useState<TeamMemberFocus[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(isHR); 
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  const [isProcessingMembers, setIsProcessingMembers] = useState(false);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(startOfDay(new Date()), 6), 
    to: endOfDay(new Date()),
  });

  const fetchActivitiesAndCalculateScore = useCallback(async (
    memberId: string, 
    memberEmail: string | undefined,
    targetDate: Date, 
    isCurrentDayRangeCall: boolean 
  ): Promise<CalculateFragmentationScoreOutput | { error: string } > => {
    let dailyActivities: GenericActivityItem[] = [];
    let activityFetchError: string | null = null;
    const activityWindowDays = 1; 

    let apiStartDateStr: string;
    let apiEndDateStr: string;

    if (isCurrentDayRangeCall && isEqual(startOfDay(targetDate), startOfDay(new Date()))) {
      // For current day, fetch up to current time if targetDate is today
      apiStartDateStr = startOfDay(targetDate).toISOString();
      apiEndDateStr = new Date().toISOString(); // Use current time for end
    } else {
      // For historical days or if targetDate is not today, fetch full day
      apiStartDateStr = startOfDay(targetDate).toISOString();
      apiEndDateStr = endOfDay(targetDate).toISOString();
    }
    console.log(`TEAM OVERVIEW: Fetching activities for member ${memberId} (${memberEmail || 'No Email'}) for period: ${apiStartDateStr} to ${apiEndDateStr}`);
    
    if (memberEmail) {
      try {
        console.log(`TEAM OVERVIEW: Fetching Jira for ${memberEmail}, ${apiStartDateStr}-${apiEndDateStr}`);
        const jiraResponse = await fetch(`/api/jira/issues?userEmail=${encodeURIComponent(memberEmail)}&startDate=${encodeURIComponent(apiStartDateStr)}&endDate=${encodeURIComponent(apiEndDateStr)}`);
        if (jiraResponse.ok) {
          const jiraActivities: GenericActivityItem[] = await jiraResponse.json();
          dailyActivities.push(...jiraActivities);
          console.log(`TEAM OVERVIEW: Jira success for ${memberEmail}, day ${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}, ${jiraActivities.length} activities found.`);
        } else {
          const errorData = await jiraResponse.json();
          activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Jira (${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}): ${errorData.error || jiraResponse.statusText}`;
          console.warn(`TEAM OVERVIEW: Jira error for ${memberEmail}, day ${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}: ${activityFetchError}`);
        }
      } catch (e: any) {
        activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Jira fetch error (${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}): ${e.message}`;
        console.error(`TEAM OVERVIEW: Jira exception for ${memberEmail}, day ${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}: ${activityFetchError}`);
      }
    } else {
        console.log(`TEAM OVERVIEW: Skipping Jira for ${memberId} as no email provided.`);
    }

    try {
      console.log(`TEAM OVERVIEW: Fetching Teams for ${memberId}, ${apiStartDateStr}-${apiEndDateStr}`);
      const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberId)}&startDate=${encodeURIComponent(apiStartDateStr)}&endDate=${encodeURIComponent(apiEndDateStr)}`);
      if (teamsResponse.ok) {
        const teamsActivities: GenericActivityItem[] = await teamsResponse.json();
        dailyActivities.push(...teamsActivities);
        console.log(`TEAM OVERVIEW: Teams success for ${memberId}, day ${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}, ${teamsActivities.length} activities found.`);
      } else {
        const errorData = await teamsResponse.json();
        activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Teams (${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}): ${errorData.error || teamsResponse.statusText}`;
        console.warn(`TEAM OVERVIEW: Teams error for ${memberId}, day ${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}: ${activityFetchError}`);
      }
    } catch (e: any) {
      activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Teams fetch error (${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}): ${e.message}`;
      console.error(`TEAM OVERVIEW: Teams exception for ${memberId}, day ${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}: ${activityFetchError}`);
    }
    
    if (activityFetchError) { 
      console.warn(`TEAM OVERVIEW: Combined activity fetch errors for ${memberId} on period ${format(new Date(apiStartDateStr), 'yyyy-MM-dd')}: ${activityFetchError}`);
    }
    
    try {
      const input: CalculateFragmentationScoreInputType = {
        userId: memberId,
        activityWindowDays, 
        activities: dailyActivities,
      };
      const result = calculateScoreAlgorithmically(input);
      console.log(`TEAM OVERVIEW: Algorithmic score for ${memberId} for period ${apiStartDateStr}-${apiEndDateStr}: ${result.fragmentationScore}. Activities: ${dailyActivities.length}. Summary: ${result.summary}`);
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
    console.log(`TEAM OVERVIEW: Starting data processing for member: ${memberInput.name} (ID: ${memberInput.id}) for range ${format(effectiveStartDate, 'yyyy-MM-dd')} to ${format(effectiveEndDate, 'yyyy-MM-dd HH:mm')}`);
    let overallMemberError: string | null = null;
    const historicalScores: HistoricalScore[] = [];
    let currentDayScoreData: CalculateFragmentationScoreOutput | null = null;

    // Calculate score for the main target date (effectiveEndDate)
    const mainTargetDateResult = await fetchActivitiesAndCalculateScore(memberInput.id, memberInput.email, effectiveEndDate, true);
    if ('error' in mainTargetDateResult) {
      overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Score for ${format(effectiveEndDate, 'yyyy-MM-dd')}: ${mainTargetDateResult.error}`;
    } else {
      currentDayScoreData = mainTargetDateResult;
    }
    
    // Calculate historical scores
    for (let i = 0; i < NUMBER_OF_HISTORICAL_DAYS_FOR_TREND; i++) {
      const historicalDate = startOfDay(subDays(effectiveEndDate, i + 1)); // Go back one more day for each iteration
      
      // Ensure historical date is not before the overall range start date
      if (isBefore(historicalDate, startOfDay(effectiveStartDate))) {
        console.log(`TEAM OVERVIEW: Historical date ${format(historicalDate, 'yyyy-MM-dd')} is before start date ${format(startOfDay(effectiveStartDate), 'yyyy-MM-dd')}. Skipping further historical calculations for ${memberInput.name}.`);
        break; // Stop if we've gone past the start of the selected range
      }

      console.log(`TEAM OVERVIEW: Calculating historical score for ${memberInput.name} on ${format(historicalDate, 'yyyy-MM-dd')}`);
      const historicalDayResult = await fetchActivitiesAndCalculateScore(memberInput.id, memberInput.email, historicalDate, false);
      if ('error' in historicalDayResult) {
         overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Historical score for ${format(historicalDate, 'yyyy-MM-dd')}: ${historicalDayResult.error}`;
         console.warn(`TEAM OVERVIEW: Error calculating historical score for ${memberInput.name} on ${format(historicalDate, 'yyyy-MM-dd')}: ${historicalDayResult.error}`);
      } else {
        console.log(`TEAM OVERVIEW: Historical score for ${memberInput.name} on ${format(historicalDate, 'yyyy-MM-dd')}: Score=${historicalDayResult.fragmentationScore}, Activities=${historicalDayResult.activitiesCount || 'N/A'}. Summary: ${historicalDayResult.summary}`);
        historicalScores.push({
          date: format(startOfDay(historicalDate), 'yyyy-MM-dd'), // Store date as YYYY-MM-DD
          score: historicalDayResult.fragmentationScore,
          riskLevel: historicalDayResult.riskLevel,
          summary: historicalDayResult.summary,
        });
      }
    }
    // Sort historical scores by date ascending for charting
    historicalScores.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()); 

    let averageHistoricalScore: number | null = null;
    if (historicalScores.length > 0) {
      const sum = historicalScores.reduce((acc, curr) => acc + curr.score, 0);
      averageHistoricalScore = parseFloat((sum / historicalScores.length).toFixed(1));
    }
    
    console.log(`TEAM OVERVIEW: Finished processing for member: ${memberInput.name}. Current Score: ${currentDayScoreData?.fragmentationScore ?? 'N/A'}. Historical Count: ${historicalScores.length}. Avg Hist Score: ${averageHistoricalScore ?? 'N/A'}. Error: ${overallMemberError ?? 'None'}`);
    return {
      ...memberInput,
      currentDayScoreData,
      historicalScores,
      averageHistoricalScore,
      isLoadingScore: false,
      isLoadingActivities: false,
      scoreError: overallMemberError,
      activityError: overallMemberError, // Consider if activityError should be more granular
    };
  }, [fetchActivitiesAndCalculateScore]);


  const handleRetryMemberProcessing = useCallback(async (memberId: string) => {
    console.log(`TEAM OVERVIEW: Retrying data processing for member ID: ${memberId}`);
    const memberToRetry = teamData.find(m => m.id === memberId);
    
    if (memberToRetry && dateRange?.from && dateRange?.to) {
        // Set loading state for this specific member
        setTeamData(prevTeamData => 
          prevTeamData.map(m => 
            m.id === memberId 
              ? { ...m, isLoadingScore: true, isLoadingActivities: true, scoreError: null, activityError: null, historicalScores: [], averageHistoricalScore: null, currentDayScoreData: null } 
              : m
          )
        );
        
        // Destructure to get the base info, excluding the parts we are recalculating
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
        console.error(`TEAM OVERVIEW: Could not find member with ID ${memberId} to retry or date range is not set.`);
    }
  }, [teamData, processSingleMember, dateRange]);


  // Effect to fetch users and process their scores when HR role and dateRange are set
  useEffect(() => {
    if (isHR && dateRange?.from && dateRange?.to) {
      const fetchGraphUsersAndProcessAll = async () => {
        setIsLoadingUsers(true);
        setUserFetchError(null);
        setTeamData([]); // Clear previous data
        setIsProcessingMembers(true); // Indicate that members are being processed

        // Determine the effective date range for processing
        const effectiveRangeFrom = startOfDay(dateRange.from!); // Ensure it's the start of the day
        let effectiveRangeTo = dateRange.to!;
        // If the end date is not today, use endOfDay. If it is today, use the current time.
        if (!isEqual(startOfDay(dateRange.to!), startOfDay(new Date()))) {
            effectiveRangeTo = endOfDay(dateRange.to!);
        }
        console.log(`TEAM OVERVIEW: Effective processing range: ${format(effectiveRangeFrom, 'yyyy-MM-dd')} to ${format(effectiveRangeTo, 'yyyy-MM-dd HH:mm')}`);

        let msUsers: MicrosoftGraphUser[] = [];
        try {
          const response = await fetch("/api/microsoft-graph/users");
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch MS Graph users: ${response.statusText}`);
          }
          msUsers = await response.json();
          console.log(`TEAM OVERVIEW: Fetched ${msUsers.length} users from MS Graph.`);
        } catch (err: any) {
          console.error("TEAM OVERVIEW: Error fetching MS Graph users:", err);
          setUserFetchError(err.message || "An unknown error occurred while fetching users.");
          setIsLoadingUsers(false);
          setIsProcessingMembers(false);
          return;
        }
          
        const validMsUsers = msUsers.filter(msUser => {
          if (!msUser.id) {
            console.warn(`TEAM OVERVIEW: MS Graph user data missing ID. UPN: ${msUser.userPrincipalName || 'N/A'}. Skipped.`);
            return false;
          }
          return true;
        });

        if (validMsUsers.length === 0 && msUsers.length > 0) {
            const errorMsg = "No users with valid IDs found after fetching from Microsoft Graph. Check if users have an 'id' field.";
            console.warn("TEAM OVERVIEW:", errorMsg);
            setUserFetchError(errorMsg);
            // still continue to show that 0 users are being processed if msUsers.length was > 0
        } else if (validMsUsers.length === 0) {
          const errorMsg = "No users returned from Microsoft Graph. Check your configuration or ensure there are users in your tenant.";
          console.warn("TEAM OVERVIEW:", errorMsg);
          setUserFetchError(errorMsg);
          setIsLoadingUsers(false);
          setIsProcessingMembers(false);
          return;
        }
        console.log(`TEAM OVERVIEW: Processing ${validMsUsers.length} valid MS Graph users.`);

        // Initialize teamData with loading states
        const initialTeamDataSetup: TeamMemberFocus[] = validMsUsers.map(msUser => ({
          id: msUser.id!, // Asserting id is present due to filter above
          name: msUser.displayName || msUser.userPrincipalName || "Unknown User",
          email: msUser.userPrincipalName || undefined, // Jira uses UPN as email typically
          role: (msUser.userPrincipalName?.toLowerCase().includes('hr')) ? 'hr' : 'developer', // Basic role assumption
          avatarUrl: `https://placehold.co/100x100.png?text=${(msUser.displayName || msUser.userPrincipalName || "U")?.[0]?.toUpperCase()}`,
          isLoadingScore: true, // Will be true initially
          isLoadingActivities: true,
          scoreError: null,
          activityError: null,
          historicalScores: [],
          averageHistoricalScore: null,
          currentDayScoreData: null,
        }));
        setTeamData(initialTeamDataSetup); 
        setIsLoadingUsers(false); // Finished fetching users, now processing them
        
        // Process members one by one to avoid overwhelming APIs (simple sequential approach)
        // For parallel processing with rate limiting, a more complex queue system would be needed.
        for (const member of initialTeamDataSetup) {
            console.log(`TEAM OVERVIEW: Beginning processing for member: ${member.name}`);
            // Destructure to get base info, excluding fields that will be recalculated
            const { currentDayScoreData: _ignore1, historicalScores: _ignore2, averageHistoricalScore: _ignore3, isLoadingScore: _ignore4, isLoadingActivities: _ignore5, scoreError: _ignore6, activityError: _ignore7, ...baseMemberInfo } = member;
            if (effectiveRangeFrom && effectiveRangeTo) {
                const updatedMember = await processSingleMember(baseMemberInfo, effectiveRangeFrom, effectiveRangeTo);
                setTeamData(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
                console.log(`TEAM OVERVIEW: Finished processing for member: ${member.name}`);
            }
        }
        
        setIsProcessingMembers(false); // All members processed
        console.log("TEAM OVERVIEW: All members processed.");
      };
      fetchGraphUsersAndProcessAll();
    }
  }, [isHR, processSingleMember, dateRange]); // Added dateRange as dependency
  
  // Calculate overall team stats based on currentDayScoreData
  const teamStats = teamData.reduce((acc, member) => {
    if (member.isLoadingScore || !member.currentDayScoreData?.riskLevel || member.scoreError) return acc; // Skip if loading, no data, or error
    
    const riskLevel = member.currentDayScoreData.riskLevel;
    const status = riskLevel === 'Low' ? 'Stable' : riskLevel === 'Moderate' ? 'At Risk' : 'Overloaded'; 
    
    if (status === "Stable") acc.stable++;
    else if (status === "At Risk") acc.atRisk++;
    else if (status === "Overloaded") acc.overloaded++;
    return acc;
  }, { stable: 0, atRisk: 0, overloaded: 0 });

  const handleStartDateSelect = (day: Date | undefined) => {
    if (!day) return;
    const newFrom = startOfDay(day);
    setDateRange(prev => {
      const currentTo = prev?.to || new Date(); // Ensure 'to' is not before 'from'
      return { from: newFrom, to: isBefore(currentTo, newFrom) ? endOfDay(newFrom) : currentTo };
    });
  };

  const handleEndDateSelect = (day: Date | undefined) => {
    if (!day) return;
    // If selected end date is today, use current time. Otherwise, use end of selected day.
    const newTo = isEqual(startOfDay(day), startOfDay(new Date())) ? new Date() : endOfDay(day);
    setDateRange(prev => {
        const currentFrom = prev?.from || subDays(newTo, 6); // Ensure 'from' is not after 'to'
        return { from: isAfter(currentFrom, newTo) ? startOfDay(newTo) : currentFrom, to: newTo };
    });
  };

  // Helper to check if date1 is after date2 (ignores time part if dates are different)
  function isAfter(date1: Date, date2: Date): boolean {
    return date1.getTime() > date2.getTime();
  }


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
      
      {/* Date Range Pickers for HR */}
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
                  onSelect={handleStartDateSelect}
                  disabled={(date) => date > (dateRange?.to || new Date()) || date < subDays(new Date(), 90) || date > new Date() } // Max 90 days back, not after 'to' or future
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
                  onSelect={handleEndDateSelect}
                  disabled={(date) => date < (dateRange?.from || subDays(new Date(), 90)) || date > new Date()} // Not before 'from' or future
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </CardContent>
           <CardHeader>
            <CardDescription className="text-xs text-muted-foreground">
              Note: The score on cards refers to the selected End Date. Historical trend shows up to {NUMBER_OF_HISTORICAL_DAYS_FOR_TREND} days prior, within the selected Start Date.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Privacy notice for non-HR */}
      {!isHR && (
        <Alert variant="default" className="border-accent bg-accent/10 text-accent-foreground shadow-md">
          <ShieldAlert className="h-5 w-5 text-accent" />
          <AlertTitle className="font-semibold text-accent">Privacy Notice</AlertTitle>
          <AlertDescription>
            To protect individual privacy, detailed fragmentation scores, date range filtering, and historical data are only visible to HR personnel.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading States for HR */}
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

      {/* Team Statistics Summary */}
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
      
       {/* Integration Notes */}
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

      {/* Team Member Cards */}
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
          {/* Case: HR, no users loaded/processed yet, but not actively loading users (e.g., initial state or after error) */}
          {isHR && !isLoadingUsers && !userFetchError && teamData.length === 0 && !isProcessingMembers && (
             <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Users Found or Processed</AlertTitle>
              <AlertDescription>
                No users were returned from Microsoft Graph, or none could be processed. Check configuration, API permissions, and server logs. Ensure a date range is selected.
              </AlertDescription>
            </Alert>
          )}
          {teamData.map((member) => (
            <TeamMemberCard 
              key={member.id} 
              member={member} 
              showDetailedScore={isHR} 
              onRetry={() => handleRetryMemberProcessing(member.id)}
              currentScoreDate={dateRange?.to} // Pass the end date of the range
            />
          ))}
           {/* Case: Not HR, and no team data (e.g., if it was previously reliant on mock data that's now removed) */}
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

