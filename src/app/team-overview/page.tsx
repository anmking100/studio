
"use client";

import { useEffect, useState, useCallback } from "react";
import { TeamMemberCard } from "@/components/team-overview/team-member-card";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, BarChart3, ShieldAlert, Loader2, AlertTriangle, ShieldCheck, CalendarIcon } from "lucide-react";
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

// Helper to fetch activities for a specific interval and calculate score
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
      } else {
        const errorData = await jiraResponse.json();
        activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Jira (${format(intervalStart, 'HH:mm')}-${format(intervalEnd, 'HH:mm')}): ${errorData.error || jiraResponse.statusText}`;
      }
    } catch (e: any) {
      activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Jira fetch error (${format(intervalStart, 'HH:mm')}): ${e.message}`;
    }
  }

  try {
    const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberId)}&startDate=${encodeURIComponent(intervalStartISO)}&endDate=${encodeURIComponent(intervalEndISO)}`);
    if (teamsResponse.ok) {
      const teamsActivities: GenericActivityItem[] = await teamsResponse.json();
      intervalActivities.push(...teamsActivities);
    } else {
      const errorData = await teamsResponse.json();
      activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Teams (${format(intervalStart, 'HH:mm')}-${format(intervalEnd, 'HH:mm')}): ${errorData.error || teamsResponse.statusText}`;
    }
  } catch (e: any) {
    activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + `Teams fetch error (${format(intervalStart, 'HH:mm')}): ${e.message}`;
  }

  if (activityFetchError) {
    console.warn(`TEAM OVERVIEW (Interval): Activity fetch errors for ${memberId} for interval ${intervalStartISO} to ${intervalEndISO}: ${activityFetchError}`);
  }

  try {
    const input: CalculateFragmentationScoreInputType = {
      userId: memberId,
      activityWindowDays,
      activities: intervalActivities,
    };
    const result = calculateScoreAlgorithmically(input);
    // Do not log full summary here as it's too verbose for interval
    console.log(`TEAM OVERVIEW (Interval): Score for ${memberId} for ${intervalStartISO}-${intervalEndISO}: ${result.fragmentationScore}. Activities: ${result.activitiesCount}.`);
    return activityFetchError ? { ...result, summary: `Note: Some activity data for this interval might be missing. ${activityFetchError}. ${result.summary}` } : result;
  } catch (scoreErr: any) {
    const scoreErrorMessage = `Algorithmic score calc error for interval ${format(intervalStart, 'HH:mm')}-${format(intervalEnd, 'HH:mm')}: ${scoreErr.message}`;
    console.error(scoreErrorMessage, scoreErr);
    return { error: activityFetchError ? `${activityFetchError}; ${scoreErrorMessage}` : scoreErrorMessage , intervalDetails: {start: intervalStartISO, end: intervalEndISO}};
  }
}, []);


// Orchestrates calculating the average score for a full day (current or historical)
const calculateAverageDailyScore = useCallback(async (
  memberId: string,
  memberEmail: string | undefined,
  dayToProcess: Date,
  isCurrentSelectedDay: boolean, // True if dayToProcess is the endDate of the user's selected range
  currentSystemTime: Date // The actual current time, used if isCurrentSelectedDay and dayToProcess is today
): Promise<CalculateFragmentationScoreOutput | { error: string }> => {
  console.log(`TEAM OVERVIEW (DailyAvg): Calculating average score for ${memberId} on ${format(dayToProcess, 'yyyy-MM-dd')}. Is current selected day: ${isCurrentSelectedDay}`);
  const intervalScores: number[] = [];
  let totalActivitiesForDay = 0;
  let errorsForDay: string[] = [];
  let lastIntervalSummary = "No intervals processed.";

  const dayStart = startOfDay(dayToProcess);

  for (let hourOffset = 0; hourOffset < 24; hourOffset += INTERVAL_HOURS) {
    let intervalStart = addHours(dayStart, hourOffset);
    let intervalEnd = addHours(intervalStart, INTERVAL_HOURS);

    if (isCurrentSelectedDay && isEqual(startOfDay(dayToProcess), startOfDay(currentSystemTime))) {
      // If processing today (as the selected end date), and this interval starts after current time, stop.
      if (isBefore(currentSystemTime, intervalStart)) {
        console.log(`TEAM OVERVIEW (DailyAvg): Interval ${format(intervalStart, 'HH:mm')} starts after current time ${format(currentSystemTime, 'HH:mm')}. Stopping for ${memberId} on ${format(dayToProcess, 'yyyy-MM-dd')}.`);
        break;
      }
      // If interval extends beyond current time, cap it at current time.
      if (isBefore(currentSystemTime, intervalEnd)) {
        intervalEnd = currentSystemTime;
        console.log(`TEAM OVERVIEW (DailyAvg): Capping interval end to current time ${format(intervalEnd, 'HH:mm')} for ${memberId} on ${format(dayToProcess, 'yyyy-MM-dd')}.`);
      }
    }
    
    // Ensure intervalEnd does not exceed the very end of dayToProcess if it's not today.
    // Or if it is today, ensure it doesn't exceed currentSystemTime when isCurrentSelectedDay is true.
    if (isBefore(endOfDay(dayToProcess), intervalEnd) && !(isCurrentSelectedDay && isEqual(startOfDay(dayToProcess), startOfDay(currentSystemTime)))) {
        intervalEnd = endOfDay(dayToProcess);
    }


    // If interval start is same or after interval end (can happen if current time is at very start of an interval for today)
    if (!isBefore(intervalStart, intervalEnd)) {
        console.log(`TEAM OVERVIEW (DailyAvg): Interval start ${format(intervalStart, 'HH:mm')} is not before end ${format(intervalEnd, 'HH:mm')}. Skipping for ${memberId} on ${format(dayToProcess, 'yyyy-MM-dd')}.`);
        if (isCurrentSelectedDay && isEqual(startOfDay(dayToProcess), startOfDay(currentSystemTime))) break; // Stop if it's today and we've caught up to current time.
        continue;
    }


    const intervalResult = await fetchAndScoreIntervalData(memberId, memberEmail, intervalStart, intervalEnd);

    if ('error' in intervalResult) {
      errorsForDay.push(`Interval ${format(intervalStart, 'HH:mm')}-${format(intervalEnd, 'HH:mm')}: ${intervalResult.error}`);
    } else {
      intervalScores.push(intervalResult.fragmentationScore);
      totalActivitiesForDay += intervalResult.activitiesCount;
      lastIntervalSummary = intervalResult.summary; // Keep the last successful summary
    }
  }

  if (errorsForDay.length > 0) {
    console.warn(`TEAM OVERVIEW (DailyAvg): Errors for ${memberId} on ${format(dayToProcess, 'yyyy-MM-dd')}: ${errorsForDay.join('; ')}`);
  }

  if (intervalScores.length === 0) {
    // If no intervals were successfully processed (e.g., all had errors, or it's too early in the day)
    // Return a default low score or an error state
    const baseSummary = `No scorable activity intervals found for ${format(dayToProcess, 'yyyy-MM-dd')}.`;
    return {
      userId: memberId,
      fragmentationScore: 0.5, // Default for no data
      summary: errorsForDay.length > 0 ? `${baseSummary} Errors: ${errorsForDay.join('; ')}` : baseSummary,
      riskLevel: 'Low',
      activitiesCount: 0,
    };
  }

  const averageScore = parseFloat((intervalScores.reduce((a, b) => a + b, 0) / intervalScores.length).toFixed(1));
  
  let riskLevel: 'Low' | 'Moderate' | 'High';
  if (averageScore >= 3.5) riskLevel = 'High';
  else if (averageScore >= 2.0) riskLevel = 'Moderate';
  else riskLevel = 'Low';

  let dailySummary = `Daily average score of ${averageScore} (${riskLevel}) for ${format(dayToProcess, 'yyyy-MM-dd')} based on ${intervalScores.length} 2-hour interval(s). Total activities: ${totalActivitiesForDay}.`;
  if (errorsForDay.length > 0) {
    dailySummary += ` Some intervals had errors: ${errorsForDay.slice(0,1).join('; ')}...`; // Show first error
  }


  return {
    userId: memberId,
    fragmentationScore: averageScore,
    summary: dailySummary,
    riskLevel: riskLevel,
    activitiesCount: totalActivitiesForDay,
  };

}, [fetchAndScoreIntervalData]);


export default function TeamOverviewPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'hr';
  const [teamData, setTeamData] = useState<TeamMemberFocus[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(isHR);
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  const [isProcessingMembers, setIsProcessingMembers] = useState(false);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 6)), // Ensure 'from' is start of day
      to: today, // 'to' can be current time if today, or end of day if historical
    };
  });

  const processSingleMember = useCallback(async (
    memberInput: Omit<TeamMemberFocus, 'isLoadingScore' | 'scoreError' | 'currentDayScoreData' | 'historicalScores' | 'averageHistoricalScore' | 'activityError' | 'isLoadingActivities'>,
    effectiveStartDate: Date, // This is dateRange.from
    effectiveEndDate: Date,   // This is dateRange.to
    currentSystemTime: Date   // The actual current time when processing starts
  ): Promise<TeamMemberFocus> => {
    console.log(`TEAM OVERVIEW (Member): Starting data processing for member: ${memberInput.name} (ID: ${memberInput.id}) for range ${format(effectiveStartDate, 'yyyy-MM-dd')} to ${format(effectiveEndDate, 'yyyy-MM-dd HH:mm')}`);
    let overallMemberError: string | null = null;
    const historicalScoresData: HistoricalScore[] = [];
    let currentDayCalculatedScoreData: CalculateFragmentationScoreOutput | null = null;

    // Calculate score for the selected effectiveEndDate
    const mainDayResult = await calculateAverageDailyScore(memberInput.id, memberInput.email, effectiveEndDate, true, currentSystemTime);
    if ('error' in mainDayResult) {
      overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Score for ${format(effectiveEndDate, 'yyyy-MM-dd')}: ${mainDayResult.error}`;
    } else {
      currentDayCalculatedScoreData = mainDayResult;
    }

    // Calculate historical scores
    for (let i = 0; i < NUMBER_OF_HISTORICAL_DAYS_FOR_TREND; i++) {
      const historicalDateToProcess = startOfDay(subDays(effectiveEndDate, i + 1));

      if (isBefore(historicalDateToProcess, startOfDay(effectiveStartDate))) {
        console.log(`TEAM OVERVIEW (Member): Historical date ${format(historicalDateToProcess, 'yyyy-MM-dd')} is before start date ${format(startOfDay(effectiveStartDate), 'yyyy-MM-dd')}. Skipping further historical for ${memberInput.name}.`);
        break;
      }

      console.log(`TEAM OVERVIEW (Member): Calculating historical daily average for ${memberInput.name} on ${format(historicalDateToProcess, 'yyyy-MM-dd')}`);
      const historicalDayAvgResult = await calculateAverageDailyScore(memberInput.id, memberInput.email, historicalDateToProcess, false, currentSystemTime);

      if ('error' in historicalDayAvgResult) {
        const errorMsg = `Historical for ${format(historicalDateToProcess, 'yyyy-MM-dd')}: ${historicalDayAvgResult.error}`;
        overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + errorMsg;
        console.warn(`TEAM OVERVIEW (Member): Error for ${memberInput.name} on ${format(historicalDateToProcess, 'yyyy-MM-dd')}: ${errorMsg}`);
      } else {
        historicalScoresData.push({
          date: format(historicalDateToProcess, 'yyyy-MM-dd'),
          score: historicalDayAvgResult.fragmentationScore,
          riskLevel: historicalDayAvgResult.riskLevel,
          summary: historicalDayAvgResult.summary,
          activitiesCount: historicalDayAvgResult.activitiesCount,
          intervalScoresCount: Math.ceil(24 / INTERVAL_HOURS) // Assuming full day processed for historical
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
      activityError: overallMemberError,
    };
  }, [calculateAverageDailyScore]);


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
      
      // Determine effective end date for processing
      let effectiveRangeEnd = dateRange.to;
      if (!isEqual(startOfDay(dateRange.to), startOfDay(new Date()))) {
          effectiveRangeEnd = endOfDay(dateRange.to);
      } else {
          effectiveRangeEnd = new Date(); // Use current time if end date of range is today
      }

      const updatedMember = await processSingleMember(baseMemberInfo, startOfDay(dateRange.from), effectiveRangeEnd, new Date());

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
        
        const currentSystemTime = new Date(); // Capture current time once for consistency in this run
        const effectiveRangeFrom = startOfDay(dateRange.from);
        let effectiveRangeTo = dateRange.to; // This is the date object for the selected end day

        // Adjust effectiveRangeTo to be end of day if it's not today, or current time if it is today
        if (!isEqual(startOfDay(effectiveRangeTo), startOfDay(currentSystemTime))) {
            effectiveRangeTo = endOfDay(effectiveRangeTo);
        } else {
            effectiveRangeTo = currentSystemTime;
        }
        console.log(`TEAM OVERVIEW: Effective processing range for ALL members: ${format(effectiveRangeFrom, 'yyyy-MM-dd')} to ${format(effectiveRangeTo, 'yyyy-MM-dd HH:mm')}`);

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

        for (const member of initialTeamDataSetup) {
          const { currentDayScoreData: _a, historicalScores: _b, averageHistoricalScore: _c, isLoadingScore: _d, isLoadingActivities: _e, scoreError: _f, activityError: _g, ...baseInfo } = member;
          const updatedMember = await processSingleMember(baseInfo, effectiveRangeFrom, effectiveRangeTo, currentSystemTime);
          setTeamData(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
        }
        setIsProcessingMembers(false);
        console.log("TEAM OVERVIEW: All members processed (new interval logic).");
      };
      fetchGraphUsersAndProcessAll();
    }
  }, [isHR, processSingleMember, dateRange]);

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
    const newFrom = startOfDay(day); // Ensure 'from' is always start of day
    setDateRange(prev => {
        const currentTo = prev?.to || new Date();
        // If newFrom is after currentTo, set currentTo to endOfDay(newFrom)
        // Otherwise, keep currentTo, but ensure it's not before newFrom
        const newTo = isBefore(currentTo, newFrom) ? endOfDay(newFrom) : currentTo;
        return { from: newFrom, to: newTo };
    });
  };

  const handleEndDateSelect = (day: Date | undefined) => {
    if (!day) return;
    // For 'to' date, if it's today, keep it as current time. If it's a past day, set to end of that day.
    const newTo = isEqual(startOfDay(day), startOfDay(new Date())) ? new Date() : endOfDay(day);
    setDateRange(prev => {
        const currentFrom = prev?.from || startOfDay(subDays(newTo, 6));
        // If currentFrom is after newTo, set currentFrom to startOfDay(newTo)
        // Otherwise, keep currentFrom.
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
                Scores are daily averages from 2-hour intervals. Historical trends shown for selected range.
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
            <CardDescription>View team focus data. Scores are daily averages of 2-hour intervals.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("w-full sm:w-[280px] justify-start text-left font-normal", !dateRange?.from && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
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
                  className={cn("w-full sm:w-[280px] justify-start text-left font-normal", !dateRange?.to && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.to ? format(dateRange.to, "LLL dd, y") : <span>Pick an end date</span>}
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
          </CardContent>
          <CardHeader>
            <CardDescription className="text-xs text-muted-foreground">
              Selected End Date score is an average of 2hr intervals up to current time (if today) or full day (if past). Historical trend shows daily averages for up to {NUMBER_OF_HISTORICAL_DAYS_FOR_TREND} prior days within the selected Start Date.
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
              ? `Focus status for each member based on the selected End Date (${dateRange?.to ? format(dateRange.to, "LLL dd, y") : 'N/A'}). Scores are daily averages of 2hr intervals. Historical trend shows prior daily averages within range.`
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
              currentScoreDate={dateRange?.to} // Pass the end date of the selected range
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
