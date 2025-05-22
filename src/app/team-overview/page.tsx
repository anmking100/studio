
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
  const [allJiraIssues, setAllJiraIssues] = useState<JiraIssue[] | null>(null);
  const [isLoadingAllJiraIssues, setIsLoadingAllJiraIssues] = useState(false);
  const [allJiraIssuesError, setAllJiraIssuesError] = useState<string | null>(null);

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
      from: startOfDay(subDays(today, 6)), // Default to last 7 days including today
      to: today, // End of today or current time if today
    };
  });

  const fetchActivitiesAndCalculateDailyScore = useCallback(async (
    memberId: string,
    memberEmail: string | undefined,
    dayStart: Date,
    dayEnd: Date,
    allJiraIssuesForFilter: JiraIssue[] | null
  ): Promise<CalculateFragmentationScoreOutput | { error: string; details?: any; activitiesCount: number }> => {
    console.log(`TEAM OVERVIEW (DailyScore): Processing for member ${memberId} (${memberEmail || 'No Email'}) for period: ${dayStart.toISOString()} to ${dayEnd.toISOString()}`);
    let dailyActivities: GenericActivityItem[] = [];
    let activityFetchError: string | null = null;

    // Filter pre-fetched Jira Activities
    console.log(`TEAM OVERVIEW (DailyScore) - JIRA PRE-FILTER: Member ${memberId}, Email: ${memberEmail}, DayStart: ${dayStart.toISOString()}, DayEnd: ${dayEnd.toISOString()}`);
    if (allJiraIssuesForFilter) {
      console.log(`TEAM OVERVIEW (DailyScore) - JIRA PRE-FILTER: Global Jira issues available, count: ${allJiraIssuesForFilter.length}`);
    } else {
      console.warn(`TEAM OVERVIEW (DailyScore) - JIRA PRE-FILTER: Global Jira issues list (allJiraIssuesForFilter) is null for member ${memberId}. Error during fetch might have occurred: ${allJiraIssuesError}`);
    }
    
    if (memberEmail && allJiraIssuesForFilter) {
      const memberEmailLower = memberEmail.toLowerCase();
      console.log(`TEAM OVERVIEW (DailyScore) - JIRA FILTERING: Processing for memberEmail (lower): ${memberEmailLower}`);

      const userJiraIssuesForDay = allJiraIssuesForFilter.filter(issue => {
        const issueAssigneeEmail = issue.fields.assignee?.emailAddress;
        const issueAssigneeEmailLower = issueAssigneeEmail?.toLowerCase();
        
        const assigneeMatch = issueAssigneeEmailLower === memberEmailLower;
        
        let dateMatch = false;
        let parsedIssueUpdatedDate: Date | null = null;
        try {
          parsedIssueUpdatedDate = parseISO(issue.fields.updated);
          dateMatch = isWithinInterval(parsedIssueUpdatedDate, { start: dayStart, end: dayEnd });
        } catch (e) {
          console.warn(`TEAM OVERVIEW (DailyScore) - JIRA DATE PARSE ERROR: Could not parse issue.fields.updated: "${issue.fields.updated}" for issue ${issue.key}. Error: ${(e as Error).message}`);
        }

        // Detailed log for each issue being considered
        if (issueAssigneeEmailLower === memberEmailLower) { // Log only for potentially matching assignees to reduce noise
             console.log(`TEAM OVERVIEW (DailyScore) - JIRA ISSUE CHECK: IssueKey=${issue.key}, IssueUpdated=${issue.fields.updated}, ParsedDate=${parsedIssueUpdatedDate?.toISOString()}, Assignee=${issueAssigneeEmail}(${issueAssigneeEmailLower}), AssigneeMatch=${assigneeMatch}, DateMatch=${dateMatch} (Range: ${dayStart.toISOString()} - ${dayEnd.toISOString()})`);
        }

        return assigneeMatch && dateMatch;
      });

      console.log(`TEAM OVERVIEW (DailyScore) - JIRA FILTERING RESULT: Found ${userJiraIssuesForDay.length} Jira issues for ${memberId} (${memberEmail}) on ${format(dayStart, 'yyyy-MM-dd')} after filtering global list.`);

      if (userJiraIssuesForDay.length > 0) {
        const mappedJiraActivities = userJiraIssuesForDay.map((issue): GenericActivityItem => ({
          type: `jira_issue_${issue.fields.issuetype.name.toLowerCase().replace(/\s+/g, '_')}`,
          timestamp: issue.fields.updated,
          details: `[${issue.key}] ${issue.fields.summary} (Status: ${issue.fields.status.name})`,
          source: 'jira',
        }));
        dailyActivities.push(...mappedJiraActivities);
        console.log(`TEAM OVERVIEW (DailyScore) - JIRA MAPPED: Mapped ${mappedJiraActivities.length} Jira activities for ${memberId} for day ${format(dayStart, 'yyyy-MM-dd')}.`);
        // Log details of specifically fetched Jira activities
        console.log(`TEAM OVERVIEW (DailyScore): Specifically, ${mappedJiraActivities.length} JIRA activities were fetched for ${memberId} for day ${format(dayStart, "yyyy-MM-dd")}.`);

      }
    } else if (memberEmail && !allJiraIssuesForFilter && !isLoadingAllJiraIssues) {
      const jiraFilterErrorMsg = `Jira: Global Jira issues list not available for filtering. Error: ${allJiraIssuesError || 'No issues fetched from global source'}`;
      activityFetchError = (activityFetchError ? activityFetchError + "; " : "") + jiraFilterErrorMsg;
      console.warn(`TEAM OVERVIEW (DailyScore): ${jiraFilterErrorMsg} for ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}`);
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
      // If there was a partial error fetching some activities, append it to the summary
      if (activityFetchError && result.summary) {
        return { ...result, summary: `Note: Some activity data for this day might be missing. Errors: ${activityFetchError}. Original Summary: ${result.summary}` };
      } else if (activityFetchError) {
         return { ...result, summary: `Note: Some activity data for this day might be missing. Errors: ${activityFetchError}.` };
      }
      return result;
    } catch (scoreErr: any) {
      const scoreErrorMessage = `Algorithmic score calc error for day ${format(dayStart, 'yyyy-MM-dd')}: ${scoreErr.message}`;
      console.error(`TEAM OVERVIEW (DailyScore): ${scoreErrorMessage}`, scoreErr);
      const baseErrorReturn = { error: activityFetchError ? `${activityFetchError}; ${scoreErrorMessage}` : scoreErrorMessage , details: {day: format(dayStart, 'yyyy-MM-dd')}, activitiesCount: dailyActivities.length };
      return baseErrorReturn;
    }
  }, [allJiraIssuesError, isLoadingAllJiraIssues]);


  const processSingleMember = useCallback(async (
    memberInput: Omit<TeamMemberFocus, 'isLoadingScore' | 'scoreError' | 'currentDayScoreData' | 'historicalScores' | 'averageHistoricalScore' | 'activityError' | 'isLoadingActivities'>,
    effectiveStartDateForRange: Date, 
    effectiveEndDateForRange: Date,
    currentSystemTimeWhenProcessingStarted: Date,
    globallyFetchedJiraIssues: JiraIssue[] | null
  ): Promise<TeamMemberFocus> => {
    console.log(`TEAM OVERVIEW (Member): Starting data processing for member: ${memberInput.name} (ID: ${memberInput.id}) for range ${format(effectiveStartDateForRange, 'yyyy-MM-dd')} to ${format(effectiveEndDateForRange, 'yyyy-MM-dd HH:mm:ss')}`);
    let overallMemberError: string | null = null;
    const historicalScoresData: HistoricalScore[] = [];
    let currentDayCalculatedScoreData: CalculateFragmentationScoreOutput | null = null;

    // Calculate score for the main selected end date
    const mainDayStart = startOfDay(effectiveEndDateForRange);
    // If effectiveEndDateForRange is today, mainDayEnd should be currentSystemTimeWhenProcessingStarted
    // Otherwise, it's the end of the day for effectiveEndDateForRange
    const mainDayEnd = isEqual(startOfDay(effectiveEndDateForRange), startOfDay(currentSystemTimeWhenProcessingStarted))
                       ? currentSystemTimeWhenProcessingStarted
                       : endOfDay(effectiveEndDateForRange);

    console.log(`TEAM OVERVIEW (Member): Processing main day score for ${memberInput.name} for ${format(mainDayStart, 'yyyy-MM-dd')} up to ${format(mainDayEnd, 'HH:mm:ss')}`);
    const mainDayResult = await fetchActivitiesAndCalculateDailyScore(memberInput.id, memberInput.email, mainDayStart, mainDayEnd, globallyFetchedJiraIssues);
    
    if ('error' in mainDayResult) {
      const errorMsg = `Score for ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: ${mainDayResult.error}`;
      overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + errorMsg;
      console.warn(`TEAM OVERVIEW (Member): Error for main day score for ${memberInput.name} on ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: ${mainDayResult.error}`);
    } else {
      currentDayCalculatedScoreData = mainDayResult;
      console.log(`TEAM OVERVIEW (Member): Main day score for ${memberInput.name} on ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: Score=${mainDayResult.fragmentationScore}, Activities=${mainDayResult.activitiesCount}. Summary: ${mainDayResult.summary}`);
    }

    // Calculate historical scores
    for (let i = 0; i < NUMBER_OF_HISTORICAL_DAYS_FOR_TREND; i++) {
      const historicalDateCandidate = subDays(startOfDay(effectiveEndDateForRange), i + 1); // Go back one day from the END date for first historical point

      // Ensure historicalDateCandidate is not before effectiveStartDateForRange
      if (isBefore(historicalDateCandidate, startOfDay(effectiveStartDateForRange))) {
        console.log(`TEAM OVERVIEW (Member): Historical date ${format(historicalDateCandidate, 'yyyy-MM-dd')} is before start date of range ${format(startOfDay(effectiveStartDateForRange), 'yyyy-MM-dd')}. Skipping further historical for ${memberInput.name}.`);
        break;
      }
      
      const historicalDayStart = startOfDay(historicalDateCandidate);
      const historicalDayEnd = endOfDay(historicalDateCandidate); // Historical days are always full days

      console.log(`TEAM OVERVIEW (Member): Processing historical score for ${memberInput.name} for ${format(historicalDayStart, 'yyyy-MM-dd')}`);
      const historicalDayResult = await fetchActivitiesAndCalculateDailyScore(memberInput.id, memberInput.email, historicalDayStart, historicalDayEnd, globallyFetchedJiraIssues);

      if ('error' in historicalDayResult) {
        const errorMsg = `Historical for ${format(historicalDateCandidate, 'yyyy-MM-dd')}: ${historicalDayResult.error}`;
        overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + errorMsg;
        console.warn(`TEAM OVERVIEW (Member): Error calculating historical score for ${memberInput.name} on ${format(historicalDateCandidate, 'yyyy-MM-dd')}: ${historicalDayResult.error}`);
      } else {
        console.log(`TEAM OVERVIEW (Member): Historical score for ${memberInput.name} on ${format(historicalDateCandidate, 'yyyy-MM-dd')}: Score=${historicalDayResult.fragmentationScore}, Activities=${historicalDayResult.activitiesCount}. Summary: ${historicalDayResult.summary}`);
        historicalScoresData.push({
          date: format(startOfDay(historicalDateCandidate), 'yyyy-MM-dd'), // Store just the date part
          score: historicalDayResult.fragmentationScore,
          riskLevel: historicalDayResult.riskLevel,
          summary: historicalDayResult.summary,
          activitiesCount: historicalDayResult.activitiesCount,
        });
      }
    }
    historicalScoresData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Sort by date ascending

    let avgHistScore: number | null = null;
    // Calculate average only from historical scores that didn't result in a baseline "no activity" score, unless all are baseline
    const validHistoricalScoresForAverage = historicalScoresData.filter(hs => hs.score > 0.5 || (hs.score === 0.5 && hs.activitiesCount > 0) );
    
    if (validHistoricalScoresForAverage.length > 0) {
      const sum = validHistoricalScoresForAverage.reduce((acc, curr) => acc + curr.score, 0);
      avgHistScore = parseFloat((sum / validHistoricalScoresForAverage.length).toFixed(1));
    } else if (historicalScoresData.length > 0) { // If all historical scores were 0.5 due to no activity
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
      scoreError: overallMemberError,
      activityError: overallMemberError, // Consolidate errors
    };
  }, [fetchActivitiesAndCalculateDailyScore]);


  const handleRetryMemberProcessing = useCallback(async (memberId: string) => {
    console.log(`TEAM OVERVIEW: Retrying data processing for member ID: ${memberId}`);
    const memberToRetry = teamData.find(m => m.id === memberId);

    if (memberToRetry && dateRange?.from && dateRange?.to && allJiraIssues !== undefined) {
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

      const updatedMember = await processSingleMember(baseMemberInfo, startOfDay(dateRange.from), effectiveRangeEndForRetry, currentSystemTimeForRetry, allJiraIssues);

      setTeamData(prevTeamData =>
        prevTeamData.map(m =>
          m.id === memberId ? updatedMember : m
        )
      );
    } else {
      console.error(`TEAM OVERVIEW: Could not find member with ID ${memberId} to retry, or date range/allJiraIssues not set. AllJiraIssues defined: ${allJiraIssues !== undefined}`);
    }
  }, [teamData, processSingleMember, dateRange, allJiraIssues]);

  useEffect(() => {
    if (isHR && dateRange?.from && dateRange?.to) {
      const fetchGraphUsersAndProcessAll = async () => {
        console.log("TEAM OVERVIEW: Starting fetchGraphUsersAndProcessAll due to HR, dateRange, or refreshKey change.");
        setIsLoadingAllJiraIssues(true);
        setAllJiraIssuesError(null);
        setAllJiraIssues(null); 
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
        console.log(`TEAM OVERVIEW: Effective processing range for ALL members: ${format(effectiveRangeFrom, 'yyyy-MM-dd')} to ${format(effectiveRangeToForFetch, 'yyyy-MM-dd HH:mm:ss')}`);

        let fetchedAllJiraIssuesGlobally: JiraIssue[] | null = null;
        try {
          console.log(`TEAM OVERVIEW: Fetching all assigned Jira issues for range: ${dateRange.from.toISOString()} to ${dateRange.to.toISOString()}`);
          const jiraParams = new URLSearchParams({
            startDate: dateRange.from.toISOString(),
            endDate: dateRange.to.toISOString(),
          });
          const response = await fetch(`/api/jira/all-raw-issues?${jiraParams.toString()}`, { cache: 'no-store' });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch all Jira issues: ${response.statusText}`);
          }
          fetchedAllJiraIssuesGlobally = await response.json();
          setAllJiraIssues(fetchedAllJiraIssuesGlobally); // Set state for dialog
          console.log(`TEAM OVERVIEW: Successfully fetched ${fetchedAllJiraIssuesGlobally?.length || 0} total assigned Jira issues globally.`);
        } catch (err: any) {
          console.error("TEAM OVERVIEW: Error fetching all Jira issues:", err);
          setAllJiraIssuesError(err.message || "An unknown error occurred while fetching all Jira issues.");
        } finally {
          setIsLoadingAllJiraIssues(false);
        }

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

        if (validMsUsers.length === 0) {
          const errorMsg = msUsers.length > 0 ? "No users with valid IDs found from MS Graph." : "No users returned from MS Graph.";
          setUserFetchError(errorMsg);
          console.warn(`TEAM OVERVIEW: ${errorMsg}`);
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

        console.log(`TEAM OVERVIEW: Starting to process ${initialTeamDataSetup.length} members.`);
        const processedTeamDataPromises = initialTeamDataSetup.map(member => {
            const { currentDayScoreData: _a, historicalScores: _b, averageHistoricalScore: _c, isLoadingScore: _d, isLoadingActivities: _e, scoreError: _f, activityError: _g, ...baseInfo } = member;
            return processSingleMember(baseInfo, effectiveRangeFrom, effectiveRangeToForFetch, currentSystemTimeForFetch, fetchedAllJiraIssuesGlobally);
        });
        
        // Process in parallel and update UI as results come in
        for (const promise of processedTeamDataPromises) {
            try {
                const updatedMember = await promise;
                setTeamData(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
            } catch (error: any) {
                console.error(`TEAM OVERVIEW: Critical error processing member during parallel execution. Member ID might not be available here. Error:`, error);
                // Find a way to associate this error with a member if possible, or handle generically
            }
        }
        
        setIsProcessingMembers(false);
        console.log("TEAM OVERVIEW: All members processing attempted.");
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
    // If selected day is today, set 'to' to current time, otherwise end of selected day
    const newTo = isEqual(startOfDay(day), startOfDay(new Date())) ? new Date() : endOfDay(day);
    setDateRange(prev => {
        const currentFrom = prev?.from || startOfDay(subDays(newTo, 6)); 
        const newFrom = isAfter(currentFrom, newTo) ? startOfDay(newTo) : currentFrom;
        return { from: newFrom, to: newTo };
    });
  };

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

    const activityDayStart = startOfDay(dateRange.to);
    const activityDayEnd = isEqual(startOfDay(dateRange.to), startOfDay(new Date())) ? new Date() : endOfDay(dateRange.to);

    console.log(`TEAM_OVERVIEW (Dialog): Fetching activities for ${memberToView.name} for date ${format(activityDayStart, 'yyyy-MM-dd')} up to ${format(activityDayEnd, 'HH:mm:ss')}`);

    let activitiesForDialog: GenericActivityItem[] = [];
    let fetchErrorForDialog: string | null = null;

    // Filter pre-fetched Jira activities for dialog
    if (memberToView.email && allJiraIssues) { // Use the globally fetched allJiraIssues
        const memberEmailLower = memberToView.email.toLowerCase();
        const userJiraIssuesForDialog = allJiraIssues.filter(issue => {
            const assigneeMatch = issue.fields.assignee?.emailAddress?.toLowerCase() === memberEmailLower;
            let dateMatch = false;
            try {
                const issueUpdatedDate = parseISO(issue.fields.updated);
                dateMatch = isWithinInterval(issueUpdatedDate, { start: activityDayStart, end: activityDayEnd });
            } catch (e) { console.warn(`Could not parse issue.fields.updated for dialog: ${issue.fields.updated} for issue ${issue.key}`); }
            return assigneeMatch && dateMatch;
        });
        activitiesForDialog.push(...userJiraIssuesForDialog.map((issue): GenericActivityItem => ({
            type: `jira_issue_${issue.fields.issuetype.name.toLowerCase().replace(/\s+/g, '_')}`,
            timestamp: issue.fields.updated,
            details: `[${issue.key}] ${issue.fields.summary} (Status: ${issue.fields.status.name})`,
            source: 'jira',
        })));
        console.log(`TEAM_OVERVIEW (Dialog): Found ${userJiraIssuesForDialog.length} Jira issues for ${memberToView.name} from global list for dialog.`);
    } else if (memberToView.email && !allJiraIssues && !isLoadingAllJiraIssues) {
         fetchErrorForDialog = (fetchErrorForDialog ? fetchErrorForDialog + "; " : "") + `Jira: Global issues list not available. ${allJiraIssuesError || ''}`;
         console.warn(`TEAM_OVERVIEW (Dialog): Jira global list not available for ${memberToView.name}. Error: ${allJiraIssuesError}`);
    }


    // Fetch Teams Activities
    try {
      const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberToView.id)}&startDate=${encodeURIComponent(activityDayStart.toISOString())}&endDate=${encodeURIComponent(activityDayEnd.toISOString())}`, { cache: 'no-store' });
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
  }, [dateRange?.to, allJiraIssues, isLoadingAllJiraIssues, allJiraIssuesError]);


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
                Scores calculated based on all activities for the selected day. Historical trend shows prior daily scores.
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
             <Button
              onClick={() => setRefreshKey(prev => prev + 1)}
              disabled={isLoadingAllJiraIssues || isLoadingUsers || isProcessingMembers}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Data
            </Button>
          </CardContent>
           <CardHeader>
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
      
      {isHR && isLoadingAllJiraIssues && (
        <Alert variant="default" className="shadow-md border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />
          <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Fetching All Jira Issues</AlertTitle>
          <AlertDescription className="text-blue-600 dark:text-blue-500">Loading initial Jira data for the selected range. This may take a moment...</AlertDescription>
        </Alert>
      )}
      {isHR && allJiraIssuesError && !isLoadingAllJiraIssues && (
        <Alert variant="destructive" className="shadow-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Error Fetching All Jira Issues</AlertTitle>
          <AlertDescription>{allJiraIssuesError} Ensure Jira API is configured & service running. Jira data will be missing from scores.</AlertDescription>
        </Alert>
      )}


      {isHR && isLoadingUsers && !isLoadingAllJiraIssues && ( // Only show if Jira issues are done or errored but users are still loading
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

      {isHR && !isLoadingAllJiraIssues && !isLoadingUsers && !userFetchError && isProcessingMembers && (
        <Alert variant="default" className="shadow-md border-orange-500/50 text-orange-700 dark:border-orange-400/50 dark:text-orange-400">
          <Loader2 className="h-5 w-5 animate-spin text-orange-600 dark:text-orange-500" />
          <AlertTitle className="font-semibold text-orange-700 dark:text-orange-400">Processing Team Data</AlertTitle>
          <AlertDescription className="text-orange-600 dark:text-orange-500">
            Fetching activities and calculating daily scores for each member. This may take some time.
            Members remaining: ({teamData.filter(m => m.isLoadingScore || m.isLoadingActivities).length}). Please be patient.
          </AlertDescription>
        </Alert>
      )}

      {isHR && !isLoadingAllJiraIssues && !isLoadingUsers && !userFetchError && !isProcessingMembers && teamData.length === 0 && (
         <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Users to Process</AlertTitle>
              <AlertDescription>
                No users were found from Microsoft Graph, or an error occurred before processing could start.
                Please check MS Graph configuration, API permissions, and server logs.
              </AlertDescription>
            </Alert>
      )}
      
      {isHR && !isLoadingAllJiraIssues && !isLoadingUsers && !userFetchError && !isProcessingMembers && teamData.length > 0 && !teamData.some(m => m.isLoadingScore) && (
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
          {isHR && !isLoadingAllJiraIssues && !isLoadingUsers && !userFetchError && teamData.length === 0 && !isProcessingMembers && (
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
