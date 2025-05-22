
"use client";

import { useEffect, useState, useCallback } from "react";
import { TeamMemberCard } from "@/components/team-overview/team-member-card";
import { UserActivityDetailsDialog } from "@/components/team-overview/user-activity-details-dialog";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, BarChart3, Loader2, AlertTriangle, ShieldCheck, CalendarDays, RefreshCw } from "lucide-react";
import Image from "next/image";
import { calculateScoreAlgorithmically } from "@/lib/score-calculator";
import type { TeamMemberFocus, GenericActivityItem, MicrosoftGraphUser, HistoricalScore, CalculateFragmentationScoreInputType, CalculateFragmentationScoreOutput, JiraIssue } from "@/lib/types";
import { format, subDays, startOfDay, endOfDay, parseISO, isEqual, isWithinInterval, isBefore, addHours, eachDayOfInterval } from 'date-fns';
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const NUMBER_OF_HISTORICAL_DAYS_FOR_TREND = 5;

// Helper to map JiraIssue to GenericActivityItem (Client-side for filtering global list)
function mapJiraIssueToActivity(issue: JiraIssue): GenericActivityItem {
  return {
    type: `jira_issue_${issue.fields.issuetype.name.toLowerCase().replace(/\s+/g, '_')}`,
    timestamp: issue.fields.updated,
    details: `[${issue.key}] ${issue.fields.summary} (Status: ${issue.fields.status.name})`,
    source: 'jira',
    jiraStatusCategoryKey: issue.fields.status.statusCategory?.key,
  };
}

export default function TeamOverviewPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'hr';
  
  const [teamData, setTeamData] = useState<TeamMemberFocus[]>([]);
  
  // State for global Jira issues fetch
  const [allJiraIssues, setAllJiraIssues] = useState<JiraIssue[] | null>(null);
  const [isLoadingAllJiraIssues, setIsLoadingAllJiraIssues] = useState(true);
  const [allJiraIssuesError, setAllJiraIssuesError] = useState<string | null>(null);

  // State for MS Graph users fetch
  const [isLoadingUsers, setIsLoadingUsers] = useState(false); 
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  
  // State for overall member processing
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
      to: endOfDay(today), 
    };
  });

  const fetchActivitiesForDay = useCallback(async (
    memberId: string,
    memberEmail: string | undefined,
    dayStart: Date,
    dayEnd: Date,
    allJiraIssuesSnapshot: JiraIssue[] | null 
  ): Promise<{ activities: GenericActivityItem[], error: string | null, activitiesCount: number }> => {
    console.log(`TEAM OVERVIEW (DailyScore): Processing for member ${memberId} (${memberEmail || 'No Email'}) for period: ${dayStart.toISOString()} to ${dayEnd.toISOString()}`);
    let dailyActivities: GenericActivityItem[] = [];
    let apiFetchError: string | null = null;

    // Filter Jira Activities from the global list
    if (memberEmail && allJiraIssuesSnapshot && allJiraIssuesSnapshot.length > 0) {
      const memberEmailLower = memberEmail.toLowerCase();
      console.log(`TEAM OVERVIEW (DailyScore) - JIRA PRE-FILTER: Global Jira issues available, count: ${allJiraIssuesSnapshot.length}. Filtering for ${memberEmailLower} on day ${format(dayStart, 'yyyy-MM-dd')}`);
      
      const userJiraIssuesForDay = allJiraIssuesSnapshot.filter(issue => {
        const assigneeEmailInIssue = issue.fields.assignee?.emailAddress;
        const assigneeEmailLower = assigneeEmailInIssue?.toLowerCase();
        const isAssigneeMatch = assigneeEmailLower === memberEmailLower;
        
        let isDateMatch = false;
        let parsedIssueUpdatedDate: Date | null = null;
        try {
          parsedIssueUpdatedDate = parseISO(issue.fields.updated); // Jira 'updated' is ISO 8601
          isDateMatch = isWithinInterval(parsedIssueUpdatedDate, { start: dayStart, end: dayEnd });
        } catch (e: any) {
          console.warn(`TEAM_OVERVIEW (DailyScore) - JIRA DATE PARSE ERROR: Failed to parse issue.fields.updated: ${issue.fields.updated} for issue ${issue.key}`, e);
        }
        
        if (isAssigneeMatch) {
             console.log(
                `TEAM OVERVIEW (DailyScore) - JIRA ISSUE CHECK (Member: ${memberEmailLower}): ` +
                `IssueKey=${issue.key}, IssueSummary="${issue.fields.summary}", IssueUpdated=${issue.fields.updated}, ParsedDate=${parsedIssueUpdatedDate?.toISOString() || 'ParseErr'}, ` +
                `AssigneeInIssue=${assigneeEmailInIssue || 'N/A'} (Lower: ${assigneeEmailLower || 'N/A'}), ` +
                `AssigneeMatch=${isAssigneeMatch}, DateMatch=${isDateMatch} (Range: ${dayStart.toISOString()} - ${dayEnd.toISOString()})`
            );
        }
        return isAssigneeMatch && isDateMatch;
      });

      console.log(`TEAM OVERVIEW (DailyScore) - JIRA FILTERING RESULT: Found ${userJiraIssuesForDay.length} Jira issues for ${memberId} (${memberEmail}) on ${format(dayStart, 'yyyy-MM-dd')} after filtering global list.`);
      if (userJiraIssuesForDay.length > 0) {
        const mappedJiraActivities = userJiraIssuesForDay.map(mapJiraIssueToActivity);
        dailyActivities.push(...mappedJiraActivities);
        console.log(`TEAM OVERVIEW (DailyScore) - JIRA MAPPED: Mapped ${mappedJiraActivities.length} Jira activities for ${memberId} for day ${format(dayStart, 'yyyy-MM-dd')}.`);
      }
    } else if (memberEmail && allJiraIssuesSnapshot === null) {
      console.warn(`TEAM OVERVIEW (DailyScore) - JIRA: Global Jira issues not loaded yet for member ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}.`);
      apiFetchError = (apiFetchError ? apiFetchError + "; " : "") + "Global Jira issues not available for filtering.";
    } else if (memberEmail && allJiraIssuesSnapshot && allJiraIssuesSnapshot.length === 0) {
       console.log(`TEAM OVERVIEW (DailyScore) - JIRA: Global Jira issues list is empty for member ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}. No Jira activities to filter.`);
    }
    const jiraActivitiesFetchedCount = dailyActivities.filter(act => act.source === 'jira').length;
    console.log(`TEAM OVERVIEW (DailyScore): Specifically, ${jiraActivitiesFetchedCount} JIRA activities were identified for ${memberId} for day ${format(dayStart, 'yyyy-MM-dd')}.`);

    // Fetch Teams Activities
    try {
      const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(memberId)}&startDate=${encodeURIComponent(dayStart.toISOString())}&endDate=${encodeURIComponent(dayEnd.toISOString())}`, { cache: 'no-store' });
      if (teamsResponse.ok) {
        const teamsActivitiesFromApi: GenericActivityItem[] = await teamsResponse.json();
        dailyActivities.push(...teamsActivitiesFromApi);
        console.log(`TEAM OVERVIEW (DailyScore): Fetched ${teamsActivitiesFromApi.length} Teams activities for ${memberId} for day ${format(dayStart, 'yyyy-MM-dd')}`);
      } else {
        const errorData = await teamsResponse.json();
        const teamsErrorMsg = `Teams API Error: ${errorData.error || teamsResponse.statusText}`;
        apiFetchError = (apiFetchError ? apiFetchError + "; " : "") + teamsErrorMsg;
        console.warn(`TEAM OVERVIEW (DailyScore): Teams fetch error for ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}: ${teamsErrorMsg}`);
      }
    } catch (e: any) {
      const teamsCatchError = `Teams Fetch Exception: ${e.message}`;
      apiFetchError = (apiFetchError ? apiFetchError + "; " : "") + teamsCatchError;
      console.warn(`TEAM OVERVIEW (DailyScore): Teams fetch exception for ${memberId} on ${format(dayStart, 'yyyy-MM-dd')}: ${teamsCatchError}`);
    }
    
    dailyActivities.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const totalActivitiesForDay = dailyActivities.length;
    console.log(`TEAM OVERVIEW (DailyScore): Total ${totalActivitiesForDay} activities collected for ${memberId} for day ${format(dayStart, 'yyyy-MM-dd')} before scoring.`);
    
    return { activities: dailyActivities, error: apiFetchError, activitiesCount: totalActivitiesForDay };
  }, []);

  // Simplified: Calculate score directly for a given day's activities
  const calculateDailyScore = useCallback(async (
    memberId: string, 
    memberEmail: string | undefined,
    dayToScore: Date, 
    currentSystemTimeForDay: Date, // Used to cap 'today's' processing
    allJiraIssuesSnapshot: JiraIssue[] | null
  ): Promise<CalculateFragmentationScoreOutput & { activityError?: string | null }> => {
      const dayStart = startOfDay(dayToScore);
      const dayEnd = isEqual(dayStart, startOfDay(currentSystemTimeForDay))
                     ? currentSystemTimeForDay // For 'today', process up to current time
                     : endOfDay(dayToScore);    // For past days, process full day

      const { activities, error: activityFetchError, activitiesCount } = await fetchActivitiesForDay(memberId, memberEmail, dayStart, dayEnd, allJiraIssuesSnapshot);
      
      const scoreInput: CalculateFragmentationScoreInputType = { userId: memberId, activityWindowDays: 1, activities };
      const scoreResult = calculateScoreAlgorithmically(scoreInput);
      
      return {
        ...scoreResult,
        activityError: activityFetchError, // Pass along any activity fetching errors
      };
  }, [fetchActivitiesForDay]);

  const processSingleMember = useCallback(async (
    memberInput: Omit<TeamMemberFocus, 'isLoadingScore' | 'scoreError' | 'currentDayScoreData' | 'historicalScores' | 'averageHistoricalScore' | 'activityError' | 'isLoadingActivities'>,
    effectiveStartDateForRange: Date, 
    effectiveEndDateForRange: Date,
    currentSystemTimeWhenProcessingStarted: Date,
    allJiraIssuesSnapshot: JiraIssue[] | null 
  ): Promise<TeamMemberFocus> => {
    console.log(`TEAM OVERVIEW (Member): Starting data processing for member: ${memberInput.name} (ID: ${memberInput.id}) for range ${format(effectiveStartDateForRange, 'yyyy-MM-dd')} to ${format(effectiveEndDateForRange, 'yyyy-MM-dd HH:mm:ss')}`);
    
    let overallMemberError: string | null = null;
    const historicalScoresData: HistoricalScore[] = [];
    let currentDayProcessedScoreData: CalculateFragmentationScoreOutput | null = null;
    let currentDayActivityError: string | null = null;

    try {
      console.log(`TEAM OVERVIEW (Member): Processing main day score for ${memberInput.name} for ${format(effectiveEndDateForRange, 'yyyy-MM-dd')} `);
      const mainDayResult = await calculateDailyScore(memberInput.id, memberInput.email, effectiveEndDateForRange, currentSystemTimeWhenProcessingStarted, allJiraIssuesSnapshot);
      currentDayProcessedScoreData = mainDayResult;
      currentDayActivityError = mainDayResult.activityError || null;
      if (currentDayActivityError) {
          overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Activity fetch issues on ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: ${currentDayActivityError}`;
      }
      console.log(`TEAM OVERVIEW (Member): Main day score for ${memberInput.name} on ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: Score=${mainDayResult.fragmentationScore}, Activities=${mainDayResult.activitiesCount}. Summary: ${mainDayResult.summary}`);
    } catch (scoreErr: any) {
      const errorMsg = `Score calc for ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: ${scoreErr.message}`;
      overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + errorMsg;
      currentDayActivityError = (currentDayActivityError ? currentDayActivityError + "; " : "") + errorMsg;
      console.warn(`TEAM OVERVIEW (Member): Error for main day score calc for ${memberInput.name} on ${format(effectiveEndDateForRange, 'yyyy-MM-dd')}: ${scoreErr.message}`);
    }

    for (let i = 0; i < NUMBER_OF_HISTORICAL_DAYS_FOR_TREND; i++) {
      const historicalDate = subDays(startOfDay(effectiveEndDateForRange), i + 1); 
      if (isBefore(historicalDate, startOfDay(effectiveStartDateForRange))) {
        console.log(`TEAM OVERVIEW (Member): Historical date ${format(historicalDate, 'yyyy-MM-dd')} is before start date of range ${format(startOfDay(effectiveStartDateForRange), 'yyyy-MM-dd')}. Skipping further historical for ${memberInput.name}.`);
        break;
      }
      
      try {
        console.log(`TEAM OVERVIEW (Member): Processing historical score for ${memberInput.name} for ${format(historicalDate, 'yyyy-MM-dd')}`);
        // For historical days, the 'currentSystemTimeForDay' is effectively the end of that historical day
        const historicalDayResult = await calculateDailyScore(memberInput.id, memberInput.email, historicalDate, endOfDay(historicalDate), allJiraIssuesSnapshot);
        
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
          overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + `Hist. activity fetch for ${format(historicalDate, 'yyyy-MM-dd')}: ${historicalDayResult.activityError}`;
        }
      } catch (scoreErr: any) {
        const errorMsg = `Hist. score calc for ${format(historicalDate, 'yyyy-MM-dd')}: ${scoreErr.message}`;
        overallMemberError = (overallMemberError ? overallMemberError + "\n" : "") + errorMsg;
        console.warn(`TEAM OVERVIEW (Member): Error calculating historical score for ${memberInput.name} on ${format(historicalDate, 'yyyy-MM-dd')}: ${scoreErr.message}`);
         historicalScoresData.push({
          date: format(startOfDay(historicalDate), 'yyyy-MM-dd'),
          score: 0, 
          riskLevel: 'Low', 
          summary: `Error calculating score: ${errorMsg}`,
          activitiesCount: 0,
          activityError: errorMsg
        });
      }
    }
    historicalScoresData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); 

    let avgHistScore: number | null = null;
    const validHistoricalScoresForAverage = historicalScoresData.filter(hs => 
      (hs.score > 0.5 || (hs.score === 0.5 && hs.activitiesCount > 0)) && !hs.activityError
    );
    if (validHistoricalScoresForAverage.length > 0) {
      const sum = validHistoricalScoresForAverage.reduce((acc, curr) => acc + curr.score, 0);
      avgHistScore = parseFloat((sum / validHistoricalScoresForAverage.length).toFixed(1));
    } else if (historicalScoresData.length > 0 && historicalScoresData.every(hs => hs.score <= 0.5 && hs.activitiesCount === 0 && !hs.activityError)) { 
      avgHistScore = 0.5;
    }
    
    console.log(`TEAM OVERVIEW (Member): Finished processing for member: ${memberInput.name}. Score for (${format(effectiveEndDateForRange, 'yyyy-MM-dd')}): ${currentDayProcessedScoreData?.fragmentationScore ?? 'N/A'}. Historical Count: ${historicalScoresData.length}. Avg Hist Score: ${avgHistScore ?? 'N/A'}. Overall Member Error: ${overallMemberError ?? 'None'}. Current Day Activity Error: ${currentDayActivityError ?? 'None'}`);
    
    return {
      ...memberInput,
      currentDayScoreData: currentDayProcessedScoreData,
      historicalScores: historicalScoresData,
      averageHistoricalScore: avgHistScore,
      isLoadingScore: false,
      isLoadingActivities: false,
      scoreError: overallMemberError,
      activityError: currentDayActivityError,
    };
  }, [calculateDailyScore]);


  const fetchAllDataAndProcess = useCallback(async () => {
    if (!isHR || !dateRange?.from || !dateRange?.to) {
      setIsLoadingAllJiraIssues(false);
      setIsLoadingUsers(false);
      setIsProcessingMembers(false);
      setTeamData([]); 
      return;
    }

    console.log("TEAM OVERVIEW: Starting fetchAllDataAndProcess due to HR, dateRange, or refreshKey change.");
    
    // Reset states
    setIsLoadingAllJiraIssues(true);
    setAllJiraIssuesError(null);
    setAllJiraIssues(null); 
    
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
    console.log(`TEAM OVERVIEW: Fetching ALL ASSIGNED JIRA ISSUES for global date range: ${dateRange.from.toISOString()} to ${dateRange.to.toISOString()}`);

    let fetchedAllJiraIssues: JiraIssue[] | null = null;
    try {
      const jiraParams = new URLSearchParams({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
      });
      const jiraResponse = await fetch(`/api/jira/all-raw-issues?${jiraParams.toString()}`, { cache: 'no-store' });
      if (!jiraResponse.ok) {
        const errorData = await jiraResponse.json();
        throw new Error(errorData.error || `Failed to fetch all Jira issues: ${jiraResponse.statusText}`);
      }
      fetchedAllJiraIssues = await jiraResponse.json();
      setAllJiraIssues(fetchedAllJiraIssues);
      console.log(`TEAM OVERVIEW: Successfully fetched ${fetchedAllJiraIssues?.length ?? 0} global Jira issues.`);
    } catch (err: any) {
      console.error("TEAM OVERVIEW: Error fetching all Jira issues:", err);
      setAllJiraIssuesError(err.message || "An unknown error occurred while fetching Jira issues.");
    }
    setIsLoadingAllJiraIssues(false);

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
      if (!msUser.userPrincipalName) {
        console.warn(`TEAM OVERVIEW: MS Graph user ${msUser.id} missing userPrincipalName (email). Skipped for Jira matching.`);
        // We could still process them for Teams data, but Jira matching will fail.
        // For now, let's filter them out if email is essential for Jira.
        // Or, let them through and handle missing email in Jira filtering logic. Let's allow them through.
      }
      return true;
    });

    const initialTeamDataSetup: TeamMemberFocus[] = validMsUsers.map(msUser => ({
      id: msUser.id!,
      name: msUser.displayName || msUser.userPrincipalName || "Unknown User",
      email: msUser.userPrincipalName || undefined,
      role: (msUser.userPrincipalName?.toLowerCase().includes('hr')) ? 'hr' : 'developer',
      avatarUrl: `https://placehold.co/100x100.png?text=${(msUser.displayName || msUser.userPrincipalName || "U")?.[0]?.toUpperCase()}`,
      isLoadingScore: true, isLoadingActivities: true, scoreError: null, activityError: null,
      historicalScores: [], averageHistoricalScore: null, currentDayScoreData: null,
    })).sort((a, b) => a.name.localeCompare(b.name));
    
    setTeamData(initialTeamDataSetup);

    if (initialTeamDataSetup.length === 0) {
      const errorMsg = validMsUsers.length === 0 && msUsers.length > 0 ? "No users with valid IDs found from MS Graph." : "No users returned from MS Graph.";
      setUserFetchError(errorMsg);
      console.warn(`TEAM OVERVIEW: ${errorMsg}`);
      setIsProcessingMembers(false);
      return;
    }

    console.log(`TEAM OVERVIEW: Starting to process ${initialTeamDataSetup.length} members with globally fetched Jira data (count: ${fetchedAllJiraIssues?.length ?? 'N/A - Error or Empty'}).`);
    
    const processedMembersPromises = initialTeamDataSetup.map(async (memberInit) => {
       try {
        const {
            currentDayScoreData: _cds, historicalScores: _hs, averageHistoricalScore: _ahs,
            isLoadingScore: _ils, isLoadingActivities: _ila, scoreError: _se, activityError: _ae,
            ...baseInfo
        } = memberInit; // Destructure all non-data fields
        return await processSingleMember(baseInfo, effectiveRangeFrom, effectiveRangeEndForFetch, currentSystemTimeForFetch, fetchedAllJiraIssues);
      } catch (criticalError: any) {
        console.error(`TEAM OVERVIEW: CRITICAL failure processing member ${memberInit.name} (ID: ${memberInit.id}) in main processing loop. This should ideally be caught within processSingleMember.`, criticalError);
        const errorMessage = criticalError instanceof Error ? criticalError.message : String(criticalError);
        return {
          ...(initialTeamDataSetup.find(m => m.id === memberInit.id) || memberInit), // Ensure we get the original base info
          isLoadingScore: false, isLoadingActivities: false,
          scoreError: `Critical error during member processing: ${errorMessage}. Please check console.`,
          activityError: `Critical error during activity fetching or score calculation: ${errorMessage}.`,
          currentDayScoreData: null, historicalScores: [], averageHistoricalScore: null,
        };
      }
    });
    
    try {
      const processedMembers = await Promise.all(processedMembersPromises);
      setTeamData(processedMembers.sort((a,b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("TEAM OVERVIEW: Error during Promise.all for processedMembers:", error);
      // Handle situation where Promise.all itself might reject, though individual errors are caught.
      // Could update a global error state for the page.
    }
    
    setIsProcessingMembers(false);
    console.log("TEAM OVERVIEW: All members processing attempted.");
  }, [isHR, dateRange, refreshKey, processSingleMember, fetchActivitiesForDay, calculateDailyScore]);


  useEffect(() => {
    fetchAllDataAndProcess();
  }, [fetchAllDataAndProcess]); // Dependencies are now managed by useCallback for fetchAllDataAndProcess

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
    const newTo = isEqual(startOfDay(day), startOfDay(new Date())) ? new Date() : endOfDay(day);
    setDateRange(prev => {
        const currentFrom = prev?.from || startOfDay(subDays(newTo, 6)); 
        const newFrom = newTo < currentFrom ? startOfDay(newTo) : currentFrom;
        return { from: newFrom, to: newTo };
    });
  };
  
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
    const activityDayEnd = isEqual(startOfDay(dateRange.to), startOfDay(new Date())) 
                            ? new Date() 
                            : endOfDay(dateRange.to);

    console.log(`TEAM_OVERVIEW (Dialog): Fetching activities for ${memberToView.name} for date ${format(activityDayStart, 'yyyy-MM-dd')} up to ${format(activityDayEnd, 'HH:mm:ss')}`);

    const { activities: activitiesForDialog, error: fetchErrorForDialog } = await fetchActivitiesForDay(
        memberToView.id,
        memberToView.email,
        activityDayStart,
        activityDayEnd,
        allJiraIssues 
    );
    
    setDetailedActivities(activitiesForDialog);
    setDetailedActivitiesError(fetchErrorForDialog);
    setIsLoadingDetailedActivities(false);
  }, [dateRange?.to, fetchActivitiesForDay, allJiraIssues]);


  const handleCloseUserDetailsDialog = () => {
    setSelectedUserForDetails(null);
    setDetailedActivities([]);
    setIsLoadingDetailedActivities(false);
    setDetailedActivitiesError(null);
  };

  const handleRetryMemberProcessing = useCallback(async (memberId: string) => {
    console.log(`TEAM OVERVIEW: Retrying data processing for member ID: ${memberId}`);
    const memberToRetry = teamData.find(m => m.id === memberId);

    if (memberToRetry && dateRange?.from && dateRange?.to && allJiraIssues !== undefined) { // allJiraIssues can be null if global fetch failed
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

      try {
        const updatedMember = await processSingleMember(baseMemberInfo, startOfDay(dateRange.from), effectiveRangeEndForRetry, currentSystemTimeForRetry, allJiraIssues);
        setTeamData(prevTeamData =>
          prevTeamData.map(m =>
            m.id === memberId ? updatedMember : m
          ).sort((a, b) => a.name.localeCompare(b.name))
        );
      } catch (retryError: any) {
         console.error(`TEAM OVERVIEW: CRITICAL failure during retry for member ${memberId}.`, retryError);
         const errorMessage = retryError instanceof Error ? retryError.message : String(retryError);
         setTeamData(prevTeamData =>
            prevTeamData.map(m =>
                m.id === memberId ? { 
                    ...m, 
                    isLoadingScore: false, 
                    isLoadingActivities: false, 
                    scoreError: `Retry failed: ${errorMessage}`,
                    activityError: `Retry activity fetch failed: ${errorMessage}`
                } : m
            )
         );
      }
    } else {
      console.error(`TEAM OVERVIEW: Could not find member with ID ${memberId} to retry, or date range not set, or global Jira issues not loaded.`);
    }
  }, [teamData, processSingleMember, dateRange, allJiraIssues]);


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
             Score for the End Date is based on activities for that full day (or up to current time if End Date is today and refreshed).
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
                  disabled={(date) => date < (dateRange?.from || subDays(new Date(),90)) || date > new Date()}
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
              Historical trend shows daily scores for up to {NUMBER_OF_HISTORICAL_DAYS_FOR_TREND} prior days within the selected Start Date. Jira issues are fetched globally for the selected date range once per refresh.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      
      {isHR && isLoadingAllJiraIssues && (
        <Alert variant="default" className="shadow-md border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />
          <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Fetching All Jira Issues</AlertTitle>
          <AlertDescription className="text-blue-600 dark:text-blue-500">Loading all assigned Jira issues for the selected date range: {dateRange?.from ? format(dateRange.from, 'MMM d') : ''} - {dateRange?.to ? format(dateRange.to, 'MMM d') : ''}...</AlertDescription>
        </Alert>
      )}
      {isHR && allJiraIssuesError && !isLoadingAllJiraIssues && (
        <Alert variant="destructive" className="shadow-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Error Fetching Jira Issues</AlertTitle>
          <AlertDescription>{allJiraIssuesError} Ensure Jira API is configured & service running. Scores will be based on Teams data only.</AlertDescription>
        </Alert>
      )}
      {isHR && !isLoadingAllJiraIssues && !allJiraIssuesError && isLoadingUsers && ( 
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
      {isHR && !isLoadingAllJiraIssues && !isLoadingUsers && !userFetchError && !isProcessingMembers && teamData.length > 0 && !teamData.some(m => m.isLoadingScore || m.isLoadingActivities) && (
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

    
