
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
import type { TeamMemberFocus, GenericActivityItem, MicrosoftGraphUser, HistoricalScore, CalculateFragmentationScoreInputType, CalculateFragmentationScoreOutput, JiraIssue } from "@/lib/types";
import { format, subDays, startOfDay, endOfDay, parseISO, isBefore, isEqual, isWithinInterval, addHours } from 'date-fns';
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
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
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
      to: today, 
    };
  });

  const fetchActivitiesAndCalculateDailyScore = useCallback(async (
    memberId: string,
    memberEmail: string | undefined,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<CalculateFragmentationScoreOutput | { error: string; details?: any; activitiesCount: number }> => {
    console.log(`TEAM OVERVIEW (DailyScore): Processing for member ${memberId} (${memberEmail || 'No Email'}) for period: ${dayStart.toISOString()} to ${dayEnd.toISOString()}`);
    let dailyActivities: GenericActivityItem[] = [];
    let apiFetchError: string | null = null;

    // Fetch Jira Activities
    if (memberEmail) {
      try {
        const jiraResponse = await fetch(`/api/jira/issues?userEmail=${encodeURIComponent(memberEmail)}&startDate=${encodeURIComponent(dayStart.toISOString())}&endDate=${encodeURIComponent(dayEnd.toISOString())}`, { cache: 'no-store' });
        if (jiraResponse.ok) {
          const jiraActivitiesFromApi: GenericActivityItem[] = await jiraResponse.json();
          dailyActivities.push(...jiraActivitiesFromApi);
          console.log(`TEAM OVERVIEW (DailyScore): Specifically, ${jiraActivitiesFromApi.length} JIRA activities were fetched for ${memberId} for day ${format(dayStart, "yyyy-MM-dd")}.`);
        } else {
          const errorData = await jiraResponse.json();
          const jiraErrorMsg = `Jira: ${errorData.error || jiraResponse.statusText}`;
          apiFetchError = (apiFetchError ? apiFetchError + "; " : "") + jiraErrorMsg;
          console.warn(`TEAM OVERVIEW (DailyScore): Jira fetch error for ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}: ${jiraErrorMsg}`);
        }
      } catch (e: any) {
        const jiraCatchError = `Jira fetch exception: ${e.message}`;
        apiFetchError = (apiFetchError ? apiFetchError + "; " : "") + jiraCatchError;
        console.warn(`TEAM OVERVIEW (DailyScore): Jira fetch exception for ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}: ${jiraCatchError}`);
      }
    }

    // Fetch Teams Activities
    try {
      const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberId)}&startDate=${encodeURIComponent(dayStart.toISOString())}&endDate=${encodeURIComponent(dayEnd.toISOString())}`, { cache: 'no-store' });
      if (teamsResponse.ok) {
        const teamsActivitiesFromApi: GenericActivityItem[] = await teamsResponse.json();
        dailyActivities.push(...teamsActivitiesFromApi);
        console.log(`TEAM OVERVIEW (DailyScore): Fetched ${teamsActivitiesFromApi.length} Teams activities for ${memberId} for day ${format(dayStart, 'yyyy-MM-dd')}`);
      } else {
        const errorData = await teamsResponse.json();
        const teamsErrorMsg = `Teams: ${errorData.error || teamsResponse.statusText}`;
        apiFetchError = (apiFetchError ? apiFetchError + "; " : "") + teamsErrorMsg;
        console.warn(`TEAM OVERVIEW (DailyScore): Teams fetch error for ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}: ${teamsErrorMsg}`);
      }
    } catch (e: any) {
      const teamsCatchError = `Teams fetch exception: ${e.message}`;
      apiFetchError = (apiFetchError ? apiFetchError + "; " : "") + teamsCatchError;
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
      
      let summaryWithFetchNotes = result.summary;
      if (apiFetchError && result.summary) {
        summaryWithFetchNotes = `Note: Some activity data for this day might be missing/incomplete. Errors: ${apiFetchError}. Original Summary: ${result.summary}`;
      } else if (apiFetchError) {
         summaryWithFetchNotes = `Note: Some activity data for this day might be missing/incomplete. Errors: ${apiFetchError}.`;
      }
      return { ...result, summary: summaryWithFetchNotes, activityError: apiFetchError };
    } catch (scoreErr: any) {
      const scoreErrorMessage = `Algorithmic score calc error for day ${format(dayStart, 'yyyy-MM-dd')}: ${scoreErr.message}`;
      console.error(`TEAM OVERVIEW (DailyScore): ${scoreErrorMessage}`, scoreErr);
      const baseErrorReturn = { 
        error: apiFetchError ? `${apiFetchError}; ${scoreErrorMessage}` : scoreErrorMessage, 
        details: {day: format(dayStart, 'yyyy-MM-dd')}, 
        activitiesCount: dailyActivities.length 
      };
      return baseErrorReturn;
    }
  }, [/* calculateScoreAlgorithmically is stable from import */]);


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
    let currentDayActivityError: string | null = null;

    const mainDayStart = startOfDay(effectiveEndDateForRange);
    const mainDayEnd = isEqual(startOfDay(effectiveEndDateForRange), startOfDay(currentSystemTimeWhenProcessingStarted))
                       ? currentSystemTimeWhenProcessingStarted
                       : endOfDay(effectiveEndDateForRange);

    console.log(`TEAM OVERVIEW (Member): Processing main day score for ${memberInput.name} for ${format(mainDayStart, 'yyyy-MM-dd')} up to ${format(mainDayEnd, 'HH:mm:ss')}`);
    const mainDayResult = await fetchActivitiesAndCalculateDailyScore(memberInput.id, memberInput.email, mainDayStart, mainDayEnd);
    
    if ('error' in mainDayResult) {
      const errorMsg = `Score for ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: ${mainDayResult.error}`;
      overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + errorMsg;
      currentDayActivityError = mainDayResult.error; // Capture specific error for the main day
      console.warn(`TEAM OVERVIEW (Member): Error for main day score for ${memberInput.name} on ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: ${mainDayResult.error}`);
    } else {
      currentDayCalculatedScoreData = mainDayResult;
      currentDayActivityError = mainDayResult.activityError || null;
      if (mainDayResult.activityError) {
          overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Activity fetch issues on ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: ${mainDayResult.activityError}`;
      }
      console.log(`TEAM OVERVIEW (Member): Main day score for ${memberInput.name} on ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: Score=${mainDayResult.fragmentationScore}, Activities=${mainDayResult.activitiesCount}. Summary: ${mainDayResult.summary}`);
    }

    for (let i = 0; i < NUMBER_OF_HISTORICAL_DAYS_FOR_TREND; i++) {
      const historicalDate = subDays(startOfDay(effectiveEndDateForRange), i + 1); 

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
          activityError: historicalDayResult.activityError || undefined,
        });
         if (historicalDayResult.activityError) {
             overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Hist. activity fetch issues on ${format(historicalDate, 'yyyy-MM-dd')}: ${historicalDayResult.activityError}`;
         }
      }
    }
    historicalScoresData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); 

    let avgHistScore: number | null = null;
    // Only average scores where there wasn't a critical calculation error (an error in 'historicalDayResult' means score might be a fallback)
    // And only if the score is not the "no activity" baseline OR if it is the baseline but there were actually activities (edge case for score 0.5).
    const validHistoricalScoresForAverage = historicalScoresData.filter(hs => 
        hs.score > 0.5 || (hs.score === 0.5 && hs.activitiesCount > 0) 
    );
    
    if (validHistoricalScoresForAverage.length > 0) {
      const sum = validHistoricalScoresForAverage.reduce((acc, curr) => acc + curr.score, 0);
      avgHistScore = parseFloat((sum / validHistoricalScoresForAverage.length).toFixed(1));
    } else if (historicalScoresData.length > 0 && historicalScoresData.every(hs => hs.score === 0.5 && hs.activitiesCount === 0)) { 
      // If all historical scores are 0.5 due to no activity, average is 0.5
      avgHistScore = 0.5;
    }


    console.log(`TEAM OVERVIEW (Member): Finished processing for member: ${memberInput.name}. Score for (${format(effectiveEndDateForRange, 'yyyy-MM-dd')}): ${currentDayCalculatedScoreData?.fragmentationScore ?? 'N/A'}. Historical Count: ${historicalScoresData.length}. Avg Hist Score: ${avgHistScore ?? 'N/A'}. Error: ${overallMemberError ?? 'None'}`);
    
    return {
      ...memberInput,
      currentDayScoreData: currentDayCalculatedScoreData,
      historicalScores: historicalScoresData,
      averageHistoricalScore: avgHistScore,
      isLoadingScore: false,
      isLoadingActivities: false,
      scoreError: overallMemberError, // This will contain all errors, including calculation and fetch errors
      activityError: currentDayActivityError, // More specific to main day's activity fetching
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
        ).sort((a, b) => a.name.localeCompare(b.name))
      );
    } else {
      console.error(`TEAM OVERVIEW: Could not find member with ID ${memberId} to retry, or date range not set.`);
    }
  }, [teamData, processSingleMember, dateRange]);

  useEffect(() => {
    if (isHR && dateRange?.from && dateRange?.to) {
      const fetchGraphUsersAndProcessAll = async () => {
        console.log("TEAM OVERVIEW: Starting fetchGraphUsersAndProcessAll due to HR, dateRange, or refreshKey change.");
        setIsLoadingUsers(true); 
        setUserFetchError(null);
        setTeamData([]); 
        setIsProcessingMembers(true);
        
        const currentSystemTimeForFetch = new Date(); 
        const effectiveRangeFrom = startOfDay(dateRange.from);
        let effectiveRangeEndForFetch: Date; 

        if (isEqual(startOfDay(dateRange.to), startOfDay(currentSystemTimeForFetch))) {
            effectiveRangeEndForFetch = currentSystemTimeForFetch; 
        } else {
            effectiveRangeEndForFetch = endOfDay(dateRange.to);
        }
        console.log(`TEAM OVERVIEW: Effective processing range for ALL members: ${format(effectiveRangeFrom, 'yyyy-MM-dd')} to ${format(effectiveRangeEndForFetch, 'yyyy-MM-dd HH:mm:ss')}`);

        let msUsers: MicrosoftGraphUser[] = [];
        try {
          console.log("TEAM OVERVIEW: Fetching MS Graph users...");
          const response = await fetch("/api/microsoft-graph/users", { cache: 'no-store' });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch MS Graph users: ${response.statusText}`);
          }
          msUsers = await response.json();
          console.log(`TEAM OVERVIEW: Fetched ${msUsers.length} MS Graph users.`);
        } catch (err: any) {
          console.error("TEAM OVERVIEW: Error fetching MS Graph users:", err);
          setUserFetchError(err.message || "An unknown error occurred while fetching users.");
          setIsLoadingUsers(false);
          setIsProcessingMembers(false);
          return;
        }
        setIsLoadingUsers(false);

        const validMsUsers = msUsers.filter(msUser => {
          if (!msUser.id) {
            console.warn(`TEAM OVERVIEW: MS Graph user data missing ID. UPN: ${msUser.userPrincipalName || 'N/A'}. Skipped.`);
            return false;
          }
          return true;
        });

        const initialTeamDataSetup: TeamMemberFocus[] = validMsUsers.map(msUser => ({
          id: msUser.id!,
          name: msUser.displayName || msUser.userPrincipalName || "Unknown User",
          email: msUser.userPrincipalName || undefined,
          role: (msUser.userPrincipalName?.toLowerCase().includes('hr')) ? 'hr' : 'developer', // Simple role determination
          avatarUrl: `https://placehold.co/100x100.png?text=${(msUser.displayName || msUser.userPrincipalName || "U")?.[0]?.toUpperCase()}`,
          isLoadingScore: true, isLoadingActivities: true, scoreError: null, activityError: null,
          historicalScores: [], averageHistoricalScore: null, currentDayScoreData: null,
        })).sort((a, b) => a.name.localeCompare(b.name));
        
        setTeamData(initialTeamDataSetup); // Set initial data with loading states

        if (initialTeamDataSetup.length === 0) {
          const errorMsg = validMsUsers.length === 0 && msUsers.length > 0 ? "No users with valid IDs found from MS Graph." : "No users returned from MS Graph.";
          setUserFetchError(errorMsg);
          console.warn(`TEAM OVERVIEW: ${errorMsg}`);
          setIsProcessingMembers(false);
          return;
        }


        console.log(`TEAM OVERVIEW: Starting to process ${initialTeamDataSetup.length} members.`);
        // Process members one by one to see updates, or use Promise.all for parallel
        for (const memberInit of initialTeamDataSetup) {
          const { currentDayScoreData: _a, historicalScores: _b, averageHistoricalScore: _c, isLoadingScore: _d, isLoadingActivities: _e, scoreError: _f, activityError: _g, ...baseInfo } = memberInit;
          try {
            const updatedMember = await processSingleMember(baseInfo, effectiveRangeFrom, effectiveRangeEndForFetch, currentSystemTimeForFetch);
            setTeamData(prev => {
              const newTeamData = prev.filter(m => m.id !== updatedMember.id);
              newTeamData.push(updatedMember);
              return newTeamData.sort((a, b) => a.name.localeCompare(b.name));
            });
          } catch (error) {
            console.error(`TEAM OVERVIEW: CRITICAL failure processing member ${baseInfo.name} (ID: ${baseInfo.id}) in main loop.`, error);
            // Update this member to show a critical error on their card
            setTeamData(prev => {
              const existingMember = prev.find(m => m.id === baseInfo.id);
              const erroredMemberData: TeamMemberFocus = {
                ...(existingMember || baseInfo), // Base it on existing if it's there, or the initial member info
                isLoadingScore: false,
                isLoadingActivities: false,
                scoreError: `Critical error during processing: ${error instanceof Error ? error.message : String(error)}. Check console.`,
                activityError: `Critical error: ${error instanceof Error ? error.message : String(error)}`,
                currentDayScoreData: null, // Clear any potentially partial data
                historicalScores: [],
                averageHistoricalScore: null,
              };
               const newTeamData = prev.filter(m => m.id !== baseInfo.id);
               newTeamData.push(erroredMemberData);
               return newTeamData.sort((a,b) => a.name.localeCompare(b.name));
            });
          }
        }
        
        setIsProcessingMembers(false);
        console.log("TEAM OVERVIEW: All members processing attempted.");
      };
      fetchGraphUsersAndProcessAll();
    } else if (!isHR) {
      setTeamData([]);
      setIsLoadingUsers(false);
      setIsProcessingMembers(false);
      setUserFetchError(null);
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
    // If selecting today, set time to current time. Otherwise, end of day.
    const newTo = isEqual(startOfDay(day), startOfDay(new Date())) ? new Date() : endOfDay(day);
    setDateRange(prev => {
        const currentFrom = prev?.from || startOfDay(subDays(newTo, 6)); 
        const newFrom = isAfter(currentFrom, newTo) ? startOfDay(newTo) : currentFrom;
        return { from: newFrom, to: newTo };
    });
  };

  // Custom isAfter because date-fns isAfter can be tricky with start/end of day
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

    // Determine the time window for fetching activities for the dialog (main score day)
    const activityDayStart = startOfDay(dateRange.to);
    // If the dateRange.to is today, fetch up to current time, otherwise for the full day
    const activityDayEnd = isEqual(startOfDay(dateRange.to), startOfDay(new Date())) ? new Date() : endOfDay(dateRange.to);

    console.log(`TEAM_OVERVIEW (Dialog): Fetching activities for ${memberToView.name} for date ${format(activityDayStart, 'yyyy-MM-dd')} up to ${format(activityDayEnd, 'HH:mm:ss')}`);

    let activitiesForDialog: GenericActivityItem[] = [];
    let fetchErrorForDialog: string | null = null;

    // Fetch Jira Activities for dialog
    if (memberToView.email) {
        try {
            // Use the precise activityDayStart and activityDayEnd for the API call
            const jiraDialogResponse = await fetch(`/api/jira/issues?userEmail=${encodeURIComponent(memberToView.email)}&startDate=${encodeURIComponent(activityDayStart.toISOString())}&endDate=${encodeURIComponent(activityDayEnd.toISOString())}`, { cache: 'no-store' });
            if (jiraDialogResponse.ok) {
                activitiesForDialog.push(...await jiraDialogResponse.json());
            } else {
                const err = await jiraDialogResponse.json();
                fetchErrorForDialog = (fetchErrorForDialog ? fetchErrorForDialog + "; " : "") + `Jira (Dialog): ${err.error || jiraDialogResponse.statusText}`;
            }
        } catch (e: any) {
            fetchErrorForDialog = (fetchErrorForDialog ? fetchErrorForDialog + "; " : "") + `Jira (Dialog) Exc: ${e.message}`;
        }
    }


    // Fetch Teams Activities for dialog
    try {
      // Use the precise activityDayStart and activityDayEnd
      const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberToView.id)}&startDate=${encodeURIComponent(activityDayStart.toISOString())}&endDate=${encodeURIComponent(activityDayEnd.toISOString())}`, { cache: 'no-store' });
      if (teamsResponse.ok) {
        activitiesForDialog.push(...await teamsResponse.json());
      } else {
        const err = await teamsResponse.json();
        fetchErrorForDialog = (fetchErrorForDialog ? fetchErrorForDialog + "; " : "") + `Teams (Dialog): ${err.error || teamsResponse.statusText}`;
      }
    } catch (e: any) {
      fetchErrorForDialog = (fetchErrorForDialog ? fetchErrorForDialog + "; " : "") + `Teams (Dialog) Exc: ${e.message}`;
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
                Daily scores based on activities. Historical trend shows prior daily scores.
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
             Score for the End Date is calculated based on activities up to the current time (if End Date is today & refreshed) or full day (if past). Refreshing updates the End Date score to current time if today.
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
                  disabled={(date) => date > (dateRange?.to || new Date()) || date < subDays(new Date(), 90) || date > new Date()} // Limit to past 90 days and not after today or selected 'to' date
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
                  disabled={(date) => date < (dateRange?.from || subDays(new Date(),90)) || date > new Date()} // Limit to not before 'from' date or today
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
           <CardHeader> {/* Adjusted CardHeader nesting for this description */}
            <CardDescription className="text-xs text-muted-foreground">
              Historical trend shows daily scores for up to {NUMBER_OF_HISTORICAL_DAYS_FOR_TREND} prior days within the selected Start Date.
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
      
      {isHR && !isLoadingUsers && !userFetchError && !isProcessingMembers && teamData.length > 0 && !teamData.some(m => m.isLoadingScore || m.isLoadingActivities) && (
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

    