
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
  type CalculateFragmentationScoreInput
} from "@/ai/flows/calculate-fragmentation-score";
import type { TeamMemberFocus, GenericActivityItem, MicrosoftGraphUser } from "@/lib/types";

export default function TeamOverviewPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'hr';
  const [teamData, setTeamData] = useState<TeamMemberFocus[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(isHR); 
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  const [isProcessingMembers, setIsProcessingMembers] = useState(false); // Combined state for activity fetching and score calculation

  const fetchActivitiesAndCalculateScore = useCallback(async (member: TeamMemberFocus): Promise<TeamMemberFocus> => {
    let combinedActivities: GenericActivityItem[] = [];
    let activityError: string | null = null;

    try {
      console.log(`Fetching activities for ${member.name} (ID: ${member.id}, Email: ${member.email})`);
      
      // Fetch Jira Activities
      if (member.email) {
        try {
          const jiraResponse = await fetch(`/api/jira/issues?userEmail=${encodeURIComponent(member.email)}`);
          if (jiraResponse.ok) {
            const jiraActivities: GenericActivityItem[] = await jiraResponse.json();
            combinedActivities.push(...jiraActivities);
            console.log(`Fetched ${jiraActivities.length} Jira activities for ${member.name}`);
          } else {
            const errorData = await jiraResponse.json();
            const jiraError = `Jira API error (${jiraResponse.status}): ${errorData.error || 'Failed to fetch Jira issues.'}`;
            console.warn(jiraError, `User: ${member.name}`);
            activityError = (activityError ? activityError + "\n" : "") + jiraError;
          }
        } catch (e: any) {
           const jiraCatchError = `Error fetching Jira activities for ${member.name}: ${e.message}`;
           console.error(jiraCatchError, e);
           activityError = (activityError ? activityError + "\n" : "") + jiraCatchError;
        }
      } else {
        console.log(`Skipping Jira for ${member.name} due to missing email.`);
      }

      // Fetch Teams Activities
      try {
        const teamsResponse = await fetch(`/api/teams/activity?userId=${encodeURIComponent(member.id)}`);
        if (teamsResponse.ok) {
          const teamsActivities: GenericActivityItem[] = await teamsResponse.json();
          combinedActivities.push(...teamsActivities);
          console.log(`Fetched ${teamsActivities.length} Teams activities for ${member.name}`);
        } else {
          const errorData = await teamsResponse.json();
          const teamsError = `Teams API error (${teamsResponse.status}): ${errorData.error || 'Failed to fetch Teams activities.'}`;
          console.warn(teamsError, `User: ${member.name}`);
          activityError = (activityError ? activityError + "\n" : "") + teamsError;
        }
      } catch (e: any) {
        const teamsCatchError = `Error fetching Teams activities for ${member.name}: ${e.message}`;
        console.error(teamsCatchError, e);
        activityError = (activityError ? activityError + "\n" : "") + teamsCatchError;
      }
      
      console.log(`Total activities fetched for ${member.name}: ${combinedActivities.length}`);
      
      if (combinedActivities.length === 0 && !activityError) {
         console.log(`No activities found for ${member.name} from any source.`);
         // Optional: Create a specific 'no_activity' activity item to inform the AI
         // combinedActivities.push({ type: 'no_activity_found', timestamp: new Date().toISOString(), source: 'other', details: 'No activities retrieved from Jira or Teams.' });
      }


      // Calculate Fragmentation Score
      const input: CalculateFragmentationScoreInput = {
        userId: member.id,
        activityWindowDays: 7, 
        activities: combinedActivities,
      };
      console.log(`Requesting score calculation for ${member.name} (ID: ${member.id}) with ${combinedActivities.length} activities.`);
      const result = await calculateFragmentationScore(input);
      console.log(`Score calculated for ${member.name} (ID: ${member.id}):`, result.fragmentationScore, "Risk:", result.riskLevel);
      return {
        ...member,
        aiCalculatedScore: result.fragmentationScore,
        aiSummary: result.summary,
        aiRiskLevel: result.riskLevel,
        isLoadingScore: false,
        scoreError: null,
        activities: combinedActivities,
        activityError: activityError,
        isLoadingActivities: false,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to calculate score for ${member.name}.`;
      console.error(`Error processing member ${member.name} (ID: ${member.id}):`, errorMessage, err);
      return {
        ...member,
        isLoadingScore: false,
        scoreError: errorMessage,
        aiSummary: `Error calculating score: ${errorMessage.substring(0, 100)}`,
        aiRiskLevel: "High" as "Low" | "Moderate" | "High", // Default on error
        aiCalculatedScore: 0, 
        activities: combinedActivities, // Still include fetched activities if any
        activityError: (activityError ? activityError + "\n" : "") + `Score calc error: ${errorMessage.substring(0,100)}`,
        isLoadingActivities: false,
      };
    }
  }, []);


  useEffect(() => {
    if (isHR) {
      const fetchGraphUsersAndProcess = async () => {
        setIsLoadingUsers(true);
        setUserFetchError(null);
        setTeamData([]);
        setIsProcessingMembers(true); // Start processing state

        try {
          const response = await fetch("/api/microsoft-graph/users");
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch MS Graph users: ${response.statusText}`);
          }
          const msUsers: MicrosoftGraphUser[] = await response.json();
          
          const validMsUsers = msUsers.filter(msUser => {
            if (!msUser.id) {
              console.warn(`Microsoft Graph user data missing ID. User Principal Name: ${msUser.userPrincipalName || 'N/A'}. This user will be skipped.`);
              return false;
            }
            if (!msUser.userPrincipalName) {
                console.warn(`Microsoft Graph user data missing User Principal Name (email). User ID: ${msUser.id}. Jira activities might be unavailable.`);
                // We can still proceed if ID is present, but Jira might fail.
            }
            return true;
          });

          if (validMsUsers.length === 0) {
            const errorMsg = msUsers.length > 0 ? "Fetched users from MS Graph, but none had a valid 'id' field. Check MS Graph API response structure or permissions." : "No users found in Microsoft Graph. Ensure users exist and the API is returning them correctly with an 'id' field.";
            setUserFetchError(errorMsg);
            setIsLoadingUsers(false);
            setIsProcessingMembers(false);
            return;
          }

          const initialTeamData: TeamMemberFocus[] = validMsUsers.map(msUser => ({
            id: msUser.id, 
            name: msUser.displayName || msUser.userPrincipalName || "Unknown User",
            email: msUser.userPrincipalName || "", // Ensure email is string
            role: (msUser.userPrincipalName?.toLowerCase().includes('hr')) ? 'hr' : 'developer', 
            lastWeekTrend: 0, // Default, can be calculated later
            avatarUrl: `https://placehold.co/100x100.png?text=${(msUser.displayName || msUser.userPrincipalName || "U")?.[0]?.toUpperCase()}`,
            isLoadingScore: true, 
            isLoadingActivities: true,
            scoreError: null,
            activityError: null,
          }));
          setTeamData(initialTeamData); // Set initial data with loading states
          setIsLoadingUsers(false); // Finished fetching users

          // Now process each member for activities and scores
          const processedTeamData = await Promise.all(
            initialTeamData.map(member => fetchActivitiesAndCalculateScore(member))
          );
          setTeamData(processedTeamData);

        } catch (err: any) {
          console.error("Error fetching MS Graph users or processing members:", err);
          setUserFetchError(err.message || "An unknown error occurred while fetching or processing users.");
          setIsLoadingUsers(false);
        } finally {
            setIsProcessingMembers(false); // All processing done or errored
        }
      };
      fetchGraphUsersAndProcess();
    }
  }, [isHR, fetchActivitiesAndCalculateScore]);
  
  const teamStats = teamData.reduce((acc, member) => {
    if (member.isLoadingScore || !member.aiRiskLevel) return acc;
    const riskLevel = member.aiRiskLevel;
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
                Visualize your team's cognitive load using live activity data.
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
            To protect individual privacy, detailed fragmentation scores are only visible to HR personnel.
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
          <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Processing Team Data</AlertTitle>
          <AlertDescription className="text-blue-600 dark:text-blue-500">
            Fetching activities from Jira & Teams and calculating AI fragmentation scores. This may take a moment for each team member...
             ({teamData.filter(m => m.isLoadingScore || m.isLoadingActivities).length} members remaining)
          </AlertDescription>
        </Alert>
      )}
      
      {isHR && !isLoadingUsers && !userFetchError && !isProcessingMembers && teamData.length > 0 && (
         <Alert variant="default" className="shadow-md border-green-500/50 text-green-700 dark:border-green-400/50 dark:text-green-400">
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-500" />
          <AlertTitle className="font-semibold text-green-700 dark:text-green-400">Team Data Processed</AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-500">
            Activity fetching and AI score calculations are complete for all team members.
            Some members might have errors if their data couldn't be fetched or processed (check individual cards).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stable Members</CardTitle>
            <Users className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{teamStats.stable}</div>
            <p className="text-xs text-muted-foreground">Low fragmentation, good focus</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk Members</CardTitle>
            <Users className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{teamStats.atRisk}</div>
            <p className="text-xs text-muted-foreground">Moderate fragmentation</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overloaded Members</CardTitle>
            <Users className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{teamStats.overloaded}</div>
            <p className="text-xs text-muted-foreground">High fragmentation</p>
          </CardContent>
        </Card>
      </div>
      
       <Alert variant="default" className="border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400 shadow-sm">
        <ExternalLink className="h-5 w-5 text-blue-600 dark:text-blue-500" />
        <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Integration Notes & Permissions</AlertTitle>
        <AlertDescription className="text-blue-600 dark:text-blue-500 space-y-1">
          <p>
            For Jira integration: Ensure `JIRA_INSTANCE_URL`, `JIRA_USERNAME` (email), and `JIRA_API_TOKEN` are correctly set in your `.env` file. The user's email from Microsoft Graph (`userPrincipalName`) is used to query Jira issues.
          </p>
          <p>
            For Microsoft Teams/M365 activity: Ensure your Azure App Registration has the following Microsoft Graph API permissions granted (Application type) with admin consent: `User.Read.All`, `Presence.Read.All`, and `Calendars.Read`.
          </p>
          <p>
            If activity data or scores are missing for a user, check the server console logs for specific errors related to API calls for that user.
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
            {isHR ? "Detailed view of each team member's AI-calculated focus status using live data from Microsoft Graph, Jira, and Teams." : "Overview of team member stability (details restricted)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isHR && !isLoadingUsers && !userFetchError && teamData.length === 0 && !isProcessingMembers && (
             <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Users Found or Processed</AlertTitle>
              <AlertDescription>
                No users were returned from Microsoft Graph, or none could be processed. Check your MS Graph configuration and API permissions. Also, review server logs for errors during user fetching or activity processing.
              </AlertDescription>
            </Alert>
          )}
          {teamData.map((member) => (
            <TeamMemberCard key={member.id} member={member} showDetailedScore={isHR} />
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
