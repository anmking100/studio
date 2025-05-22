
"use client";

import { useEffect, useState, useCallback } from "react";
import { TeamMemberCard } from "@/components/team-overview/team-member-card";
import { UserActivityDetailsDialog } from "@/components/team-overview/user-activity-details-dialog";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, BarChart3, ShieldAlert, Loader2, AlertTriangle, ShieldCheck, CalendarDays, RefreshCw } from "lucide-react";
import Image from "next/image";
import { calculateScoreAlgorithmically } from "@/lib/score-calculator";
import type { TeamMemberFocus, GenericActivityItem, MicrosoftGraphUser, HistoricalScore, CalculateFragmentationScoreInputType, CalculateFragmentationScoreOutput } from "@/lib/types";
import { format, subDays, startOfDay, endOfDay, parseISO, isBefore, isEqual, setHours, setMinutes, setSeconds, setMilliseconds, addHours } from 'date-fns';
import type { DateRange } from "react-day-picker";
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
  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedUserForDetails, setSelectedUserForDetails] = useState<TeamMemberFocus | null>(null);
  const [detailedActivities, setDetailedActivities] = useState<GenericActivityItem[]>([]);
  const [isLoadingDetailedActivities, setIsLoadingDetailedActivities] = useState(false);
  const [detailedActivitiesError, setDetailedActivitiesError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 6)),
      to: today, // Default to current time for today
    };
  });

  // Helper to fetch activities for a specific day and calculate score
  const fetchActivitiesAndCalculateDailyScore = useCallback(async (
    memberId: string,
    memberEmail: string | undefined,
    dayStart: Date,
    dayEnd: Date // This will be the end of the day, or current time if today
  ): Promise<CalculateFragmentationScoreOutput | { error: string; details?: any; activitiesCount: number }> => {
    console.log(`TEAM OVERVIEW (DailyScore): Fetching activities for member ${memberId} (${memberEmail || 'No Email'}) for period: ${dayStart.toISOString()} to ${dayEnd.toISOString()}`);
    let dailyActivities: GenericActivityItem[] = [];
    let activityFetchError: string | null = null;

    // Fetch Jira Activities
    if (memberEmail) {
      try {
        const jiraResponse = await fetch(`/api/jira/issues?userEmail=${encodeURIComponent(memberEmail)}&startDate=${encodeURIComponent(dayStart.toISOString())}&endDate=${encodeURIComponent(dayEnd.toISOString())}`);
        if (jiraResponse.ok) {
          const jiraActivitiesFromApi: GenericActivityItem[] = await jiraResponse.json();
          if (jiraActivitiesFromApi.length > 0) {
             console.log(`TEAM OVERVIEW (DailyScore): Specifically, ${jiraActivitiesFromApi.length} JIRA activities were fetched for ${memberId} for day ${format(dayStart, 'yyyy-MM-dd')}.`);
          }
          dailyActivities.push(...jiraActivitiesFromApi);
        } else {
          const errorData = await jiraResponse.json();
          const jiraErrorMsg = `Jira: ${errorData.error || jiraResponse.statusText}`;
          activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + jiraErrorMsg;
          console.warn(`TEAM OVERVIEW (DailyScore): Jira fetch error for ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}: ${jiraErrorMsg}`);
        }
      } catch (e: any) {
        const jiraCatchError = `Jira fetch exception: ${e.message}`;
        activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + jiraCatchError;
        console.warn(`TEAM OVERVIEW (DailyScore): Jira fetch exception for ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}: ${jiraCatchError}`);
      }
    } else {
        console.log(`TEAM OVERVIEW (DailyScore): No memberEmail provided for Jira fetch for member ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}. Skipping Jira activities.`);
    }

    // Fetch Teams Activities
    try {
      const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberId)}&startDate=${encodeURIComponent(dayStart.toISOString())}&endDate=${encodeURIComponent(dayEnd.toISOString())}`);
      if (teamsResponse.ok) {
        const teamsActivitiesFromApi: GenericActivityItem[] = await teamsResponse.json();
        dailyActivities.push(...teamsActivitiesFromApi);
      } else {
        const errorData = await teamsResponse.json();
        const teamsErrorMsg = `Teams: ${errorData.error || teamsResponse.statusText}`;
        activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + teamsErrorMsg;
        console.warn(`TEAM OVERVIEW (DailyScore): Teams fetch error for ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}: ${teamsErrorMsg}`);
      }
    } catch (e: any) {
      const teamsCatchError = `Teams fetch exception: ${e.message}`;
      activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + teamsCatchError;
      console.warn(`TEAM OVERVIEW (DailyScore): Teams fetch exception for ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}: ${teamsCatchError}`);
    }
    
    dailyActivities.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    console.log(`TEAM OVERVIEW (DailyScore): Total ${dailyActivities.length} activities collected for ${memberId} for day ${format(dayStart, 'yyyy-MM-dd')} before scoring.`);

    try {
      const input: CalculateFragmentationScoreInputType = {
        userId: memberId,
        activityWindowDays: 1, 
        activities: dailyActivities,
      };
      const result = calculateScoreAlgorithmically(input);
      return activityFetchError ? { ...result, summary: `Note: Some activity data for this day might be missing. ${activityFetchError}. ${result.summary}` } : result;
    } catch (scoreErr: any) {
      const scoreErrorMessage = `Algorithmic score calc error for day ${format(dayStart, 'yyyy-MM-dd')}: ${scoreErr.message}`;
      console.error(`TEAM OVERVIEW (DailyScore): ${scoreErrorMessage}`, scoreErr);
      const baseErrorReturn = { error: activityFetchError ? `${activityFetchError}; ${scoreErrorMessage}` : scoreErrorMessage , details: {day: format(dayStart, 'yyyy-MM-dd')}, activitiesCount: dailyActivities.length };
      return baseErrorReturn;
    }
  }, []); 


  const processSingleMember = useCallback(async (
    memberInput: Omit<TeamMemberFocus, 'isLoadingScore' | 'scoreError' | 'currentDayScoreData' | 'historicalScores' | 'averageHistoricalScore' | 'activityError' | 'isLoadingActivities'>,
    effectiveStartDateForRange: Date, 
    effectiveEndDateForRange: Date,
    currentSystemTimeWhenProcessingStarted: Date 
  ): Promise<TeamMemberFocus> => {
    console.log(`TEAM OVERVIEW (Member): Starting data processing for member: ${memberInput.name} (ID: ${memberInput.id}) for range ${format(effectiveStartDateForRange, 'yyyy-MM-dd')} to ${format(effectiveEndDateForRange, 'yyyy-MM-dd HH:mm:ss')}`);
    let overallMemberError: string | null = null;
    const historicalScoresData: HistoricalScore[] = [];
    let currentDayCalculatedScoreData: CalculateFragmentationScoreOutput | null = null;

    const mainDayStart = startOfDay(effectiveEndDateForRange);
    const mainDayEnd = effectiveEndDateForRange; // This is already capped to current time if effectiveEndDateForRange is today

    console.log(`TEAM OVERVIEW (Member): Processing main day score for ${memberInput.name} for ${format(mainDayStart, 'yyyy-MM-dd')} up to ${format(mainDayEnd, 'HH:mm:ss')}`);
    const mainDayResult = await fetchActivitiesAndCalculateDailyScore(memberInput.id, memberInput.email, mainDayStart, mainDayEnd);
    
    if ('error' in mainDayResult) {
      overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Score for ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: ${mainDayResult.error}`;
    } else {
      currentDayCalculatedScoreData = mainDayResult;
    }

    for (let i = 0; i < NUMBER_OF_HISTORICAL_DAYS_FOR_TREND; i++) {
      const historicalDate = startOfDay(subDays(effectiveEndDateForRange, i + 1));

      if (isBefore(historicalDate, startOfDay(effectiveStartDateForRange))) {
        console.log(`TEAM OVERVIEW (Member): Historical date ${format(historicalDate, 'yyyy-MM-dd')} is before start date of range ${format(startOfDay(effectiveStartDateForRange), 'yyyy-MM-dd')}. Skipping further historical for ${memberInput.name}.`);
        break;
      }
      
      const historicalDayStart = startOfDay(historicalDate);
      const historicalDayEnd = endOfDay(historicalDate); 

      console.log(`TEAM OVERVIEW (Member): Processing historical score for ${memberInput.name} for ${format(historicalDayStart, 'yyyy-MM-dd')}`);
      const historicalDayResult = await fetchActivitiesAndCalculateDailyScore(memberInput.id, memberInput.email, historicalDayStart, historicalDayEnd);

      if ('error' in historicalDayResult) {
        const errorMsg = `Historical for ${format(historicalDate, 'yyyy-MM-dd')}: ${historicalDayResult.error}`;
        overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + errorMsg;
        console.warn(`TEAM OVERVIEW (Member): Error calculating historical score for ${memberInput.name} on ${format(historicalDate, 'yyyy-MM-dd')}: ${historicalDayResult.error}`);
      } else {
        console.log(`TEAM OVERVIEW (Member): Historical score for ${memberInput.name} on ${format(historicalDate, 'yyyy-MM-dd')}: Score=${historicalDayResult.fragmentationScore}, Activities=${historicalDayResult.activitiesCount}. Summary: ${historicalDayResult.summary}`);
        historicalScoresData.push({
          date: format(startOfDay(historicalDate), 'yyyy-MM-dd'),
          score: historicalDayResult.fragmentationScore,
          riskLevel: historicalDayResult.riskLevel,
          summary: historicalDayResult.summary,
          activitiesCount: historicalDayResult.activitiesCount,
        });
      }
    }
    historicalScoresData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let avgHistScore: number | null = null;
    const activeHistoricalScores = historicalScoresData.filter(hs => hs.activitiesCount > 0 && hs.score > 0.5); // Consider scores > 0.5 as active days for avg
    if (activeHistoricalScores.length > 0) {
      const sum = activeHistoricalScores.reduce((acc, curr) => acc + curr.score, 0);
      avgHistScore = parseFloat((sum / activeHistoricalScores.length).toFixed(1));
    } else if (historicalScoresData.length > 0) { 
        const nonZeroActivityScores = historicalScoresData.filter(hs => hs.activitiesCount > 0);
        if (nonZeroActivityScores.length > 0) {
            const sum = nonZeroActivityScores.reduce((acc, curr) => acc + curr.score, 0);
            avgHistScore = parseFloat((sum / nonZeroActivityScores.length).toFixed(1));
        } else { // All historical days had 0 activity and 0.0 score
            avgHistScore = 0.0;
        }
    }


    console.log(`TEAM OVERVIEW (Member): Finished processing for member: ${memberInput.name}. Score for (${format(effectiveEndDateForRange, 'yyyy-MM-dd')}): ${currentDayCalculatedScoreData?.fragmentationScore ?? 'N/A'}. Historical Count: ${historicalScoresData.length}. Avg Hist Score: ${avgHistScore ?? 'N/A'}. Error: ${overallMemberError ?? 'None'}`);
    
    return {
      ...memberInput,
      currentDayScoreData: currentDayCalculatedScoreData,
      historicalScores: historicalScoresData,
      averageHistoricalScore: avgHistScore,
      isLoadingScore: false,
      isLoadingActivities: false,
      scoreError: overallMemberError,
      activityError: overallMemberError, // Using scoreError for activityError as well for simplicity
    };
  }, [fetchActivitiesAndCalculateDailyScore]); 


  const handleRetryMemberProcessing = useCallback(async (memberId: string) => {
    console.log(`TEAM OVERVIEW: Retrying data processing for member ID: ${memberId}`);
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
        currentDayScoreData: _cds, historicalScores: _hs, averageHistoricalScore: _ahs,
        isLoadingScore: _ils, isLoadingActivities: _ila, scoreError: _se, activityError: _ae,
        ...baseMemberInfo
      } = memberToRetry;
      
      const currentSystemTimeForRetry = new Date();
      let effectiveRangeEndForRetry = dateRange.to;
      if (isEqual(startOfDay(dateRange.to), startOfDay(currentSystemTimeForRetry))) {
          effectiveRangeEndForRetry = currentSystemTimeForRetry; 
      } else {
          effectiveRangeEndForRetry = endOfDay(dateRange.to);
      }

      const updatedMember = await processSingleMember(baseMemberInfo, startOfDay(dateRange.from), effectiveRangeEndForRetry, currentSystemTimeForRetry);

      setTeamData(prevTeamData =>
        prevTeamData.map(m =>
          m.id === memberId ? updatedMember : m
        )
      );
    } else {
      console.error(`TEAM OVERVIEW: Could not find member with ID ${memberId} to retry or date range is not set.`);
    }
  }, [teamData, processSingleMember, dateRange]);

  useEffect(() => {
    if (isHR && dateRange?.from && dateRange?.to) {
      const fetchGraphUsersAndProcessAll = async () => {
        setIsLoadingUsers(true);
        setUserFetchError(null);
        setTeamData([]); // Clear previous data
        setIsProcessingMembers(true);
        
        const currentSystemTimeForFetch = new Date(); 
        const effectiveRangeFrom = startOfDay(dateRange.from);
        let effectiveRangeToForFetch: Date; 

        if (isEqual(startOfDay(dateRange.to), startOfDay(currentSystemTimeForFetch))) {
            // If selected end date is today, use current time for processing up to now
            effectiveRangeToForFetch = currentSystemTimeForFetch; 
        } else {
            // If selected end date is a past day, use the end of that day
            effectiveRangeToForFetch = endOfDay(dateRange.to);
        }
        console.log(`TEAM OVERVIEW: Effective processing range for ALL members (triggered by date/refreshKey): ${format(effectiveRangeFrom, 'yyyy-MM-dd')} to ${format(effectiveRangeToForFetch, 'yyyy-MM-dd HH:mm:ss')}`);

        let msUsers: MicrosoftGraphUser[] = [];
        try {
          const response = await fetch("/api/microsoft-graph/users");
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch MS Graph users: ${response.statusText}`);
          }
          msUsers = await response.json();
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

        if (validMsUsers.length === 0) {
          const errorMsg = msUsers.length > 0 ? "No users with valid IDs found from MS Graph." : "No users returned from MS Graph.";
          setUserFetchError(errorMsg);
          console.warn(`TEAM OVERVIEW: ${errorMsg}`);
          setIsLoadingUsers(false);
          setIsProcessingMembers(false);
          return;
        }

        const initialTeamDataSetup: TeamMemberFocus[] = validMsUsers.map(msUser => ({
          id: msUser.id!,
          name: msUser.displayName || msUser.userPrincipalName || "Unknown User",
          email: msUser.userPrincipalName || undefined,
          role: (msUser.userPrincipalName?.toLowerCase().includes('hr')) ? 'hr' : 'developer', // Basic role assumption
          avatarUrl: `https://placehold.co/100x100.png?text=${(msUser.displayName || msUser.userPrincipalName || "U")?.[0]?.toUpperCase()}`,
          isLoadingScore: true, isLoadingActivities: true, scoreError: null, activityError: null,
          historicalScores: [], averageHistoricalScore: null, currentDayScoreData: null,
        }));
        setTeamData(initialTeamDataSetup); // Show users with loading state
        setIsLoadingUsers(false);

        // Process each member sequentially to avoid overwhelming APIs (can be slow)
        // Or use Promise.all for parallel, but riskier for rate limits
        const processedTeamData: TeamMemberFocus[] = [];
        for (const member of initialTeamDataSetup) {
            const { currentDayScoreData: _a, historicalScores: _b, averageHistoricalScore: _c, isLoadingScore: _d, isLoadingActivities: _e, scoreError: _f, activityError: _g, ...baseInfo } = member;
            try {
                const updatedMember = await processSingleMember(baseInfo, effectiveRangeFrom, effectiveRangeToForFetch, currentSystemTimeForFetch);
                processedTeamData.push(updatedMember);
                 setTeamData(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m)); // Update UI incrementally
            } catch (error: any) {
                console.error(`TEAM OVERVIEW: Critical error processing member ${member.name}:`, error);
                const erroredMember = {
                    ...member,
                    isLoadingScore: false,
                    isLoadingActivities: false,
                    scoreError: `Critical processing error: ${error.message || 'Unknown error'}`
                };
                processedTeamData.push(erroredMember);
                setTeamData(prev => prev.map(m => m.id === member.id ? erroredMember : m));
            }
        }
        // setTeamData(processedTeamData); // Final update if not updating incrementally
        
        setIsProcessingMembers(false);
        console.log("TEAM OVERVIEW: All members processed.");
      };
      fetchGraphUsersAndProcessAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHR, dateRange, refreshKey, processSingleMember]); 

  const teamStats = teamData.reduce((acc, member) => {
    if (member.isLoadingScore || !member.currentDayScoreData?.riskLevel || member.scoreError) return acc;
    const riskLevel = member.currentDayScoreData.riskLevel;
    if (riskLevel === 'Low') acc.stable++;
    else if (riskLevel === 'Moderate') acc.atRisk++;
    else if (riskLevel === 'High') acc.overloaded++;
    return acc;
  }, { stable: 0, atRisk: 0, overloaded: 0 });

  const handleStartDateSelect = (day: Date | undefined) => {
    if (!day) return;
    const newFrom = startOfDay(day);
    setDateRange(prev => {
        const currentTo = prev?.to || new Date(); 
        const newTo = isBefore(currentTo, newFrom) ? endOfDay(newFrom) : currentTo; // Ensure 'to' is not before 'from'
        return { from: newFrom, to: newTo };
    });
  };

  const handleEndDateSelect = (day: Date | undefined) => {
    if (!day) return;
    const newTo = isEqual(startOfDay(day), startOfDay(new Date())) ? new Date() : endOfDay(day); // Use current time if today, else end of day
    setDateRange(prev => {
        const currentFrom = prev?.from || startOfDay(subDays(newTo, 6)); 
        const newFrom = isAfter(currentFrom, newTo) ? startOfDay(newTo) : currentFrom; // Ensure 'from' is not after 'to'
        return { from: newFrom, to: newTo };
    });
  };

  // Helper for date-fns `isAfter` which might not be directly available
  function isAfter(date1: Date, date2: Date): boolean {
    return date1.getTime() > date2.getTime();
  }
  
  const handleFetchActivitiesForDialog = useCallback(async (memberToView: TeamMemberFocus) => {
    if (!dateRange?.to) {
      setDetailedActivitiesError("Please select an end date to view activities.");
      return;
    }
    setSelectedUserForDetails(memberToView);
    setIsLoadingDetailedActivities(true);
    setDetailedActivities([]);
    setDetailedActivitiesError(null);

    // Determine the start and end for the dialog's activity fetch (should match main score's end date)
    const activityDayStart = startOfDay(dateRange.to);
    const activityDayEnd = isEqual(startOfDay(dateRange.to), startOfDay(new Date())) ? new Date() : endOfDay(dateRange.to);

    console.log(`TEAM_OVERVIEW (Dialog): Fetching activities for ${memberToView.name} for date ${format(activityDayStart, 'yyyy-MM-dd')} up to ${format(activityDayEnd, 'HH:mm:ss')}`);

    let activitiesForDialog: GenericActivityItem[] = [];
    let fetchErrorForDialog: string | null = null;

    // Fetch Jira Activities
    if (memberToView.email) {
      try {
        const jiraResponse = await fetch(`/api/jira/issues?userEmail=${encodeURIComponent(memberToView.email)}&startDate=${encodeURIComponent(activityDayStart.toISOString())}&endDate=${encodeURIComponent(activityDayEnd.toISOString())}`);
        if (jiraResponse.ok) {
          activitiesForDialog.push(...await jiraResponse.json());
        } else {
          const err = await jiraResponse.json();
          fetchErrorForDialog = `Jira: ${err.error || jiraResponse.statusText}`;
        }
      } catch (e: any) {
        fetchErrorForDialog = (fetchErrorForDialog ? fetchErrorForDialog + "; " : "") + `Jira Exc: ${e.message}`;
      }
    }

    // Fetch Teams Activities
    try {
      const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberToView.id)}&startDate=${encodeURIComponent(activityDayStart.toISOString())}&endDate=${encodeURIComponent(activityDayEnd.toISOString())}`);
      if (teamsResponse.ok) {
        activitiesForDialog.push(...await teamsResponse.json());
      } else {
        const err = await teamsResponse.json();
        fetchErrorForDialog = (fetchErrorForDialog ? fetchErrorForDialog + "; " : "") + `Teams: ${err.error || teamsResponse.statusText}`;
      }
    } catch (e: any) {
      fetchErrorForDialog = (fetchErrorForDialog ? fetchErrorForDialog + "; " : "") + `Teams Exc: ${e.message}`;
    }
    
    activitiesForDialog.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    setDetailedActivities(activitiesForDialog);
    setDetailedActivitiesError(fetchErrorForDialog);
    setIsLoadingDetailedActivities(false);
  }, [dateRange?.to]);


  const handleCloseUserDetailsDialog = () => {
    setSelectedUserForDetails(null);
    setDetailedActivities([]);
    setIsLoadingDetailedActivities(false);
    setDetailedActivitiesError(null);
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary via-indigo-600 to-accent p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-3xl font-bold text-primary-foreground">Team Focus Overview</CardTitle>
              <CardDescription className="text-lg text-primary-foreground/80 mt-1">
                Daily scores are calculated based on all activities for the selected day. Historical trend shows prior daily scores.
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
            <CardTitle className="text-lg">Select Date Range & Refresh</CardTitle>
            <CardDescription>
              View team focus data. Score for the selected End Date is calculated up to the current time if it's today, or for the full day if it's a past date. Refreshing updates the End Date score to the current time if it's today.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 items-center flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("w-full sm:w-auto min-w-[240px] justify-start text-left font-normal", !dateRange?.from && "text-muted-foreground")}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dateRange?.from ? format(dateRange.from, "LLL dd, y") : <span>Pick a start date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single" selected={dateRange?.from} onSelect={handleStartDateSelect}
                  disabled={(date) => date > (dateRange?.to || new Date()) || date < subDays(new Date(), 90) || date > new Date()} // Max 90 days in past, not after today or 'to' date
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground hidden sm:block">-</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("w-full sm:w-auto min-w-[240px] justify-start text-left font-normal", !dateRange?.to && "text-muted-foreground")}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dateRange?.to ? format(dateRange.to, "LLL dd, y") : <span>Pick an end date</span>} 
                  {/* Simplified display for button text, internal state holds time */}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single" selected={dateRange?.to} onSelect={handleEndDateSelect}
                  disabled={(date) => date < (dateRange?.from || subDays(new Date(), 90)) || date > new Date()} // Not before 'from' date or today
                  initialFocus
                />
              </PopoverContent>
            </Popover>
             <Button
              onClick={() => setRefreshKey(prev => prev + 1)}
              disabled={isLoadingUsers || isProcessingMembers}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Data
            </Button>
          </CardContent>
          <CardHeader>
            <CardDescription className="text-xs text-muted-foreground">
              Score for End Date is calculated based on activities up to current time (if End Date is today & refreshed) or full day (if past). Historical trend shows daily scores for up to {NUMBER_OF_HISTORICAL_DAYS_FOR_TREND} prior days within the selected Start Date.
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
          <AlertDescription className="text-blue-600 dark:text-blue-500">Loading user data from Microsoft Graph...</AlertDescription>
        </Alert>
      )}
      {isHR && userFetchError && !isLoadingUsers && (
        <Alert variant="destructive" className="shadow-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Error Fetching Users</AlertTitle>
          <AlertDescription>{userFetchError} Ensure MS Graph API is configured & service running.</AlertDescription>
        </Alert>
      )}

      {isHR && !isLoadingUsers && !userFetchError && isProcessingMembers && (
        <Alert variant="default" className="shadow-md border-orange-500/50 text-orange-700 dark:border-orange-400/50 dark:text-orange-400">
          <Loader2 className="h-5 w-5 animate-spin text-orange-600 dark:text-orange-500" />
          <AlertTitle className="font-semibold text-orange-700 dark:text-orange-400">Processing Team Data</AlertTitle>
          <AlertDescription className="text-orange-600 dark:text-orange-500">
            Fetching activities and calculating daily scores for each member. This may take some time.
            Members remaining: ({teamData.filter(m => m.isLoadingScore || m.isLoadingActivities).length}). Please be patient.
          </AlertDescription>
        </Alert>
      )}

      {isHR && !isLoadingUsers && !userFetchError && !isProcessingMembers && teamData.length === 0 && (
         <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Users to Process</AlertTitle>
              <AlertDescription>
                No users were found from Microsoft Graph, or an error occurred before processing could start.
                Please check MS Graph configuration, API permissions, and server logs.
              </AlertDescription>
            </Alert>
      )}
      
      {isHR && !isLoadingUsers && !userFetchError && !isProcessingMembers && teamData.length > 0 && !teamData.some(m => m.isLoadingScore) && (
        <Alert variant="default" className="shadow-md border-green-500/50 text-green-700 dark:border-green-400/50 dark:text-green-400">
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-500" />
          <AlertTitle className="font-semibold text-green-700 dark:text-green-400">Team Data Processed</AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-500">
            Activity fetching and daily score calculation complete. Check individual cards for details or errors.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stable Members (End Date Score)</CardTitle>
            <Users className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{teamStats.stable}</div>
            <p className="text-xs text-muted-foreground">Low fragmentation on selected end date</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk Members (End Date Score)</CardTitle>
            <Users className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{teamStats.atRisk}</div>
            <p className="text-xs text-muted-foreground">Moderate fragmentation on selected end date</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overloaded Members (End Date Score)</CardTitle>
            <Users className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{teamStats.overloaded}</div>
            <p className="text-xs text-muted-foreground">High fragmentation on selected end date</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">Team Member Status</CardTitle>
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <CardDescription>
            {isHR
              ? `Focus status for each member based on the selected End Date (${dateRange?.to ? format(dateRange.to, "LLL dd, y") : 'N/A'}). Historical trend shows prior daily scores within range.`
              : "Overview of team member stability (details restricted)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isHR && !isLoadingUsers && !userFetchError && teamData.length === 0 && !isProcessingMembers && (
             <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Team Data Available</AlertTitle>
              <AlertDescription>
                No users were fetched from Microsoft Graph, or processing could not start.
              </AlertDescription>
            </Alert>
          )}
          {teamData.map((member) => (
            <TeamMemberCard
              key={member.id}
              member={member}
              showDetailedScore={isHR}
              onRetry={() => handleRetryMemberProcessing(member.id)}
              onViewDetails={() => handleFetchActivitiesForDialog(member)}
              currentScoreDate={dateRange?.to} 
            />
          ))}
          {!isHR && teamData.length === 0 && ( 
            <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Team Data Available</AlertTitle>
              <AlertDescription>Team overview data is not available for your role or could not be loaded.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      {selectedUserForDetails && (
        <UserActivityDetailsDialog
          isOpen={!!selectedUserForDetails}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseUserDetailsDialog();
            }
          }}
          member={selectedUserForDetails}
          activities={detailedActivities}
          isLoading={isLoadingDetailedActivities}
          error={detailedActivitiesError}
          activityDate={dateRange?.to}
        />
      )}
    </div>
  );
}

    