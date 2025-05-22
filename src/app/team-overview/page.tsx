
"use client";

import { useEffect, useState, useCallback } from "react";
import { TeamMemberCard } from "@/components/team-overview/team-member-card";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, BarChart3, ShieldAlert, Loader2, AlertTriangle, ShieldCheck, CalendarDays, RefreshCw } from "lucide-react";
import Image from "next/image";
import { calculateScoreAlgorithmically } from "@/lib/score-calculator";
import type { TeamMemberFocus, GenericActivityItem, MicrosoftGraphUser, HistoricalScore, CalculateFragmentationScoreInputType, CalculateFragmentationScoreOutput } from "@/lib/types";
import { format, subDays, startOfDay, endOfDay, parseISO, isBefore, isEqual, addHours, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const NUMBER_OF_HISTORICAL_DAYS_FOR_TREND = 5;
const INTERVAL_HOURS = 2;
const RISK_THRESHOLDS_PAGE = { // Re-defined here for use in daily average risk assessment
  MODERATE: 2.0,
  HIGH: 3.5,
};


export default function TeamOverviewPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'hr';
  const [teamData, setTeamData] = useState<TeamMemberFocus[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(isHR);
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  const [isProcessingMembers, setIsProcessingMembers] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 6)), 
      to: today, 
    };
  });

  const fetchAndScoreIntervalData = useCallback(async (
    memberId: string,
    memberEmail: string | undefined,
    intervalStart: Date,
    intervalEnd: Date
  ): Promise<CalculateFragmentationScoreOutput | { error: string; intervalDetails?: {start: string, end: string} } > => {
    let intervalActivities: GenericActivityItem[] = [];
    let activityFetchError: string | null = null;
    const activityWindowDays = 1; // Score calculation is for this interval

    const intervalStartISO = intervalStart.toISOString();
    const intervalEndISO = intervalEnd.toISOString();

    console.log(`TEAM OVERVIEW (Interval): Fetching activities for member ${memberId} (${memberEmail || 'No Email'}) for interval: ${intervalStartISO} to ${intervalEndISO}`);

    if (memberEmail) {
      try {
        const jiraResponse = await fetch(`/api/jira/issues?userEmail=${encodeURIComponent(memberEmail)}&startDate=${encodeURIComponent(intervalStartISO)}&endDate=${encodeURIComponent(intervalEndISO)}`);
        if (jiraResponse.ok) {
          const jiraActivities: GenericActivityItem[] = await jiraResponse.json();
          intervalActivities.push(...jiraActivities);
          console.log(`TEAM OVERVIEW (Interval): Fetched ${jiraActivities.length} Jira activities for ${memberId} for ${intervalStartISO}-${intervalEndISO}`);
        } else {
          const errorData = await jiraResponse.json();
          const jiraErrorMsg = `Jira (${format(intervalStart, 'HH:mm')}-${format(intervalEnd, 'HH:mm')}): ${errorData.error || jiraResponse.statusText}`;
          activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + jiraErrorMsg;
          console.warn(`TEAM OVERVIEW (Interval): Jira fetch error for ${memberId}: ${jiraErrorMsg}`);
        }
      } catch (e: any) {
        const jiraCatchError = `Jira fetch exception (${format(intervalStart, 'HH:mm')}): ${e.message}`;
        activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + jiraCatchError;
         console.warn(`TEAM OVERVIEW (Interval): Jira fetch exception for ${memberId}: ${jiraCatchError}`);
      }
    }

    try {
      const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberId)}&startDate=${encodeURIComponent(intervalStartISO)}&endDate=${encodeURIComponent(intervalEndISO)}`);
      if (teamsResponse.ok) {
        const teamsActivities: GenericActivityItem[] = await teamsResponse.json();
        intervalActivities.push(...teamsActivities);
         console.log(`TEAM OVERVIEW (Interval): Fetched ${teamsActivities.length} Teams activities for ${memberId} for ${intervalStartISO}-${intervalEndISO}`);
      } else {
        const errorData = await teamsResponse.json();
        const teamsErrorMsg = `Teams (${format(intervalStart, 'HH:mm')}-${format(intervalEnd, 'HH:mm')}): ${errorData.error || teamsResponse.statusText}`;
        activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + teamsErrorMsg;
        console.warn(`TEAM OVERVIEW (Interval): Teams fetch error for ${memberId}: ${teamsErrorMsg}`);
      }
    } catch (e: any) {
      const teamsCatchError = `Teams fetch exception (${format(intervalStart, 'HH:mm')}): ${e.message}`;
      activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + teamsCatchError;
      console.warn(`TEAM OVERVIEW (Interval): Teams fetch exception for ${memberId}: ${teamsCatchError}`);
    }

    if (activityFetchError) {
      console.warn(`TEAM OVERVIEW (Interval): Combined activity fetch errors for ${memberId} for interval ${intervalStartISO} to ${intervalEndISO}: ${activityFetchError}`);
    }
     console.log(`TEAM OVERVIEW (Interval): Total ${intervalActivities.length} activities collected for ${memberId} for interval ${intervalStartISO} to ${intervalEndISO} before scoring.`);

    try {
      const input: CalculateFragmentationScoreInputType = {
        userId: memberId,
        activityWindowDays,
        activities: intervalActivities,
      };
      const result = calculateScoreAlgorithmically(input);
      console.log(`TEAM OVERVIEW (Interval): Algorithmic score for ${memberId} for ${intervalStartISO}-${intervalEndISO}: ${result.fragmentationScore}. Activities: ${result.activitiesCount}. Summary: ${result.summary.substring(0,50)}...`);
      return activityFetchError ? { ...result, summary: `Note: Some activity data for this interval might be missing. ${activityFetchError}. ${result.summary}` } : result;
    } catch (scoreErr: any) {
      const scoreErrorMessage = `Algorithmic score calc error for interval ${format(intervalStart, 'HH:mm')}-${format(intervalEnd, 'HH:mm')}: ${scoreErr.message}`;
      console.error(`TEAM OVERVIEW (Interval): ${scoreErrorMessage}`, scoreErr);
      return { error: activityFetchError ? `${activityFetchError}; ${scoreErrorMessage}` : scoreErrorMessage , intervalDetails: {start: intervalStartISO, end: intervalEndISO}};
    }
  }, []); 


  const calculateAverageDailyScore = useCallback(async (
    memberId: string,
    memberEmail: string | undefined,
    dayToProcess: Date,
    isCurrentSelectedDay: boolean, 
    currentSystemTimeWhenProcessingStarted: Date 
  ): Promise<CalculateFragmentationScoreOutput | { error: string }> => {
    console.log(`TEAM OVERVIEW (DailyAvg): Calculating average score for ${memberId} on ${format(dayToProcess, 'yyyy-MM-dd')}. Is current selected day: ${isCurrentSelectedDay}. Processing start time: ${format(currentSystemTimeWhenProcessingStarted, 'HH:mm:ss')}`);
    
    const processedIntervalData: CalculateFragmentationScoreOutput[] = [];
    let totalActivitiesForDay = 0;
    let errorsForDay: string[] = [];

    const dayStart = startOfDay(dayToProcess);

    for (let hourOffset = 0; hourOffset < 24; hourOffset += INTERVAL_HOURS) {
      let intervalStart = addHours(dayStart, hourOffset);
      let intervalEnd = addHours(intervalStart, INTERVAL_HOURS);

      if (isCurrentSelectedDay && isEqual(startOfDay(dayToProcess), startOfDay(currentSystemTimeWhenProcessingStarted))) {
        if (isBefore(currentSystemTimeWhenProcessingStarted, intervalStart)) {
          console.log(`TEAM OVERVIEW (DailyAvg): Interval ${format(intervalStart, 'HH:mm')} starts after current processing time ${format(currentSystemTimeWhenProcessingStarted, 'HH:mm')}. Stopping for ${memberId} on ${format(dayToProcess, 'yyyy-MM-dd')}.`);
          break;
        }
        if (isBefore(currentSystemTimeWhenProcessingStarted, intervalEnd)) {
          intervalEnd = currentSystemTimeWhenProcessingStarted;
          console.log(`TEAM OVERVIEW (DailyAvg): Capping interval end to current processing time ${format(intervalEnd, 'HH:mm')} for ${memberId} on ${format(dayToProcess, 'yyyy-MM-dd')}.`);
        }
      } else if (!isCurrentSelectedDay && isBefore(endOfDay(dayToProcess), intervalEnd)) {
         // For past full days, ensure intervalEnd doesn't exceed the day itself
         intervalEnd = endOfDay(dayToProcess);
      }
      
      if (!isBefore(intervalStart, intervalEnd)) {
          console.log(`TEAM OVERVIEW (DailyAvg): Interval start ${format(intervalStart, 'HH:mm')} is not before end ${format(intervalEnd, 'HH:mm')}. Skipping for ${memberId} on ${format(dayToProcess, 'yyyy-MM-dd')}.`);
          if (isCurrentSelectedDay && isEqual(startOfDay(dayToProcess), startOfDay(currentSystemTimeWhenProcessingStarted)) && !isBefore(intervalStart, currentSystemTimeWhenProcessingStarted)) break; 
          continue;
      }

      const intervalResult = await fetchAndScoreIntervalData(memberId, memberEmail, intervalStart, intervalEnd);

      if ('error' in intervalResult) {
        errorsForDay.push(`Interval ${format(intervalStart, 'HH:mm')}-${format(intervalEnd, 'HH:mm')}: ${intervalResult.error}`);
      } else {
        processedIntervalData.push(intervalResult);
        totalActivitiesForDay += intervalResult.activitiesCount;
      }
    }

    if (errorsForDay.length > 0) {
      console.warn(`TEAM OVERVIEW (DailyAvg): Errors during interval processing for ${memberId} on ${format(dayToProcess, 'yyyy-MM-dd')}: ${errorsForDay.join('; ')}`);
    }

    const activeIntervals = processedIntervalData.filter(r => r.activitiesCount > 0);

    if (activeIntervals.length === 0) {
      // All processed intervals had zero activities, or there were errors in all intervals that might have had activity.
      const baseSummary = `No periods of activity detected for ${format(dayToProcess, 'yyyy-MM-dd')}. All processed 2-hour intervals had zero tracked activities.`;
      return {
        userId: memberId,
        fragmentationScore: 0.5, 
        summary: errorsForDay.length > 0 ? `${baseSummary} Additional errors during processing: ${errorsForDay.slice(0,1).join('; ')}...` : baseSummary,
        riskLevel: 'Low',
        activitiesCount: totalActivitiesForDay, // This will be 0 if no activities in any successful interval
      };
    }

    // Calculate average score based ONLY on active intervals
    const averageScoreValue = parseFloat(
        (activeIntervals.reduce((acc, curr) => acc + curr.fragmentationScore, 0) / activeIntervals.length).toFixed(1)
    );
    
    let riskLevelValue: 'Low' | 'Moderate' | 'High';
    if (averageScoreValue >= RISK_THRESHOLDS_PAGE.HIGH) riskLevelValue = 'High';
    else if (averageScoreValue >= RISK_THRESHOLDS_PAGE.MODERATE) riskLevelValue = 'Moderate';
    else riskLevelValue = 'Low';

    let dailySummary = `Daily average score (from ${activeIntervals.length} active 2-hr intervals) of ${averageScoreValue} (${riskLevelValue}) for ${format(dayToProcess, 'yyyy-MM-dd')}. Total activities for day: ${totalActivitiesForDay}.`;
    if (activeIntervals.length < processedIntervalData.length) {
        dailySummary += ` ${processedIntervalData.length - activeIntervals.length} interval(s) had no activity.`;
    }
    if (errorsForDay.length > 0) {
      dailySummary += ` Some intervals had errors: ${errorsForDay.slice(0,1).join('; ')}...`; 
    }

    return {
      userId: memberId,
      fragmentationScore: averageScoreValue,
      summary: dailySummary,
      riskLevel: riskLevelValue,
      activitiesCount: totalActivitiesForDay,
    };

  }, [fetchAndScoreIntervalData]); 


  const processSingleMember = useCallback(async (
    memberInput: Omit<TeamMemberFocus, 'isLoadingScore' | 'scoreError' | 'currentDayScoreData' | 'historicalScores' | 'averageHistoricalScore' | 'activityError' | 'isLoadingActivities'>,
    effectiveStartDate: Date, 
    effectiveEndDate: Date,  
    currentSystemTimeWhenProcessingStarted: Date 
  ): Promise<TeamMemberFocus> => {
    console.log(`TEAM OVERVIEW (Member): Starting data processing for member: ${memberInput.name} (ID: ${memberInput.id}) for range ${format(effectiveStartDate, 'yyyy-MM-dd')} to ${format(effectiveEndDate, 'yyyy-MM-dd HH:mm:ss')}`);
    let overallMemberError: string | null = null;
    const historicalScoresData: HistoricalScore[] = [];
    let currentDayCalculatedScoreData: CalculateFragmentationScoreOutput | null = null;

    const mainDayResult = await calculateAverageDailyScore(memberInput.id, memberInput.email, effectiveEndDate, true, currentSystemTimeWhenProcessingStarted);
    if ('error' in mainDayResult) {
      overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Score for ${format(effectiveEndDate, 'yyyy-MM-dd')}: ${mainDayResult.error}`;
    } else {
      currentDayCalculatedScoreData = mainDayResult;
    }

    for (let i = 0; i < NUMBER_OF_HISTORICAL_DAYS_FOR_TREND; i++) {
      const historicalDateToProcess = startOfDay(subDays(effectiveEndDate, i + 1));

      if (isBefore(historicalDateToProcess, startOfDay(effectiveStartDate))) {
        console.log(`TEAM OVERVIEW (Member): Historical date ${format(historicalDateToProcess, 'yyyy-MM-dd')} is before start date ${format(startOfDay(effectiveStartDate), 'yyyy-MM-dd')}. Skipping further historical for ${memberInput.name}.`);
        break;
      }

      console.log(`TEAM OVERVIEW (Member): Calculating historical daily average for ${memberInput.name} on ${format(historicalDateToProcess, 'yyyy-MM-dd')}`);
      const historicalDayAvgResult = await calculateAverageDailyScore(memberInput.id, memberInput.email, historicalDateToProcess, false, currentSystemTimeWhenProcessingStarted);

      if ('error' in historicalDayAvgResult) {
        const errorMsg = `Historical for ${format(historicalDateToProcess, 'yyyy-MM-dd')}: ${historicalDayAvgResult.error}`;
        overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + errorMsg;
        console.warn(`TEAM OVERVIEW (Member): Error for ${memberInput.name} on ${format(historicalDateToProcess, 'yyyy-MM-dd')}: ${errorMsg}`);
      } else {
        console.log(`TEAM OVERVIEW (Member): Historical score for ${memberInput.name} on ${format(historicalDateToProcess, 'yyyy-MM-dd')}: Score=${historicalDayAvgResult.fragmentationScore}, Activities=${historicalDayAvgResult.activitiesCount}. Summary: ${historicalDayAvgResult.summary.substring(0,70)}...`);
        historicalScoresData.push({
          date: format(startOfDay(historicalDateToProcess), 'yyyy-MM-dd'),
          score: historicalDayAvgResult.fragmentationScore,
          riskLevel: historicalDayAvgResult.riskLevel,
          summary: historicalDayAvgResult.summary,
          activitiesCount: historicalDayAvgResult.activitiesCount,
          intervalScoresCount: Math.ceil(24 / INTERVAL_HOURS) 
        });
      }
    }
    historicalScoresData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let avgHistScore: number | null = null;
    if (historicalScoresData.length > 0) {
      const sum = historicalScoresData.reduce((acc, curr) => acc + curr.score, 0);
      avgHistScore = parseFloat((sum / historicalScoresData.length).toFixed(1));
    }

    console.log(`TEAM OVERVIEW (Member): Finished processing for member: ${memberInput.name}. Current Avg Score (${format(effectiveEndDate, 'yyyy-MM-dd')}): ${currentDayCalculatedScoreData?.fragmentationScore ?? 'N/A'}. Historical Count: ${historicalScoresData.length}. Avg Hist Score: ${avgHistScore ?? 'N/A'}. Error: ${overallMemberError ?? 'None'}`);
    
    return {
      ...memberInput,
      currentDayScoreData: currentDayCalculatedScoreData,
      historicalScores: historicalScoresData,
      averageHistoricalScore: avgHistScore,
      isLoadingScore: false,
      isLoadingActivities: false,
      scoreError: overallMemberError,
      activityError: overallMemberError, // Using same error field for now
    };
  }, [calculateAverageDailyScore, fetchAndScoreIntervalData]); // Added fetchAndScoreIntervalData dependency


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
        setTeamData([]);
        setIsProcessingMembers(true);
        
        const currentSystemTimeForFetch = new Date(); 
        const effectiveRangeFrom = startOfDay(dateRange.from);
        let effectiveRangeToForFetch: Date; 

        if (isEqual(startOfDay(dateRange.to), startOfDay(currentSystemTimeForFetch))) {
            effectiveRangeToForFetch = currentSystemTimeForFetch;
        } else {
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
          setUserFetchError(msUsers.length > 0 ? "No users with valid IDs found from MS Graph." : "No users returned from MS Graph.");
          setIsLoadingUsers(false);
          setIsProcessingMembers(false);
          return;
        }

        const initialTeamDataSetup: TeamMemberFocus[] = validMsUsers.map(msUser => ({
          id: msUser.id!,
          name: msUser.displayName || msUser.userPrincipalName || "Unknown User",
          email: msUser.userPrincipalName || undefined,
          role: (msUser.userPrincipalName?.toLowerCase().includes('hr')) ? 'hr' : 'developer',
          avatarUrl: `https://placehold.co/100x100.png?text=${(msUser.displayName || msUser.userPrincipalName || "U")?.[0]?.toUpperCase()}`,
          isLoadingScore: true, isLoadingActivities: true, scoreError: null, activityError: null,
          historicalScores: [], averageHistoricalScore: null, currentDayScoreData: null,
        }));
        setTeamData(initialTeamDataSetup);
        setIsLoadingUsers(false);

        const processingPromises = initialTeamDataSetup.map(member => {
            const { currentDayScoreData: _a, historicalScores: _b, averageHistoricalScore: _c, isLoadingScore: _d, isLoadingActivities: _e, scoreError: _f, activityError: _g, ...baseInfo } = member;
            return processSingleMember(baseInfo, effectiveRangeFrom, effectiveRangeToForFetch, currentSystemTimeForFetch)
                     .then(updatedMember => {
                         setTeamData(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
                         return updatedMember; // For Promise.all
                     })
                     .catch(error => {
                        console.error(`TEAM OVERVIEW: Critical error processing member ${member.name}:`, error);
                        // Update this specific member's state to reflect the error
                        setTeamData(prev => prev.map(m => m.id === member.id ? {
                            ...member,
                            isLoadingScore: false,
                            isLoadingActivities: false,
                            scoreError: `Critical processing error: ${error.message || 'Unknown error'}`
                        } : m));
                        return null; // Or some error object
                     });
        });

        await Promise.all(processingPromises);
        
        setIsProcessingMembers(false);
        console.log("TEAM OVERVIEW: All members processed (new interval logic).");
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
        const newTo = isBefore(currentTo, newFrom) ? endOfDay(newFrom) : currentTo;
        return { from: newFrom, to: newTo };
    });
  };

  const handleEndDateSelect = (day: Date | undefined) => {
    if (!day) return;
    const newTo = isEqual(startOfDay(day), startOfDay(new Date())) ? day : endOfDay(day); // Use selected day if today, else end of day
    setDateRange(prev => {
        const currentFrom = prev?.from || startOfDay(subDays(newTo, 6)); 
        const newFrom = isAfter(currentFrom, newTo) ? startOfDay(newTo) : currentFrom;
        return { from: newFrom, to: newTo };
    });
  };

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
                Scores are daily averages from 2-hour intervals. Historical trends show prior daily averages.
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
              View team focus data. Scores are daily averages of 2-hour intervals. 
              Historical trend shows prior daily averages. Refreshing recalculates the end date's score up to the current time if the end date is today.
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
                  disabled={(date) => date > (dateRange?.to || new Date()) || date < subDays(new Date(), 90) || date > new Date()}
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
                  {dateRange?.to ? format(dateRange.to, "LLL dd, y HH:mm") : <span>Pick an end date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single" selected={dateRange?.to} onSelect={handleEndDateSelect}
                  disabled={(date) => date < (dateRange?.from || subDays(new Date(), 90)) || date > new Date()}
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
              Selected End Date score is an average of active 2hr intervals up to specified time (or current time if today & refreshed) or full day (if past). Historical trend shows daily averages for up to {NUMBER_OF_HISTORICAL_DAYS_FOR_TREND} prior days within the selected Start Date.
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
          <AlertTitle className="font-semibold text-orange-700 dark:text-orange-400">Processing Team Data (Extensive)</AlertTitle>
          <AlertDescription className="text-orange-600 dark:text-orange-500">
            Fetching activities and calculating scores for each 2-hour interval per member. This will take significant time and API calls.
            Members remaining: ({teamData.filter(m => m.isLoadingScore || m.isLoadingActivities).length}). Please be patient.
          </AlertDescription>
        </Alert>
      )}

      {isHR && !isLoadingUsers && !userFetchError && !isProcessingMembers && teamData.length > 0 && (
        <Alert variant="default" className="shadow-md border-green-500/50 text-green-700 dark:border-green-400/50 dark:text-green-400">
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-500" />
          <AlertTitle className="font-semibold text-green-700 dark:text-green-400">Team Data Processed (Interval Averages)</AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-500">
            Activity fetching and interval-based score averaging complete. Errors may exist for specific members/intervals.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stable Members (End Date Avg)</CardTitle>
            <Users className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{teamStats.stable}</div>
            <p className="text-xs text-muted-foreground">Low fragmentation on selected end date (daily avg)</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk Members (End Date Avg)</CardTitle>
            <Users className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{teamStats.atRisk}</div>
            <p className="text-xs text-muted-foreground">Moderate fragmentation on selected end date (daily avg)</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overloaded Members (End Date Avg)</CardTitle>
            <Users className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{teamStats.overloaded}</div>
            <p className="text-xs text-muted-foreground">High fragmentation on selected end date (daily avg)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">Team Member Status (Daily Averages)</CardTitle>
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <CardDescription>
            {isHR
              ? `Focus status for each member based on the selected End Date (${dateRange?.to ? format(dateRange.to, "LLL dd, y HH:mm") : 'N/A'}). Scores are daily averages of active 2hr intervals. Historical trend shows prior daily averages within range.`
              : "Overview of team member stability (details restricted)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isHR && !isLoadingUsers && !userFetchError && teamData.length === 0 && !isProcessingMembers && (
            <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Users Found or Processed</AlertTitle>
              <AlertDescription>
                No users from MS Graph, or none could be processed. Check config, API permissions, server logs, and date range.
              </AlertDescription>
            </Alert>
          )}
          {teamData.map((member) => (
            <TeamMemberCard
              key={member.id}
              member={member}
              showDetailedScore={isHR}
              onRetry={() => handleRetryMemberProcessing(member.id)}
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
    </div>
  );
}

